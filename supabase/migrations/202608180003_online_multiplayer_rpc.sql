-- Lobby lifecycle plus the authorization move from "host owns the game" to
-- "caller owns this seat". The second half re-declares the existing turn RPCs
-- with the new rule; their signatures and return shapes are unchanged.

create function public.generate_join_code()
returns text
language sql
volatile
set search_path = ''
as $$
  -- No O/0/I/1: the code gets read out loud across a room.
  select string_agg(
    substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::integer, 1),
    ''
  )
  from generate_series(1, 6);
$$;

-- Same order as the client's SEAT_COLORS/SEAT_AVATARS, so an online table looks
-- exactly like a local one and no two seats share a colour.
create function public.seat_color(p_seat smallint)
returns text
language sql
immutable
set search_path = ''
as $$
  select (array['violet', 'blue', 'lime', 'orange', 'pink', 'cyan'])[p_seat];
$$;

create function public.seat_avatar(p_seat smallint)
returns text
language sql
immutable
set search_path = ''
as $$
  select (array['🦊', '🐼', '🐯', '🐸', '🦉', '🐙'])[p_seat];
$$;

create function public.game_state(p_game_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_game public.games%rowtype;
  v_players jsonb;
  v_self_seat smallint;
  v_last_turn jsonb;
begin
  if v_owner is null then raise exception using errcode = '42501', message = 'UNAUTHORIZED'; end if;
  if not public.is_game_member(p_game_id) then
    raise exception using errcode = '42501', message = 'GAME_NOT_OWNED';
  end if;

  select * into v_game from public.games where id = p_game_id;

  select coalesce(jsonb_agg(entry order by seat), '[]'::jsonb), min(self_seat)
  into v_players, v_self_seat
  from (
    select
      gp.seat,
      case when gp.owner_id = v_owner then gp.seat end as self_seat,
      jsonb_build_object(
        'id', p.id,
        'profileId', p.id,
        'gamePlayerId', gp.id,
        'seat', gp.seat,
        'name', p.name,
        'avatar', p.avatar,
        'color', p.color,
        'score', gp.match_score,
        'totalXp', p.total_xp,
        'level', public.level_for_xp(p.total_xp),
        'streak', p.current_streak,
        'ready', gp.ready,
        'left', gp.left_at is not null,
        'isSelf', gp.owner_id = v_owner
      ) as entry
    from public.game_players gp
    join public.player_profiles p on p.id = gp.player_id
    where gp.game_id = p_game_id
  ) rows;

  -- Spectators follow the table through this: it is how a phone that is not
  -- playing learns the active deadline and the result of someone else's turn.
  select jsonb_build_object(
    'turnId', t.id,
    'seat', gp.seat,
    'round', t.round,
    'status', t.status,
    'deadlineAt', t.deadline_at,
    'prompt', q.prompt,
    'result', t.result
  ) into v_last_turn
  from public.turns t
  join public.game_players gp on gp.id = t.game_player_id
  join public.quests q on q.id = t.quest_id
  where t.game_id = p_game_id
  order by t.prepared_at desc
  limit 1;

  return jsonb_build_object(
    'gameId', v_game.id,
    'mode', v_game.mode,
    'status', v_game.status,
    'joinCode', v_game.join_code,
    'lobbyOpen', v_game.lobby_open,
    'currentRound', v_game.current_round,
    'currentSeat', v_game.current_seat,
    'isHost', v_game.host_id = v_owner,
    'selfSeat', v_self_seat,
    'players', v_players,
    'lastTurn', v_last_turn
  );
end;
$$;

create function public.create_online_game(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_profile public.player_profiles%rowtype;
  v_game_id uuid;
  v_code text;
  v_attempt integer := 0;
begin
  if v_owner is null then raise exception using errcode = '42501', message = 'UNAUTHORIZED'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 24 then
    raise exception using errcode = '22023', message = 'INVALID_PLAYER';
  end if;

  insert into public.player_profiles (owner_id, device_slot, name, avatar, color)
  values (v_owner, 1, trim(p_name), public.seat_avatar(1::smallint), public.seat_color(1::smallint))
  on conflict (owner_id, device_slot) do update set
    name = excluded.name, avatar = excluded.avatar, color = excluded.color
  returning * into v_profile;

  -- Six characters over a 32-symbol alphabet; a handful of retries is plenty
  -- even with every lobby this project will ever run open at once.
  loop
    v_attempt := v_attempt + 1;
    v_code := public.generate_join_code();
    begin
      insert into public.games (owner_id, host_id, mode, join_code, lobby_open)
      values (v_owner, v_owner, 'online', v_code, true)
      returning id into v_game_id;
      exit;
    exception when unique_violation then
      if v_attempt >= 10 then
        raise exception using errcode = '22023', message = 'JOIN_CODE_UNAVAILABLE';
      end if;
    end;
  end loop;

  insert into public.game_players (game_id, player_id, seat, owner_id, mode)
  values (v_game_id, v_profile.id, 1, v_owner, 'online');

  return public.game_state(v_game_id);
end;
$$;

create function public.join_game(p_join_code text, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_profile public.player_profiles%rowtype;
  v_game public.games%rowtype;
  v_seat smallint;
  v_existing public.game_players%rowtype;
begin
  if v_owner is null then raise exception using errcode = '42501', message = 'UNAUTHORIZED'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 24 then
    raise exception using errcode = '22023', message = 'INVALID_PLAYER';
  end if;

  -- Locking the lobby row is what makes concurrent joins pick distinct seats.
  select * into v_game from public.games
  where join_code = upper(trim(coalesce(p_join_code, ''))) and mode = 'online'
  for update;
  if v_game.id is null then raise exception using errcode = '22023', message = 'GAME_NOT_FOUND'; end if;
  if v_game.status <> 'active' then raise exception using errcode = '22023', message = 'GAME_NOT_FOUND'; end if;

  select * into v_existing from public.game_players
  where game_id = v_game.id and owner_id = v_owner;
  if v_existing.id is not null then
    -- Rejoining after a dropped connection keeps the original seat and score.
    update public.game_players set left_at = null where id = v_existing.id;
    update public.player_profiles set name = trim(p_name)
    where id = v_existing.player_id;
    return public.game_state(v_game.id);
  end if;

  if not v_game.lobby_open then
    raise exception using errcode = '22023', message = 'LOBBY_CLOSED';
  end if;

  select coalesce(min(candidate), 0)::smallint into v_seat
  from generate_series(1, 6) candidate
  where not exists (
    select 1 from public.game_players gp
    where gp.game_id = v_game.id and gp.seat = candidate
  );
  if v_seat = 0 then raise exception using errcode = '22023', message = 'LOBBY_FULL'; end if;

  insert into public.player_profiles (owner_id, device_slot, name, avatar, color)
  values (v_owner, 1, trim(p_name), public.seat_avatar(v_seat), public.seat_color(v_seat))
  on conflict (owner_id, device_slot) do update set
    name = excluded.name, avatar = excluded.avatar, color = excluded.color
  returning * into v_profile;

  insert into public.game_players (game_id, player_id, seat, owner_id, mode)
  values (v_game.id, v_profile.id, v_seat, v_owner, 'online');

  return public.game_state(v_game.id);
end;
$$;

create function public.set_player_ready(p_game_id uuid, p_ready boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
begin
  if v_owner is null then raise exception using errcode = '42501', message = 'UNAUTHORIZED'; end if;
  update public.game_players set ready = coalesce(p_ready, false)
  where game_id = p_game_id and owner_id = v_owner;
  if not found then raise exception using errcode = '42501', message = 'GAME_NOT_OWNED'; end if;
  return public.game_state(p_game_id);
end;
$$;

create function public.leave_game(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_game public.games%rowtype;
begin
  if v_owner is null then raise exception using errcode = '42501', message = 'UNAUTHORIZED'; end if;
  select * into v_game from public.games where id = p_game_id for update;
  if v_game.id is null then raise exception using errcode = '22023', message = 'GAME_NOT_FOUND'; end if;

  if v_game.host_id = v_owner and v_game.lobby_open then
    -- A host leaving an unstarted lobby ends it; nobody else can start it.
    update public.games set status = 'abandoned', lobby_open = false, completed_at = clock_timestamp()
    where id = p_game_id;
    return jsonb_build_object('gameId', p_game_id, 'status', 'abandoned');
  end if;

  update public.game_players set left_at = clock_timestamp(), ready = false
  where game_id = p_game_id and owner_id = v_owner and left_at is null;
  if not found then raise exception using errcode = '42501', message = 'GAME_NOT_OWNED'; end if;

  -- Seats stay allocated so the score survives a reconnect; the pointer skips
  -- players who left when it next advances.
  return jsonb_build_object('gameId', p_game_id, 'status', v_game.status);
end;
$$;

create function public.start_online_game(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_game public.games%rowtype;
  v_seats integer;
begin
  if v_owner is null then raise exception using errcode = '42501', message = 'UNAUTHORIZED'; end if;
  select * into v_game from public.games where id = p_game_id for update;
  if v_game.id is null or v_game.host_id <> v_owner then
    raise exception using errcode = '42501', message = 'GAME_NOT_OWNED';
  end if;
  if v_game.status <> 'active' then raise exception using errcode = '22023', message = 'GAME_NOT_ACTIVE'; end if;

  select count(*) into v_seats from public.game_players
  where game_id = p_game_id and left_at is null;
  if v_seats < 2 then raise exception using errcode = '22023', message = 'NOT_ENOUGH_PLAYERS'; end if;

  if v_game.lobby_open then
    update public.games
    set lobby_open = false,
        current_round = 1,
        current_seat = (
          select min(seat) from public.game_players
          where game_id = p_game_id and left_at is null
        ),
        started_at = clock_timestamp()
    where id = p_game_id;
  end if;

  return public.game_state(p_game_id);
end;
$$;

create function public.advance_turn_pointer(
  p_game_id uuid,
  p_from_round smallint,
  p_from_seat smallint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_game public.games%rowtype;
  v_next_seat smallint;
begin
  if v_owner is null then raise exception using errcode = '42501', message = 'UNAUTHORIZED'; end if;
  if not public.is_game_member(p_game_id) then
    raise exception using errcode = '42501', message = 'GAME_NOT_OWNED';
  end if;

  select * into v_game from public.games where id = p_game_id for update;
  if v_game.id is null then raise exception using errcode = '22023', message = 'GAME_NOT_FOUND'; end if;

  -- Compare-and-swap: two phones reporting the same finished turn advance the
  -- pointer once. A caller holding a stale pointer just reads the current one.
  if v_game.current_round <> p_from_round or v_game.current_seat <> p_from_seat then
    return public.game_state(p_game_id);
  end if;
  if exists (
    select 1 from public.turns
    where game_id = p_game_id and status in ('prepared', 'active')
  ) then
    raise exception using errcode = '22023', message = 'TURN_STILL_OPEN';
  end if;

  select min(gp.seat) into v_next_seat
  from public.game_players gp
  where gp.game_id = p_game_id and gp.left_at is null and gp.seat > v_game.current_seat;

  if v_next_seat is not null then
    update public.games set current_seat = v_next_seat where id = p_game_id;
  elsif v_game.current_round < 5 then
    update public.games
    set current_round = v_game.current_round + 1,
        current_seat = (
          select min(seat) from public.game_players
          where game_id = p_game_id and left_at is null
        )
    where id = p_game_id;
  else
    update public.game_players ranked
    set final_rank = standings.rank
    from (
      select id, dense_rank() over (order by match_score desc)::smallint as rank
      from public.game_players where game_id = p_game_id
    ) standings
    where ranked.id = standings.id;

    update public.games
    set status = 'completed', current_round = 5, completed_at = clock_timestamp()
    where id = p_game_id;
  end if;

  return public.game_state(p_game_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Existing turn RPCs, re-authorized by seat ownership.
-- ---------------------------------------------------------------------------

create or replace function public.create_game(p_players jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_game_id uuid;
  v_player jsonb;
  v_profile public.player_profiles%rowtype;
  v_players jsonb := '[]'::jsonb;
  v_count integer;
begin
  if v_owner is null then raise exception using errcode = '42501', message = 'UNAUTHORIZED'; end if;
  if jsonb_typeof(p_players) <> 'array' then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
  end if;
  v_count := jsonb_array_length(p_players);
  if v_count < 1 or v_count > 6 then
    raise exception using errcode = '22023', message = 'INVALID_PLAYER_COUNT';
  end if;

  insert into public.games (owner_id, host_id, mode)
  values (v_owner, v_owner, 'local')
  returning id into v_game_id;

  for v_player in select value from jsonb_array_elements(p_players)
  loop
    if (v_player->>'seat')::integer not between 1 and 6
       or char_length(trim(v_player->>'name')) not between 1 and 24 then
      raise exception using errcode = '22023', message = 'INVALID_PLAYER';
    end if;

    insert into public.player_profiles (owner_id, device_slot, name, avatar, color)
    values (
      v_owner,
      (v_player->>'seat')::smallint,
      trim(v_player->>'name'),
      left(v_player->>'avatar', 16),
      v_player->>'color'
    )
    on conflict (owner_id, device_slot) do update set
      name = excluded.name,
      avatar = excluded.avatar,
      color = excluded.color
    returning * into v_profile;

    insert into public.game_players (game_id, player_id, seat, owner_id, mode)
    values (v_game_id, v_profile.id, (v_player->>'seat')::smallint, v_owner, 'local');

    v_players := v_players || jsonb_build_array(jsonb_build_object(
      'id', v_profile.id,
      'profileId', v_profile.id,
      'seat', v_profile.device_slot,
      'name', v_profile.name,
      'avatar', v_profile.avatar,
      'color', v_profile.color,
      'score', 0,
      'totalXp', v_profile.total_xp,
      'level', public.level_for_xp(v_profile.total_xp),
      'streak', v_profile.current_streak
    ));
  end loop;

  return jsonb_build_object('gameId', v_game_id, 'players', v_players);
end;
$$;

create or replace function public.prepare_turn(
  p_game_id uuid,
  p_player_id uuid,
  p_round smallint,
  p_background_classes text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_difficulty public.quest_difficulty;
  v_game public.games%rowtype;
  v_game_player public.game_players%rowtype;
  v_quest public.quests%rowtype;
  v_turn_id uuid;
begin
  if v_owner is null then raise exception using errcode = '42501', message = 'UNAUTHORIZED'; end if;
  if p_round not between 1 and 5 then raise exception using errcode = '22023', message = 'INVALID_ROUND'; end if;

  select gp.* into v_game_player
  from public.game_players gp
  join public.games g on g.id = gp.game_id
  where g.id = p_game_id and g.status = 'active'
    and gp.player_id = p_player_id and gp.owner_id = v_owner and gp.left_at is null;
  if v_game_player.id is null then raise exception using errcode = '42501', message = 'GAME_NOT_OWNED'; end if;
  select * into v_game from public.games where id = p_game_id;

  -- Online games take their order from the server pointer, so a phone cannot
  -- prepare a turn out of sequence or while the lobby is still open.
  if v_game.mode = 'online'
     and (v_game.lobby_open or v_game.current_round <> p_round or v_game.current_seat <> v_game_player.seat) then
    raise exception using errcode = '22023', message = 'NOT_YOUR_TURN';
  end if;

  v_difficulty := case
    when p_round in (1, 2) then 'easy'::public.quest_difficulty
    when p_round in (3, 4) then 'medium'::public.quest_difficulty
    else 'hard'::public.quest_difficulty
  end;

  select q.* into v_quest
  from public.quests q
  where q.active and q.difficulty = v_difficulty
    and not exists (
      select 1 from public.turns previous
      where previous.game_id = p_game_id and previous.player_id = p_player_id
        and previous.quest_id = q.id
    )
  order by
    case when q.target_class = any(coalesce(p_background_classes, '{}')) then 1 else 0 end,
    random()
  limit 1;
  if v_quest.id is null then raise exception using errcode = '22023', message = 'NO_QUEST_AVAILABLE'; end if;

  update public.games
  set current_round = greatest(current_round, p_round)
  where id = p_game_id;

  insert into public.turns (game_id, game_player_id, player_id, quest_id, round, retry_count)
  values (
    p_game_id,
    v_game_player.id,
    p_player_id,
    v_quest.id,
    p_round,
    case when exists (
      select 1 from public.turns previous
      where previous.game_id = p_game_id
        and previous.player_id = p_player_id
        and previous.round = p_round
        and previous.status = 'aborted'
        and previous.retry_count = 1
    ) then 1 else 0 end
  )
  returning id into v_turn_id;

  return jsonb_build_object(
    'turnId', v_turn_id,
    'challenge', jsonb_build_object(
      'id', v_quest.id,
      'kind', v_quest.kind,
      'label', v_quest.label,
      'prompt', v_quest.prompt,
      'difficulty', v_quest.difficulty,
      'targetClass', v_quest.target_class,
      'fingerCount', v_quest.finger_count,
      'color', v_quest.target_color,
      'hex', v_quest.hex,
      'validatorConfig', v_quest.validator_config
    )
  );
end;
$$;

create or replace function public.activate_turn(p_turn_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_turn public.turns%rowtype;
begin
  select t.* into v_turn
  from public.turns t
  join public.game_players gp on gp.id = t.game_player_id
  where t.id = p_turn_id and gp.owner_id = (select auth.uid())
  for update of t;
  if v_turn.id is null then raise exception using errcode = '42501', message = 'TURN_NOT_OWNED'; end if;

  if v_turn.status = 'prepared' then
    update public.turns
    set status = 'active', started_at = v_now, deadline_at = v_now + interval '30 seconds'
    where id = p_turn_id
    returning * into v_turn;
  elsif v_turn.status <> 'active' then
    raise exception using errcode = '22023', message = 'TURN_NOT_ACTIVATABLE';
  end if;

  return jsonb_build_object(
    'turnId', v_turn.id,
    'startedAt', v_turn.started_at,
    'deadlineAt', v_turn.deadline_at,
    'serverNow', v_now
  );
end;
$$;

create or replace function public.expire_turn(p_turn_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_turn public.turns%rowtype;
  v_player public.player_profiles%rowtype;
  v_game_player public.game_players%rowtype;
  v_quest public.quests%rowtype;
  v_remaining integer;
  v_is_seat_owner boolean;
begin
  select t.* into v_turn
  from public.turns t
  where t.id = p_turn_id and public.is_game_member(t.game_id)
  for update of t;
  if v_turn.id is null then raise exception using errcode = '42501', message = 'TURN_NOT_OWNED'; end if;
  select gp.owner_id = v_owner into v_is_seat_owner
  from public.game_players gp where gp.id = v_turn.game_player_id;
  if v_turn.status in ('passed', 'timed_out') then return jsonb_build_object('outcome', v_turn.result); end if;
  if v_turn.status <> 'active' then raise exception using errcode = '22023', message = 'TURN_NOT_ACTIVE'; end if;

  v_remaining := ceil(extract(epoch from (v_turn.deadline_at - clock_timestamp())) * 1000)::integer;
  if v_remaining > 0 then return jsonb_build_object('remainingMs', v_remaining); end if;
  -- Any member may clear a turn that is five seconds past its deadline, so a
  -- phone that dropped mid-turn cannot freeze the table.
  if not v_is_seat_owner and v_remaining > -5000 then
    raise exception using errcode = '42501', message = 'TURN_NOT_OWNED';
  end if;

  select * into v_player from public.player_profiles where id = v_turn.player_id;
  select * into v_game_player from public.game_players where id = v_turn.game_player_id;
  select * into v_quest from public.quests where id = v_turn.quest_id;

  if v_turn.vision_attempt_count = 0 and v_turn.retry_count = 0 then
    update public.turns set status = 'aborted', retry_count = 1, resolved_at = clock_timestamp(),
      result = jsonb_build_object('retryAllowed', true)
    where id = p_turn_id;
    return jsonb_build_object('outcome', jsonb_build_object(
      'turnId', v_turn.id, 'playerId', v_turn.player_id, 'playerName', v_player.name,
      'playerColor', v_player.color, 'challengeId', v_turn.quest_id,
      'challengePrompt', v_quest.prompt, 'success', false, 'timeMs', 30000,
      'points', 0, 'xp', 0, 'totalAfter', v_game_player.match_score,
      'totalXp', v_player.total_xp, 'level', public.level_for_xp(v_player.total_xp),
      'streak', v_player.current_streak,
      'unlockedAchievementIds', '[]'::jsonb, 'systemError', true, 'retryAllowed', true
    ));
  end if;

  update public.player_profiles set current_streak = 0 where id = v_turn.player_id returning * into v_player;
  update public.turns set status = 'timed_out', resolved_at = clock_timestamp(), elapsed_ms = 30000,
    result = jsonb_build_object(
      'turnId', id, 'playerId', player_id, 'playerName', v_player.name,
      'playerColor', v_player.color, 'challengeId', quest_id,
      'challengePrompt', v_quest.prompt,
      'success', false, 'timeMs', 30000, 'points', 0, 'xp', 0,
      'totalAfter', v_game_player.match_score, 'totalXp', v_player.total_xp,
      'level', public.level_for_xp(v_player.total_xp), 'streak', 0,
      'unlockedAchievementIds', '[]'::jsonb
    )
  where id = p_turn_id returning * into v_turn;
  return jsonb_build_object('outcome', v_turn.result);
end;
$$;

create or replace function public.complete_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The host closes an online table; a local game is closed by its owner.
  if not exists (
    select 1 from public.games
    where id = p_game_id and host_id = (select auth.uid()) and status = 'active'
  ) then
    raise exception using errcode = '42501', message = 'GAME_NOT_OWNED';
  end if;

  update public.game_players ranked
  set final_rank = standings.rank
  from (
    select id, dense_rank() over (order by match_score desc)::smallint as rank
    from public.game_players where game_id = p_game_id
  ) standings
  where ranked.id = standings.id;

  update public.games
  set status = 'completed', current_round = 5, completed_at = clock_timestamp()
  where id = p_game_id;
end;
$$;

create or replace function public.abandon_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.games
  set status = 'abandoned', lobby_open = false, completed_at = clock_timestamp()
  where id = p_game_id and host_id = (select auth.uid()) and status = 'active';
  if not found then
    raise exception using errcode = '42501', message = 'GAME_NOT_OWNED';
  end if;

  update public.turns
  set status = 'aborted', resolved_at = clock_timestamp(),
      result = jsonb_build_object('reason', 'game_abandoned')
  where game_id = p_game_id and status in ('prepared', 'active');
end;
$$;

revoke all on function public.generate_join_code() from public, anon, authenticated;
revoke all on function public.game_state(uuid) from public, anon;
revoke all on function public.seat_color(smallint) from public, anon, authenticated;
revoke all on function public.seat_avatar(smallint) from public, anon, authenticated;
revoke all on function public.create_online_game(text) from public, anon;
revoke all on function public.join_game(text, text) from public, anon;
revoke all on function public.set_player_ready(uuid, boolean) from public, anon;
revoke all on function public.leave_game(uuid) from public, anon;
revoke all on function public.start_online_game(uuid) from public, anon;
revoke all on function public.advance_turn_pointer(uuid, smallint, smallint) from public, anon;

grant execute on function public.game_state(uuid) to authenticated;
grant execute on function public.create_online_game(text) to authenticated;
grant execute on function public.join_game(text, text) to authenticated;
grant execute on function public.set_player_ready(uuid, boolean) to authenticated;
grant execute on function public.leave_game(uuid) to authenticated;
grant execute on function public.start_online_game(uuid) to authenticated;
grant execute on function public.advance_turn_pointer(uuid, smallint, smallint) to authenticated;

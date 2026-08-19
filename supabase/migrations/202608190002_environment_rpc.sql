-- The host picks the room once, at creation, and every turn of that game draws
-- only from it. The signatures gain the parameter, so the old one-argument
-- versions are dropped rather than left behind to be called by accident.

drop function public.create_game(jsonb);
drop function public.create_online_game(text);

create function public.create_game(
  p_players jsonb,
  p_environment public.game_environment default 'home'
)
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

  insert into public.games (owner_id, host_id, mode, environment)
  values (v_owner, v_owner, 'local', p_environment)
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

  return jsonb_build_object(
    'gameId', v_game_id,
    'environment', p_environment,
    'players', v_players
  );
end;
$$;

create function public.create_online_game(
  p_name text,
  p_environment public.game_environment default 'home'
)
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

  loop
    v_attempt := v_attempt + 1;
    v_code := public.generate_join_code();
    begin
      insert into public.games (owner_id, host_id, mode, join_code, lobby_open, environment)
      values (v_owner, v_owner, 'online', v_code, true, p_environment)
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

create or replace function public.game_state(p_game_id uuid)
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
    'environment', v_game.environment,
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
  v_existing public.turns%rowtype;
  v_quest public.quests%rowtype;
  v_turn_id uuid;
begin
  if v_owner is null then raise exception using errcode = '42501', message = 'UNAUTHORIZED'; end if;
  if p_round not between 1 and 5 then raise exception using errcode = '22023', message = 'INVALID_ROUND'; end if;

  -- Authorization follows the seat, so an online table cannot have one phone
  -- preparing another player's turn. Locking it also serializes retries.
  select gp.* into v_game_player
  from public.game_players gp
  join public.games g on g.id = gp.game_id
  where g.id = p_game_id and g.status = 'active'
    and gp.player_id = p_player_id and gp.owner_id = v_owner and gp.left_at is null
  for update of gp;
  if v_game_player.id is null then raise exception using errcode = '42501', message = 'GAME_NOT_OWNED'; end if;

  select * into v_game from public.games where id = p_game_id;
  if v_game.mode = 'online'
     and (v_game.lobby_open
          or v_game.current_round <> p_round
          or v_game.current_seat <> v_game_player.seat) then
    raise exception using errcode = '22023', message = 'NOT_YOUR_TURN';
  end if;

  select t.* into v_existing
  from public.turns t
  where t.game_id = p_game_id
    and t.game_player_id = v_game_player.id
    and t.round = p_round
    and t.status in ('prepared', 'active')
  order by t.prepared_at desc
  limit 1;

  if v_existing.id is not null then
    select * into v_quest from public.quests where id = v_existing.quest_id;
    return jsonb_build_object(
      'turnId', v_existing.id,
      'challenge', jsonb_build_object(
        'id', v_quest.id,
        'kind', v_quest.kind,
        'label', v_quest.label,
        'prompt', v_quest.prompt,
        'difficulty', v_quest.difficulty,
        'targetClass', v_quest.target_class,
        'color', v_quest.target_color,
        'hex', v_quest.hex,
        'validatorConfig', v_quest.validator_config
      )
    );
  end if;

  v_difficulty := case
    when p_round in (1, 2) then 'easy'::public.quest_difficulty
    when p_round in (3, 4) then 'medium'::public.quest_difficulty
    else 'hard'::public.quest_difficulty
  end;

  -- The room the host chose is a hard filter: a kitchen quest must never be
  -- drawn for a game being played in a schoolyard.
  select q.* into v_quest
  from public.quests q
  where q.active and q.difficulty = v_difficulty
    and v_game.environment = any (q.environments)
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
      'color', v_quest.target_color,
      'hex', v_quest.hex,
      'validatorConfig', v_quest.validator_config
    )
  );
end;
$$;

revoke all on function public.create_game(jsonb, public.game_environment) from public, anon;
revoke all on function public.create_online_game(text, public.game_environment) from public, anon;
grant execute on function public.create_game(jsonb, public.game_environment) to authenticated;
grant execute on function public.create_online_game(text, public.game_environment) to authenticated;

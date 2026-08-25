-- Online Mimic Rush: a server-authoritative Face Bomb match built on the
-- existing lobby, membership, presence, rematch and private spectator channel.
-- Solo /pose-party is intentionally independent from these tables.

create type public.game_kind as enum ('camera_quest', 'mimic_rush');

alter table public.games
  add column game_kind public.game_kind not null default 'camera_quest';

create table public.mimic_matches (
  game_id uuid primary key references public.games(id) on delete cascade,
  initial_player_count smallint not null check (initial_player_count between 2 and 6),
  turn_number integer not null default 0 check (turn_number >= 0),
  challenge_seed smallint not null check (challenge_seed between 0 and 11),
  current_duration_ms integer not null default 7000
    check (current_duration_ms between 4000 and 7000),
  created_at timestamptz not null default clock_timestamp()
);

create table public.mimic_player_states (
  game_player_id uuid primary key references public.game_players(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  lives smallint not null default 3 check (lives between 0 and 3),
  eliminated_at timestamptz,
  unique (game_id, game_player_id)
);

create index mimic_player_states_game_lives_idx
  on public.mimic_player_states (game_id, lives);

create table public.mimic_turns (
  id uuid primary key default extensions.gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  game_player_id uuid not null references public.game_players(id) on delete cascade,
  turn_number integer not null check (turn_number >= 0),
  challenge_id text not null check (char_length(challenge_id) between 8 and 64),
  status text not null default 'prepared'
    check (status in ('prepared', 'active', 'passed', 'failed')),
  duration_ms integer not null check (duration_ms between 4000 and 7000),
  prepared_at timestamptz not null default clock_timestamp(),
  started_at timestamptz,
  deadline_at timestamptz,
  resolved_at timestamptz,
  success boolean,
  lives_after smallint check (lives_after between 0 and 3),
  unique (game_id, turn_number),
  check (
    (status = 'prepared' and started_at is null and deadline_at is null and resolved_at is null)
    or (status = 'active' and started_at is not null and deadline_at is not null and resolved_at is null)
    or (status in ('passed', 'failed') and resolved_at is not null and success is not null)
  )
);

create index mimic_turns_game_status_idx on public.mimic_turns (game_id, status);
create index mimic_turns_game_player_id_idx on public.mimic_turns (game_player_id);
create unique index mimic_turns_one_open_idx
  on public.mimic_turns (game_id)
  where status in ('prepared', 'active');

alter table public.mimic_matches enable row level security;
alter table public.mimic_player_states enable row level security;
alter table public.mimic_turns enable row level security;

revoke all on public.mimic_matches, public.mimic_player_states, public.mimic_turns
  from public, anon, authenticated;
grant select on public.mimic_matches, public.mimic_player_states, public.mimic_turns
  to authenticated;

create policy mimic_matches_member_select on public.mimic_matches
for select to authenticated using (public.is_game_member(game_id));

create policy mimic_player_states_member_select on public.mimic_player_states
for select to authenticated using (public.is_game_member(game_id));

create policy mimic_turns_member_select on public.mimic_turns
for select to authenticated using (public.is_game_member(game_id));

do $$
declare
  v_table text;
begin
  foreach v_table in array array['mimic_matches', 'mimic_player_states', 'mimic_turns'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end;
$$;

create function public.mimic_challenge_at(p_seed smallint, p_turn_number integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select (array[
    'fusion_smile_wink_left',
    'fusion_smile_wink_right',
    'fusion_surprise_brow',
    'fusion_kiss_eyes',
    'fusion_frown_squint',
    'fusion_smile_brow',
    'fusion_smile_tilt_left',
    'fusion_surprise_turn_right',
    'fusion_kiss_tilt_right',
    'fusion_frown_turn_left',
    'fusion_brow_nod_up',
    'fusion_squint_nod_down'
  ])[1 + ((p_seed::integer + p_turn_number) % 12)];
$$;

create function public.mimic_turn_duration(
  p_initial_player_count smallint,
  p_turn_number integer
)
returns integer
language sql
immutable
set search_path = ''
as $$
  -- Every full lap removes half a second, but the match never becomes a
  -- reaction-time lottery below four seconds.
  select greatest(
    4000,
    7000 - (greatest(0, p_turn_number) / greatest(2, p_initial_player_count)) * 500
  )::integer;
$$;

create function public.create_online_game(
  p_name text,
  p_environment public.game_environment,
  p_game_kind public.game_kind
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
  values (
    v_owner, 1, trim(p_name),
    public.seat_avatar(1::smallint), public.seat_color(1::smallint)
  )
  on conflict (owner_id, device_slot) do update set
    name = excluded.name,
    avatar = excluded.avatar,
    color = excluded.color
  returning * into v_profile;

  loop
    v_attempt := v_attempt + 1;
    v_code := public.generate_join_code();
    begin
      insert into public.games (
        owner_id, host_id, mode, join_code, lobby_open, environment, game_kind
      ) values (
        v_owner, v_owner, 'online', v_code, true, p_environment, p_game_kind
      ) returning id into v_game_id;
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

create or replace function public.start_online_game(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_game public.games%rowtype;
  v_seats integer;
  v_ready integer;
  v_first_seat smallint;
  v_seed smallint;
  v_first_player uuid;
begin
  if v_owner is null then raise exception using errcode = '42501', message = 'UNAUTHORIZED'; end if;
  select * into v_game from public.games where id = p_game_id for update;
  if v_game.id is null or v_game.host_id <> v_owner then
    raise exception using errcode = '42501', message = 'GAME_NOT_OWNED';
  end if;
  if v_game.status <> 'active' then
    raise exception using errcode = '22023', message = 'GAME_NOT_ACTIVE';
  end if;
  if not v_game.lobby_open then return public.game_state(p_game_id); end if;

  select count(*), count(*) filter (where ready)
  into v_seats, v_ready
  from public.game_players
  where game_id = p_game_id and left_at is null;

  if v_seats < 2 then
    raise exception using errcode = '22023', message = 'NOT_ENOUGH_PLAYERS';
  end if;
  if v_game.game_kind = 'mimic_rush' and v_ready <> v_seats then
    raise exception using errcode = '22023', message = 'PLAYERS_NOT_READY';
  end if;

  select min(seat) into v_first_seat
  from public.game_players
  where game_id = p_game_id and left_at is null;

  update public.games
  set lobby_open = false,
      current_round = 1,
      current_seat = v_first_seat,
      started_at = clock_timestamp()
  where id = p_game_id;

  if v_game.game_kind = 'mimic_rush' then
    v_seed := floor(random() * 12)::smallint;

    insert into public.mimic_matches (
      game_id, initial_player_count, turn_number, challenge_seed, current_duration_ms
    ) values (p_game_id, v_seats::smallint, 0, v_seed, 7000);

    insert into public.mimic_player_states (game_player_id, game_id)
    select id, p_game_id
    from public.game_players
    where game_id = p_game_id and left_at is null;

    select id into v_first_player
    from public.game_players
    where game_id = p_game_id and seat = v_first_seat;

    insert into public.mimic_turns (
      game_id, game_player_id, turn_number, challenge_id, duration_ms
    ) values (
      p_game_id,
      v_first_player,
      0,
      public.mimic_challenge_at(v_seed, 0),
      7000
    );
  end if;

  return public.game_state(p_game_id);
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
  v_rematch_ready_count integer;
  v_rematch_player_count integer;
  v_self_rematch_ready boolean;
  v_mimic_turn jsonb;
  v_mimic_last_result jsonb;
  v_mimic_winner smallint;
  v_mimic_state jsonb;
begin
  if v_owner is null then raise exception using errcode = '42501', message = 'UNAUTHORIZED'; end if;
  if not public.is_game_member(p_game_id) then
    raise exception using errcode = '42501', message = 'GAME_NOT_OWNED';
  end if;

  select * into v_game from public.games where id = p_game_id;
  if v_game.id is null then raise exception using errcode = '22023', message = 'GAME_NOT_FOUND'; end if;

  if v_game.rematch_game_id is not null then
    return public.game_state(v_game.rematch_game_id);
  end if;

  select
    coalesce(jsonb_agg(entry order by seat), '[]'::jsonb),
    min(self_seat),
    count(*) filter (where not left),
    count(*) filter (where not left and rematch_ready),
    coalesce(bool_or(rematch_ready) filter (where is_self), false)
  into
    v_players,
    v_self_seat,
    v_rematch_player_count,
    v_rematch_ready_count,
    v_self_rematch_ready
  from (
    select
      gp.seat,
      gp.left_at is not null as left,
      gp.rematch_ready,
      gp.owner_id = v_owner as is_self,
      case when gp.owner_id = v_owner then gp.seat end as self_seat,
      jsonb_strip_nulls(jsonb_build_object(
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
        'connected', gp.left_at is null
          and gp.last_seen_at >= clock_timestamp() - interval '15 seconds',
        'isHost', gp.owner_id = v_game.host_id,
        'isSelf', gp.owner_id = v_owner,
        'mimicLives', mps.lives,
        'mimicEliminated', case
          when mps.game_player_id is not null then mps.lives = 0
        end
      )) as entry
    from public.game_players gp
    join public.player_profiles p on p.id = gp.player_id
    left join public.mimic_player_states mps on mps.game_player_id = gp.id
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

  if v_game.game_kind = 'mimic_rush' then
    select jsonb_build_object(
      'turnId', mt.id,
      'turnNumber', mt.turn_number,
      'seat', gp.seat,
      'challengeId', mt.challenge_id,
      'status', mt.status,
      'preparedAt', mt.prepared_at,
      'deadlineAt', mt.deadline_at,
      'durationMs', mt.duration_ms
    ) into v_mimic_turn
    from public.mimic_turns mt
    join public.game_players gp on gp.id = mt.game_player_id
    where mt.game_id = p_game_id
      and mt.status in ('prepared', 'active')
    order by mt.turn_number desc
    limit 1;

    select jsonb_build_object(
      'turnId', mt.id,
      'seat', gp.seat,
      'challengeId', mt.challenge_id,
      'success', mt.success,
      'livesAfter', mt.lives_after
    ) into v_mimic_last_result
    from public.mimic_turns mt
    join public.game_players gp on gp.id = mt.game_player_id
    where mt.game_id = p_game_id
      and mt.status in ('passed', 'failed')
    order by mt.turn_number desc
    limit 1;

    if v_game.status = 'completed' then
      select gp.seat into v_mimic_winner
      from public.mimic_player_states mps
      join public.game_players gp on gp.id = mps.game_player_id
      where mps.game_id = p_game_id and mps.lives > 0 and gp.left_at is null
      order by gp.seat
      limit 1;
    end if;

    v_mimic_state := jsonb_build_object(
      'turn', v_mimic_turn,
      'lastResult', v_mimic_last_result,
      'winnerSeat', v_mimic_winner,
      'serverNow', clock_timestamp()
    );
  end if;

  return jsonb_build_object(
    'gameId', v_game.id,
    'mode', v_game.mode,
    'gameKind', v_game.game_kind,
    'status', v_game.status,
    'environment', v_game.environment,
    'joinCode', v_game.join_code,
    'lobbyOpen', v_game.lobby_open,
    'currentRound', v_game.current_round,
    'currentSeat', v_game.current_seat,
    'isHost', v_game.host_id = v_owner,
    'selfSeat', v_self_seat,
    'players', v_players,
    'lastTurn', v_last_turn,
    'rematchReadyCount', v_rematch_ready_count,
    'rematchPlayerCount', v_rematch_player_count,
    'selfRematchReady', v_self_rematch_ready,
    'mimicBattle', v_mimic_state
  );
end;
$$;

create function public.finish_mimic_turn(p_turn_id uuid, p_success boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_turn public.mimic_turns%rowtype;
  v_game public.games%rowtype;
  v_match public.mimic_matches%rowtype;
  v_game_player public.game_players%rowtype;
  v_player_state public.mimic_player_states%rowtype;
  v_lives_after smallint;
  v_alive_count integer;
  v_next_seat smallint;
  v_next_player uuid;
  v_next_turn integer;
  v_next_duration integer;
begin
  if v_owner is null then raise exception using errcode = '42501', message = 'UNAUTHORIZED'; end if;

  select * into v_turn from public.mimic_turns where id = p_turn_id;
  if v_turn.id is null or not public.is_game_member(v_turn.game_id) then
    raise exception using errcode = '42501', message = 'GAME_NOT_OWNED';
  end if;

  -- One lock order for pass, timeout and concurrent spectator watchdogs.
  select * into v_game from public.games where id = v_turn.game_id for update;
  select * into v_match from public.mimic_matches where game_id = v_turn.game_id for update;
  select * into v_turn from public.mimic_turns where id = p_turn_id for update;

  if v_game.status <> 'active' or v_turn.status not in ('prepared', 'active') then
    return public.game_state(v_turn.game_id);
  end if;

  select * into v_game_player
  from public.game_players
  where id = v_turn.game_player_id;

  if v_game.current_seat <> v_game_player.seat then
    return public.game_state(v_turn.game_id);
  end if;

  select * into v_player_state
  from public.mimic_player_states
  where game_player_id = v_turn.game_player_id
  for update;

  if coalesce(p_success, false) then
    v_lives_after := v_player_state.lives;
  else
    v_lives_after := case
      when v_game_player.left_at is not null then 0
      else greatest(0, v_player_state.lives - 1)
    end::smallint;
    update public.mimic_player_states
    set lives = v_lives_after,
        eliminated_at = case
          when v_lives_after = 0 then coalesce(eliminated_at, clock_timestamp())
          else eliminated_at
        end
    where game_player_id = v_turn.game_player_id;
  end if;

  update public.mimic_turns
  set status = case when coalesce(p_success, false) then 'passed' else 'failed' end,
      resolved_at = clock_timestamp(),
      success = coalesce(p_success, false),
      lives_after = v_lives_after
  where id = p_turn_id;

  select count(*) into v_alive_count
  from public.mimic_player_states mps
  join public.game_players gp on gp.id = mps.game_player_id
  where mps.game_id = v_turn.game_id
    and mps.lives > 0
    and gp.left_at is null;

  if v_alive_count <= 1 then
    update public.games
    set status = 'completed',
        lobby_open = false,
        completed_at = clock_timestamp()
    where id = v_turn.game_id;

    update public.game_players gp
    set final_rank = 1
    from public.mimic_player_states mps
    where gp.id = mps.game_player_id
      and mps.game_id = v_turn.game_id
      and mps.lives > 0
      and gp.left_at is null;

    return public.game_state(v_turn.game_id);
  end if;

  select min(gp.seat) into v_next_seat
  from public.mimic_player_states mps
  join public.game_players gp on gp.id = mps.game_player_id
  where mps.game_id = v_turn.game_id
    and mps.lives > 0
    and gp.left_at is null
    and gp.seat > v_game_player.seat;

  if v_next_seat is null then
    select min(gp.seat) into v_next_seat
    from public.mimic_player_states mps
    join public.game_players gp on gp.id = mps.game_player_id
    where mps.game_id = v_turn.game_id
      and mps.lives > 0
      and gp.left_at is null;
  end if;

  select id into v_next_player
  from public.game_players
  where game_id = v_turn.game_id and seat = v_next_seat;

  v_next_turn := v_match.turn_number + 1;
  v_next_duration := public.mimic_turn_duration(
    v_match.initial_player_count,
    v_next_turn
  );

  update public.mimic_matches
  set turn_number = v_next_turn,
      current_duration_ms = v_next_duration
  where game_id = v_turn.game_id;

  update public.games
  set current_seat = v_next_seat
  where id = v_turn.game_id;

  insert into public.mimic_turns (
    game_id, game_player_id, turn_number, challenge_id, duration_ms
  ) values (
    v_turn.game_id,
    v_next_player,
    v_next_turn,
    public.mimic_challenge_at(v_match.challenge_seed, v_next_turn),
    v_next_duration
  );

  return public.game_state(v_turn.game_id);
end;
$$;

create function public.activate_mimic_turn(p_turn_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_turn public.mimic_turns%rowtype;
  v_game public.games%rowtype;
  v_game_player public.game_players%rowtype;
begin
  if v_owner is null then raise exception using errcode = '42501', message = 'UNAUTHORIZED'; end if;
  select * into v_turn from public.mimic_turns where id = p_turn_id;
  if v_turn.id is null then raise exception using errcode = '22023', message = 'GAME_NOT_FOUND'; end if;

  select * into v_game from public.games where id = v_turn.game_id for update;
  select * into v_turn from public.mimic_turns where id = p_turn_id for update;
  select * into v_game_player from public.game_players where id = v_turn.game_player_id;

  if v_game_player.owner_id <> v_owner or v_game.current_seat <> v_game_player.seat then
    raise exception using errcode = '42501', message = 'NOT_YOUR_TURN';
  end if;
  if v_turn.status = 'active' then return public.game_state(v_turn.game_id); end if;
  if v_turn.status <> 'prepared' then return public.game_state(v_turn.game_id); end if;
  if v_turn.prepared_at + interval '30 seconds' <= clock_timestamp()
     or v_game_player.left_at is not null then
    return public.finish_mimic_turn(p_turn_id, false);
  end if;

  update public.mimic_turns
  set status = 'active',
      started_at = clock_timestamp(),
      deadline_at = clock_timestamp() + make_interval(secs => duration_ms::double precision / 1000)
  where id = p_turn_id and status = 'prepared';

  return public.game_state(v_turn.game_id);
end;
$$;

create function public.pass_mimic_turn(p_turn_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_turn public.mimic_turns%rowtype;
  v_game public.games%rowtype;
  v_game_player public.game_players%rowtype;
begin
  if v_owner is null then raise exception using errcode = '42501', message = 'UNAUTHORIZED'; end if;
  select * into v_turn from public.mimic_turns where id = p_turn_id;
  if v_turn.id is null then raise exception using errcode = '22023', message = 'GAME_NOT_FOUND'; end if;

  select * into v_game from public.games where id = v_turn.game_id for update;
  select * into v_turn from public.mimic_turns where id = p_turn_id for update;
  select * into v_game_player from public.game_players where id = v_turn.game_player_id;

  if v_game_player.owner_id <> v_owner or v_game.current_seat <> v_game_player.seat then
    raise exception using errcode = '42501', message = 'NOT_YOUR_TURN';
  end if;
  if v_turn.status <> 'active' then return public.game_state(v_turn.game_id); end if;
  if v_turn.deadline_at <= clock_timestamp() then
    return public.finish_mimic_turn(p_turn_id, false);
  end if;

  return public.finish_mimic_turn(p_turn_id, true);
end;
$$;

create function public.expire_mimic_turn(p_turn_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_turn public.mimic_turns%rowtype;
  v_game public.games%rowtype;
  v_game_player public.game_players%rowtype;
  v_disconnected boolean;
begin
  if v_owner is null then raise exception using errcode = '42501', message = 'UNAUTHORIZED'; end if;
  select * into v_turn from public.mimic_turns where id = p_turn_id;
  if v_turn.id is null or not public.is_game_member(v_turn.game_id) then
    raise exception using errcode = '42501', message = 'GAME_NOT_OWNED';
  end if;

  select * into v_game from public.games where id = v_turn.game_id for update;
  select * into v_turn from public.mimic_turns where id = p_turn_id for update;
  select * into v_game_player from public.game_players where id = v_turn.game_player_id;

  if v_game.status <> 'active' or v_turn.status not in ('prepared', 'active') then
    return public.game_state(v_turn.game_id);
  end if;

  v_disconnected := v_game_player.left_at is not null
    or v_game_player.last_seen_at < clock_timestamp() - interval '15 seconds';

  if v_turn.status = 'prepared'
     and not v_disconnected
     and v_turn.prepared_at + interval '30 seconds' > clock_timestamp() then
    return public.game_state(v_turn.game_id);
  end if;

  if v_turn.status = 'active'
     and not v_disconnected
     and v_turn.deadline_at > clock_timestamp() then
    return public.game_state(v_turn.game_id);
  end if;

  return public.finish_mimic_turn(p_turn_id, false);
end;
$$;

create function public.inherit_rematch_game_kind()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.rematch_of is not null then
    new.game_kind := (
      select game_kind from public.games where id = new.rematch_of
    );
  end if;
  return new;
end;
$$;

create trigger games_inherit_rematch_game_kind
before insert on public.games
for each row execute function public.inherit_rematch_game_kind();

revoke all on function public.mimic_challenge_at(smallint, integer)
  from public, anon, authenticated;
revoke all on function public.mimic_turn_duration(smallint, integer)
  from public, anon, authenticated;
revoke all on function public.finish_mimic_turn(uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.inherit_rematch_game_kind()
  from public, anon, authenticated;
revoke all on function public.create_online_game(
  text, public.game_environment, public.game_kind
) from public, anon;
revoke all on function public.activate_mimic_turn(uuid) from public, anon;
revoke all on function public.pass_mimic_turn(uuid) from public, anon;
revoke all on function public.expire_mimic_turn(uuid) from public, anon;

grant execute on function public.create_online_game(
  text, public.game_environment, public.game_kind
) to authenticated;
grant execute on function public.activate_mimic_turn(uuid) to authenticated;
grant execute on function public.pass_mimic_turn(uuid) to authenticated;
grant execute on function public.expire_mimic_turn(uuid) to authenticated;

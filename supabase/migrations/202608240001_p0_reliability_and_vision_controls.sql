-- P0 reliability controls:
--   * presence-backed host migration
--   * an immutable, single-creation rematch protocol
--   * one-time calibration tickets and distributed vision quotas
--   * a database-backed vision kill switch

alter table public.game_players
  add column last_seen_at timestamptz not null default clock_timestamp(),
  add column rematch_ready boolean not null default false;

alter table public.games
  add column rematch_of uuid references public.games(id) on delete set null,
  add column rematch_game_id uuid references public.games(id) on delete set null;

create unique index games_one_rematch_idx
  on public.games (rematch_of)
  where rematch_of is not null;

create index games_rematch_game_id_idx
  on public.games (rematch_game_id)
  where rematch_game_id is not null;

create index game_players_presence_idx
  on public.game_players (game_id, last_seen_at desc)
  where left_at is null;

create table public.vision_service_controls (
  service text primary key check (service ~ '^[a-z0-9_-]{1,40}$'),
  enabled boolean not null default true,
  reason text not null default '',
  updated_at timestamptz not null default clock_timestamp()
);

insert into public.vision_service_controls (service, enabled)
values ('vision', true);

create table public.vision_rate_buckets (
  bucket_key text primary key check (char_length(bucket_key) between 16 and 160),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  expires_at timestamptz not null
);

create index vision_rate_buckets_expiry_idx
  on public.vision_rate_buckets (expires_at);

create table public.vision_tickets (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  purpose text not null check (purpose = 'calibrate'),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);

create index vision_tickets_owner_expiry_idx
  on public.vision_tickets (owner_id, expires_at desc);

create index vision_tickets_game_id_idx
  on public.vision_tickets (game_id);

alter table public.vision_service_controls enable row level security;
alter table public.vision_rate_buckets enable row level security;
alter table public.vision_tickets enable row level security;

-- No table policies are intentional: clients use the ticket RPC, while only
-- the service role may consume tickets, read the kill switch, or claim quota.
revoke all on public.vision_service_controls, public.vision_rate_buckets,
  public.vision_tickets from public, anon, authenticated;

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
begin
  if v_owner is null then raise exception using errcode = '42501', message = 'UNAUTHORIZED'; end if;
  if not public.is_game_member(p_game_id) then
    raise exception using errcode = '42501', message = 'GAME_NOT_OWNED';
  end if;

  select * into v_game from public.games where id = p_game_id;
  if v_game.id is null then raise exception using errcode = '22023', message = 'GAME_NOT_FOUND'; end if;

  -- A completed match remains immutable. Once its rematch exists, stale
  -- subscribers are redirected to the new authoritative lobby snapshot.
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
        'connected', gp.left_at is null
          and gp.last_seen_at >= clock_timestamp() - interval '15 seconds',
        'isHost', gp.owner_id = v_game.host_id,
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
    'lastTurn', v_last_turn,
    'rematchReadyCount', v_rematch_ready_count,
    'rematchPlayerCount', v_rematch_player_count,
    'selfRematchReady', v_self_rematch_ready
  );
end;
$$;

create function public.heartbeat_game(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_game public.games%rowtype;
  v_next_host uuid;
begin
  if v_owner is null then raise exception using errcode = '42501', message = 'UNAUTHORIZED'; end if;
  select * into v_game from public.games where id = p_game_id for update;
  if v_game.id is null then raise exception using errcode = '22023', message = 'GAME_NOT_FOUND'; end if;

  update public.game_players
  set last_seen_at = clock_timestamp()
  where game_id = p_game_id and owner_id = v_owner and left_at is null;
  if not found then raise exception using errcode = '42501', message = 'GAME_NOT_OWNED'; end if;

  if not exists (
    select 1 from public.game_players gp
    where gp.game_id = p_game_id
      and gp.owner_id = v_game.host_id
      and gp.left_at is null
      and gp.last_seen_at >= clock_timestamp() - interval '15 seconds'
  ) then
    select gp.owner_id into v_next_host
    from public.game_players gp
    where gp.game_id = p_game_id
      and gp.left_at is null
      and gp.last_seen_at >= clock_timestamp() - interval '15 seconds'
    order by gp.seat
    limit 1;
    if v_next_host is not null then
      update public.games set host_id = v_next_host where id = p_game_id;
    end if;
  end if;

  return public.game_state(p_game_id);
end;
$$;

create or replace function public.leave_game(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_game public.games%rowtype;
  v_next_host uuid;
begin
  if v_owner is null then raise exception using errcode = '42501', message = 'UNAUTHORIZED'; end if;
  select * into v_game from public.games where id = p_game_id for update;
  if v_game.id is null then raise exception using errcode = '22023', message = 'GAME_NOT_FOUND'; end if;

  update public.game_players
  set left_at = clock_timestamp(), ready = false, rematch_ready = false
  where game_id = p_game_id and owner_id = v_owner and left_at is null;
  if not found then raise exception using errcode = '42501', message = 'GAME_NOT_OWNED'; end if;

  select gp.owner_id into v_next_host
  from public.game_players gp
  where gp.game_id = p_game_id and gp.left_at is null
  order by gp.seat
  limit 1;

  if v_next_host is null then
    update public.games
    set status = case when status = 'active' then 'abandoned'::public.game_status else status end,
        lobby_open = false,
        completed_at = coalesce(completed_at, clock_timestamp())
    where id = p_game_id;
    update public.turns
    set status = 'aborted', resolved_at = clock_timestamp(),
        result = jsonb_build_object('reason', 'game_abandoned')
    where game_id = p_game_id and status in ('prepared', 'active');
    return jsonb_build_object('gameId', p_game_id, 'status', 'abandoned');
  end if;

  if v_game.host_id = v_owner then
    update public.games set host_id = v_next_host where id = p_game_id;
  end if;
  return jsonb_build_object('gameId', p_game_id, 'status', v_game.status);
end;
$$;

create function public.request_rematch(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_game public.games%rowtype;
  v_new_game_id uuid;
  v_new_host uuid;
  v_code text;
  v_attempt integer := 0;
  v_player_count integer;
  v_ready_count integer;
begin
  if v_owner is null then raise exception using errcode = '42501', message = 'UNAUTHORIZED'; end if;
  select * into v_game from public.games where id = p_game_id for update;
  if v_game.id is null then raise exception using errcode = '22023', message = 'GAME_NOT_FOUND'; end if;
  if v_game.mode <> 'online' or v_game.status <> 'completed' then
    raise exception using errcode = '22023', message = 'REMATCH_NOT_AVAILABLE';
  end if;
  if v_game.rematch_game_id is not null then return public.game_state(v_game.rematch_game_id); end if;

  update public.game_players
  set rematch_ready = true, last_seen_at = clock_timestamp()
  where game_id = p_game_id and owner_id = v_owner and left_at is null;
  if not found then raise exception using errcode = '42501', message = 'GAME_NOT_OWNED'; end if;

  -- Phones that disappeared at the results screen must not hold everybody
  -- hostage. They can still join the newly opened room through its invite.
  update public.game_players
  set left_at = clock_timestamp(), ready = false, rematch_ready = false
  where game_id = p_game_id and left_at is null
    and last_seen_at < clock_timestamp() - interval '15 seconds';

  select count(*), count(*) filter (where rematch_ready)
  into v_player_count, v_ready_count
  from public.game_players
  where game_id = p_game_id and left_at is null;

  if v_player_count < 2 or v_ready_count < v_player_count then
    return public.game_state(p_game_id);
  end if;

  select coalesce(
    (
      select gp.owner_id from public.game_players gp
      where gp.game_id = p_game_id and gp.left_at is null
        and gp.owner_id = v_game.host_id
      limit 1
    ),
    (
      select gp.owner_id from public.game_players gp
      where gp.game_id = p_game_id and gp.left_at is null
      order by gp.seat
      limit 1
    )
  ) into v_new_host;

  loop
    v_attempt := v_attempt + 1;
    v_code := public.generate_join_code();
    begin
      insert into public.games (
        owner_id, host_id, mode, join_code, lobby_open, environment, rematch_of
      ) values (
        v_new_host, v_new_host, 'online', v_code, true, v_game.environment, p_game_id
      ) returning id into v_new_game_id;
      exit;
    exception when unique_violation then
      -- A concurrent request can only win the rematch_of unique index once.
      select id into v_new_game_id from public.games where rematch_of = p_game_id;
      if v_new_game_id is not null then exit; end if;
      if v_attempt >= 10 then
        raise exception using errcode = '22023', message = 'JOIN_CODE_UNAVAILABLE';
      end if;
    end;
  end loop;

  insert into public.game_players (
    game_id, player_id, seat, owner_id, mode, last_seen_at
  )
  select v_new_game_id, gp.player_id, gp.seat, gp.owner_id, 'online', clock_timestamp()
  from public.game_players gp
  where gp.game_id = p_game_id and gp.left_at is null
  on conflict do nothing;

  -- Flatten the chain so even an old results-screen subscription reaches the
  -- newest lobby in one lookup instead of recursively walking every rematch.
  update public.games
  set rematch_game_id = v_new_game_id
  where id = p_game_id or rematch_game_id = p_game_id;

  return public.game_state(v_new_game_id);
end;
$$;

create function public.issue_vision_ticket(
  p_game_id uuid,
  p_purpose text default 'calibrate'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_ticket public.vision_tickets%rowtype;
begin
  if v_owner is null then raise exception using errcode = '42501', message = 'UNAUTHORIZED'; end if;
  if p_purpose <> 'calibrate' then
    raise exception using errcode = '22023', message = 'INVALID_VISION_PURPOSE';
  end if;
  if not exists (
    select 1 from public.games g
    where g.id = p_game_id and g.status = 'active' and public.is_game_member(g.id)
  ) then
    raise exception using errcode = '42501', message = 'GAME_NOT_OWNED';
  end if;

  insert into public.vision_tickets (owner_id, game_id, purpose, expires_at)
  values (v_owner, p_game_id, p_purpose, clock_timestamp() + interval '45 seconds')
  returning * into v_ticket;
  return jsonb_build_object('ticket', v_ticket.id, 'expiresAt', v_ticket.expires_at);
end;
$$;

create function public.recover_disconnected_turn(p_turn_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_turn public.turns%rowtype;
  v_seat public.game_players%rowtype;
  v_game public.games%rowtype;
  v_expiry jsonb;
begin
  if v_owner is null then raise exception using errcode = '42501', message = 'UNAUTHORIZED'; end if;
  select * into v_turn from public.turns where id = p_turn_id;
  if v_turn.id is null or not public.is_game_member(v_turn.game_id) then
    raise exception using errcode = '42501', message = 'TURN_NOT_OWNED';
  end if;

  -- Match heartbeat/leave/rematch lock order: game, then seat, then turn.
  select * into v_game from public.games where id = v_turn.game_id for update;
  select * into v_seat from public.game_players where id = v_turn.game_player_id for update;
  v_expiry := public.expire_turn(p_turn_id);
  select * into v_turn from public.turns where id = p_turn_id;

  -- Only a phone that stopped heartbeating is removed. A connected player who
  -- merely timed out keeps their seat and controls their normal result screen.
  if v_turn.status <> 'active'
     and v_seat.left_at is null
     and v_game.current_round = v_turn.round
     and v_game.current_seat = v_seat.seat
     and v_seat.last_seen_at < clock_timestamp() - interval '15 seconds' then
    update public.game_players
    set left_at = clock_timestamp(), ready = false
    where id = v_seat.id and left_at is null;

    -- Heartbeat performs the same locked host election before the CAS pointer
    -- move. Calling it as the recovering member also refreshes that member.
    perform public.heartbeat_game(v_turn.game_id);
    return public.advance_turn_pointer(
      v_turn.game_id,
      v_game.current_round,
      v_game.current_seat
    );
  end if;

  return public.game_state(v_turn.game_id) || jsonb_build_object('expiry', v_expiry);
end;
$$;

create function public.consume_vision_ticket(
  p_ticket uuid,
  p_owner_id uuid,
  p_purpose text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_consumed uuid;
begin
  update public.vision_tickets
  set consumed_at = clock_timestamp()
  where id = p_ticket
    and owner_id = p_owner_id
    and purpose = p_purpose
    and consumed_at is null
    and expires_at > clock_timestamp()
  returning id into v_consumed;
  return v_consumed is not null;
end;
$$;

create function public.claim_vision_budget(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_count integer;
begin
  if char_length(coalesce(p_bucket_key, '')) not between 16 and 160
     or p_limit not between 1 and 10000
     or p_window_seconds not between 1 and 3600 then
    raise exception using errcode = '22023', message = 'INVALID_RATE_BUCKET';
  end if;

  insert into public.vision_rate_buckets (
    bucket_key, window_started_at, request_count, expires_at
  ) values (
    p_bucket_key, v_now, 1, v_now + make_interval(secs => p_window_seconds)
  )
  on conflict (bucket_key) do update set
    window_started_at = case
      when public.vision_rate_buckets.expires_at <= v_now then v_now
      else public.vision_rate_buckets.window_started_at
    end,
    request_count = case
      when public.vision_rate_buckets.expires_at <= v_now then 1
      else public.vision_rate_buckets.request_count + 1
    end,
    expires_at = case
      when public.vision_rate_buckets.expires_at <= v_now
        then v_now + make_interval(secs => p_window_seconds)
      else public.vision_rate_buckets.expires_at
    end
  returning request_count into v_count;

  -- Opportunistic bounded cleanup prevents attacker-chosen identities from
  -- turning expired quota keys into permanent database growth.
  delete from public.vision_rate_buckets
  where bucket_key in (
    select bucket_key from public.vision_rate_buckets
    where expires_at < v_now - interval '1 hour'
    order by expires_at
    limit 100
  );
  return v_count <= p_limit;
end;
$$;

create function public.vision_service_state()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'enabled', enabled,
    'reason', reason,
    'updatedAt', updated_at
  )
  from public.vision_service_controls
  where service = 'vision';
$$;

revoke all on function public.heartbeat_game(uuid) from public, anon;
revoke all on function public.request_rematch(uuid) from public, anon;
revoke all on function public.recover_disconnected_turn(uuid) from public, anon;
revoke all on function public.issue_vision_ticket(uuid, text) from public, anon;
revoke all on function public.consume_vision_ticket(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.claim_vision_budget(text, integer, integer) from public, anon, authenticated;
revoke all on function public.vision_service_state() from public, anon, authenticated;

grant execute on function public.heartbeat_game(uuid) to authenticated;
grant execute on function public.request_rematch(uuid) to authenticated;
grant execute on function public.recover_disconnected_turn(uuid) to authenticated;
grant execute on function public.issue_vision_ticket(uuid, text) to authenticated;
grant execute on function public.consume_vision_ticket(uuid, uuid, text) to service_role;
grant execute on function public.claim_vision_budget(text, integer, integer) to service_role;
grant execute on function public.vision_service_state() to service_role;

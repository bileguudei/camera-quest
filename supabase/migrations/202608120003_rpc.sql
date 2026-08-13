create function public.level_for_xp(p_total_xp integer)
returns smallint
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(max(level), 1)::smallint
  from public.levels
  where minimum_xp <= greatest(p_total_xp, 0);
$$;

create function public.create_game(p_players jsonb)
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

  insert into public.games (owner_id) values (v_owner) returning id into v_game_id;

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

    insert into public.game_players (game_id, player_id, seat)
    values (v_game_id, v_profile.id, (v_player->>'seat')::smallint);

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

create function public.prepare_turn(
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
  v_game_player_id uuid;
  v_quest public.quests%rowtype;
  v_turn_id uuid;
begin
  if v_owner is null then raise exception using errcode = '42501', message = 'UNAUTHORIZED'; end if;
  if p_round not between 1 and 5 then raise exception using errcode = '22023', message = 'INVALID_ROUND'; end if;

  select gp.id into v_game_player_id
  from public.games g
  join public.game_players gp on gp.game_id = g.id
  where g.id = p_game_id and g.owner_id = v_owner and g.status = 'active'
    and gp.player_id = p_player_id;
  if v_game_player_id is null then raise exception using errcode = '42501', message = 'GAME_NOT_OWNED'; end if;

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
    v_game_player_id,
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

create function public.activate_turn(p_turn_id uuid)
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
  join public.games g on g.id = t.game_id
  where t.id = p_turn_id and g.owner_id = (select auth.uid())
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

create function public.unlock_achievements(p_player_id uuid, p_game_id uuid, p_elapsed_ms integer)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_keys text[] := array[]::text[];
  v_streak integer;
  v_game_successes integer;
  v_color_successes integer;
  v_object_successes integer;
begin
  select current_streak into v_streak from public.player_profiles where id = p_player_id;
  select successful_turns into v_game_successes
    from public.game_players where game_id = p_game_id and player_id = p_player_id;
  select count(distinct q.target_color) into v_color_successes
    from public.player_quest_stats s join public.quests q on q.id = s.quest_id
    where s.player_id = p_player_id and s.successes > 0 and q.kind = 'color';
  select coalesce(sum(s.successes), 0) into v_object_successes
    from public.player_quest_stats s join public.quests q on q.id = s.quest_id
    where s.player_id = p_player_id and q.kind = 'object';

  insert into public.player_achievements (player_id, achievement_id)
  select p_player_id, a.id from public.achievements a
  where
    a.rule_key = 'first_clear'
    or (a.rule_key = 'quick_draw' and p_elapsed_ms < 5000)
    or (a.rule_key = 'on_fire' and v_streak >= 3)
    or (a.rule_key = 'unstoppable' and v_streak >= 10)
    or (a.rule_key = 'perfect_game' and v_game_successes >= 5)
    or (a.rule_key = 'rainbow' and v_color_successes >= 4)
    or (a.rule_key = 'object_hunter' and v_object_successes >= 25)
  on conflict do nothing;

  select coalesce(array_agg(a.key order by a.key), array[]::text[]) into v_keys
  from public.player_achievements pa
  join public.achievements a on a.id = pa.achievement_id
  where pa.player_id = p_player_id and pa.unlocked_at >= transaction_timestamp();
  return v_keys;
end;
$$;

create function public.resolve_turn(
  p_turn_id uuid,
  p_sequence_no integer,
  p_latency_ms integer,
  p_confidence real,
  p_validator text,
  p_model_version text,
  p_validator_version text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turn public.turns%rowtype;
  v_player public.player_profiles%rowtype;
  v_game_player public.game_players%rowtype;
  v_quest public.quests%rowtype;
  v_base integer;
  v_speed_pool integer;
  v_elapsed integer;
  v_points integer;
  v_achievements text[];
begin
  if p_sequence_no < 1 or p_latency_ms < 0 or p_confidence not between 0 and 1 then
    raise exception using errcode = '22023', message = 'INVALID_ATTEMPT';
  end if;

  select * into v_turn from public.turns where id = p_turn_id for update;
  if v_turn.id is null then raise exception using errcode = '22023', message = 'TURN_NOT_FOUND'; end if;

  insert into public.vision_attempts
    (turn_id, sequence_no, latency_ms, confidence, validator, decision, reason)
  values (p_turn_id, p_sequence_no, p_latency_ms, p_confidence, p_validator, 'pass', p_reason)
  on conflict (turn_id, sequence_no) do nothing;

  if v_turn.status = 'passed' then
    return v_turn.result;
  end if;
  if v_turn.status <> 'active' then raise exception using errcode = '22023', message = 'TURN_NOT_ACTIVE'; end if;
  if clock_timestamp() > v_turn.deadline_at then
    raise exception using errcode = '22023', message = 'TURN_EXPIRED';
  end if;

  select * into v_player from public.player_profiles where id = v_turn.player_id for update;
  select * into v_game_player from public.game_players where id = v_turn.game_player_id for update;
  select * into v_quest from public.quests where id = v_turn.quest_id;
  v_base := case v_quest.difficulty when 'easy' then 8 when 'medium' then 12 else 16 end;
  v_speed_pool := case v_quest.difficulty when 'easy' then 20 when 'medium' then 24 else 30 end;

  v_elapsed := least(30000, greatest(0, floor(extract(epoch from (clock_timestamp() - v_turn.started_at)) * 1000)::integer));
  v_points := v_base + round(v_speed_pool * (30000 - v_elapsed)::numeric / 30000)::integer;

  update public.game_players
  set match_score = match_score + v_points,
      earned_xp = earned_xp + v_points,
      successful_turns = successful_turns + 1
  where id = v_turn.game_player_id returning * into v_game_player;

  update public.player_profiles
  set total_xp = total_xp + v_points,
      current_streak = current_streak + 1,
      best_streak = greatest(best_streak, current_streak + 1)
  where id = v_turn.player_id returning * into v_player;

  insert into public.player_quest_stats (player_id, quest_id, successes, last_cleared_at)
  values (v_turn.player_id, v_turn.quest_id, 1, clock_timestamp())
  on conflict (player_id, quest_id) do update set
    successes = public.player_quest_stats.successes + 1,
    last_cleared_at = excluded.last_cleared_at;

  v_achievements := public.unlock_achievements(v_turn.player_id, v_turn.game_id, v_elapsed);

  update public.turns
  set status = 'passed', resolved_at = clock_timestamp(), elapsed_ms = v_elapsed,
      points = v_points, earned_xp = v_points,
      model_version = left(p_model_version, 80), validator_version = left(p_validator_version, 80),
      vision_attempt_count = vision_attempt_count + 1,
      result = jsonb_build_object(
        'turnId', id,
        'playerId', player_id,
        'playerName', v_player.name,
        'playerColor', v_player.color,
        'challengeId', quest_id,
        'challengePrompt', v_quest.prompt,
        'success', true,
        'timeMs', v_elapsed,
        'elapsedMs', v_elapsed,
        'points', v_points,
        'xp', v_points,
        'totalAfter', v_game_player.match_score,
        'totalScore', v_game_player.match_score,
        'totalXp', v_player.total_xp,
        'level', public.level_for_xp(v_player.total_xp), 'streak', v_player.current_streak,
        'unlockedAchievementIds', to_jsonb(v_achievements)
      )
  where id = p_turn_id returning * into v_turn;

  return v_turn.result;
end;
$$;

create function public.expire_turn(p_turn_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turn public.turns%rowtype;
  v_player public.player_profiles%rowtype;
  v_game_player public.game_players%rowtype;
  v_quest public.quests%rowtype;
  v_remaining integer;
begin
  select t.* into v_turn
  from public.turns t join public.games g on g.id = t.game_id
  where t.id = p_turn_id and g.owner_id = (select auth.uid())
  for update of t;
  if v_turn.id is null then raise exception using errcode = '42501', message = 'TURN_NOT_OWNED'; end if;
  if v_turn.status in ('passed', 'timed_out') then return jsonb_build_object('outcome', v_turn.result); end if;
  if v_turn.status <> 'active' then raise exception using errcode = '22023', message = 'TURN_NOT_ACTIVE'; end if;

  v_remaining := ceil(extract(epoch from (v_turn.deadline_at - clock_timestamp())) * 1000)::integer;
  if v_remaining > 0 then return jsonb_build_object('remainingMs', v_remaining); end if;

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

create function public.record_vision_attempt(
  p_turn_id uuid,
  p_sequence_no integer,
  p_latency_ms integer,
  p_confidence real,
  p_validator text,
  p_decision public.vision_decision,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer;
begin
  insert into public.vision_attempts
    (turn_id, sequence_no, latency_ms, confidence, validator, decision, reason)
  values (p_turn_id, p_sequence_no, p_latency_ms, p_confidence, left(p_validator, 80), p_decision, left(p_reason, 200))
  on conflict (turn_id, sequence_no) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 1 then
    update public.turns set vision_attempt_count = vision_attempt_count + 1 where id = p_turn_id;
  end if;
end;
$$;

create function public.complete_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.games
    where id = p_game_id and owner_id = (select auth.uid()) and status = 'active'
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

create function public.abandon_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.games
  set status = 'abandoned', completed_at = clock_timestamp()
  where id = p_game_id and owner_id = (select auth.uid()) and status = 'active';
  if not found then
    raise exception using errcode = '42501', message = 'GAME_NOT_OWNED';
  end if;

  update public.turns
  set status = 'aborted', resolved_at = clock_timestamp(),
      result = jsonb_build_object('reason', 'game_abandoned')
  where game_id = p_game_id and status in ('prepared', 'active');
end;
$$;

create function public.abort_turn(p_turn_id uuid, p_reason text default 'system_error')
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.turns
  set status = 'aborted', resolved_at = clock_timestamp(),
      result = jsonb_build_object('systemError', true, 'reason', left(p_reason, 120))
  where id = p_turn_id and status in ('prepared', 'active');
  if not found then raise exception using errcode = '22023', message = 'TURN_NOT_ABORTABLE'; end if;
end;
$$;

revoke all on function public.create_game(jsonb) from public, anon;
revoke all on function public.prepare_turn(uuid, uuid, smallint, text[]) from public, anon;
revoke all on function public.activate_turn(uuid) from public, anon;
revoke all on function public.expire_turn(uuid) from public, anon;
revoke all on function public.resolve_turn(uuid, integer, integer, real, text, text, text, text) from public, anon, authenticated;
revoke all on function public.record_vision_attempt(uuid, integer, integer, real, text, public.vision_decision, text) from public, anon, authenticated;
revoke all on function public.unlock_achievements(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.abort_turn(uuid, text) from public, anon, authenticated;
revoke all on function public.complete_game(uuid) from public, anon;
revoke all on function public.abandon_game(uuid) from public, anon;

grant execute on function public.create_game(jsonb) to authenticated;
grant execute on function public.prepare_turn(uuid, uuid, smallint, text[]) to authenticated;
grant execute on function public.activate_turn(uuid) to authenticated;
grant execute on function public.expire_turn(uuid) to authenticated;
grant execute on function public.resolve_turn(uuid, integer, integer, real, text, text, text, text) to service_role;
grant execute on function public.record_vision_attempt(uuid, integer, integer, real, text, public.vision_decision, text) to service_role;
grant execute on function public.abort_turn(uuid, text) to service_role;
grant execute on function public.complete_game(uuid) to authenticated;
grant execute on function public.abandon_game(uuid) to authenticated;

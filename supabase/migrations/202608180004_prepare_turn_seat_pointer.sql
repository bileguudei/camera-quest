-- The seat-ownership rewrite in 202608180003 was based on the original
-- prepare_turn and dropped the idempotent open-turn return added in
-- 202608140001. This restores it and keeps the online pointer gate: a duplicate
-- prepare must hand back the turn already open, never a second one.

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
        'fingerCount', v_quest.finger_count,
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

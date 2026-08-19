-- Three balance changes from play testing.
--
-- 1. Objects already standing in the room passed a turn on their own. A quest
--    now states how much of the frame the target must fill, with a much larger
--    figure when calibration already saw it — so the answer is "go and bring
--    it", not "point at the furniture behind you".
-- 2. Colour recognition asked for too much saturated area; the thresholds drop.
-- 3. The draw now favours things a player can actually fetch, and avoids
--    targets the calibration already saw unless nothing else is left.

alter table public.quests
  add column portable boolean not null default true;

comment on column public.quests.portable is
  'True when a player can pick the target up and carry it to the camera.';

update public.quests set portable = false
where key in (
  'obj-chair', 'obj-couch', 'obj-bed', 'obj-dining-table', 'obj-tv',
  'obj-refrigerator', 'obj-sink', 'obj-microwave', 'obj-oven',
  'obj-car', 'obj-bicycle', 'obj-bench', 'obj-bus', 'obj-truck',
  'obj-motorcycle', 'obj-traffic-light', 'obj-stop-sign',
  'obj-dog', 'obj-cat', 'obj-bird'
);

-- --------------------------------------------------------------------------
-- How close the target has to be.
-- --------------------------------------------------------------------------

update public.quests
set validator_config = validator_config
  || jsonb_build_object('minArea', 0.035, 'minAreaWhenSeen', 0.18)
where kind = 'object' and portable;

-- Furniture and vehicles cannot be carried, so the player walks to them; that
-- fills the frame just as much, and the bar for something already in the room
-- stays high enough that standing still cannot pass.
update public.quests
set validator_config = validator_config
  || jsonb_build_object('minArea', 0.07, 'minAreaWhenSeen', 0.22)
where kind = 'object' and not portable;

-- --------------------------------------------------------------------------
-- Colour: same anti-background rule, reachable thresholds.
-- --------------------------------------------------------------------------

update public.quests
set validator_config = validator_config || jsonb_build_object(
  'minArea', 0.016,
  'minRegionArea', 0.009,
  'saturation', 0.22,
  'value', 0.14
)
where kind = 'color';

-- --------------------------------------------------------------------------
-- Catalogue realism: drop what nobody will find here, widen what they will.
-- --------------------------------------------------------------------------

update public.quests set active = false
where key in ('obj-stop-sign', 'obj-skateboard');

-- Lunch boxes and canteens make these school quests too.
update public.quests
set environments = environments || array['school']::public.game_environment[]
where key in ('obj-apple', 'obj-banana', 'obj-orange', 'obj-spoon', 'obj-fork', 'obj-bowl')
  and not ('school' = any (environments));

insert into public.quests
  (id, key, label, prompt, kind, difficulty, target_class, environments, portable, validator_config)
values
  ('10000000-0000-4000-8000-000000000131', 'obj-carrot', 'Лууван', 'ЛУУВАН ОЛ', 'object', 'easy', 'carrot', array['home', 'school']::public.game_environment[], true, '{"consensus": 3, "confidence": 0.65, "borderlineMin": 0.45, "minArea": 0.035, "minAreaWhenSeen": 0.18}'::jsonb),
  ('10000000-0000-4000-8000-000000000132', 'obj-oven', 'Зуух', 'ЗУУХ ОЛ', 'object', 'hard', 'oven', array['home']::public.game_environment[], false, '{"consensus": 3, "confidence": 0.65, "borderlineMin": 0.45, "minArea": 0.07, "minAreaWhenSeen": 0.22}'::jsonb)
on conflict (key) do nothing;

-- --------------------------------------------------------------------------
-- Draw order: prefer what can be fetched, avoid what is already in view.
-- --------------------------------------------------------------------------

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
  v_quest_id uuid;
  v_turn_id uuid;
begin
  if v_owner is null then raise exception using errcode = '42501', message = 'UNAUTHORIZED'; end if;
  if p_round not between 1 and 5 then raise exception using errcode = '22023', message = 'INVALID_ROUND'; end if;

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

  select q.id into v_quest_id
  from public.quests q
  where q.active and q.difficulty = v_difficulty
    and v_game.environment = any (q.environments)
    and not exists (
      select 1 from public.turns previous
      where previous.game_id = p_game_id and previous.player_id = p_player_id
        and previous.quest_id = q.id
    )
  order by
    -- Something the calibration already saw is a last resort, not a draw.
    (q.target_class is not null
       and q.target_class = any (coalesce(p_background_classes, '{}'))) asc,
    -- Weighted random: a fetchable target comes up three times as often as
    -- furniture, without ever making the fixed ones unreachable.
    (-ln(random() + 1e-9) / case when q.portable then 3.0 else 1.0 end) asc
  limit 1;
  if v_quest_id is null then raise exception using errcode = '22023', message = 'NO_QUEST_AVAILABLE'; end if;
  select * into v_quest from public.quests where id = v_quest_id;

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

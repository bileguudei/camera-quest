-- Two changes to what a turn can ask for.
--
-- 1. The finger-counting quest is removed everywhere, enum value included, so
--    no row, column or type can express it again.
-- 2. A game now names the room it is played in — school, home or outdoors — and
--    only quests plausible there are drawn, plus a batch of new objects so each
--    setting has a deep enough pool for five rounds.

create type public.game_environment as enum ('school', 'home', 'outdoor');

alter table public.games
  add column environment public.game_environment not null default 'home';

alter table public.quests
  add column environments public.game_environment[] not null
    default array['school', 'home', 'outdoor']::public.game_environment[];

alter table public.quests
  add constraint quests_environments_not_empty
  check (array_length(environments, 1) >= 1);

-- Membership is the whole selection predicate, so it gets the index.
create index quests_environments_idx on public.quests using gin (environments);

-- --------------------------------------------------------------------------
-- Retire the finger quest, down to the enum value.
-- --------------------------------------------------------------------------

delete from public.turns
where quest_id in (select id from public.quests where kind = 'fingers');
delete from public.quests where kind = 'fingers';

alter table public.quests drop constraint quests_check;
alter table public.quests drop column finger_count;

alter type public.quest_kind rename to quest_kind_with_fingers;
create type public.quest_kind as enum ('object', 'smile', 'color');
alter table public.quests
  alter column kind type public.quest_kind using kind::text::public.quest_kind;
drop type public.quest_kind_with_fingers;

alter table public.quests
  add constraint quests_check
  check (
    (kind = 'object' and target_class is not null)
    or (kind = 'color' and target_color is not null)
    or kind = 'smile'
  );

-- --------------------------------------------------------------------------
-- Where the existing quests belong.
-- --------------------------------------------------------------------------

update public.quests set environments = array['school', 'home']::public.game_environment[]
where key in (
  'obj-apple', 'obj-banana', 'obj-book', 'obj-chair', 'obj-cup',
  'obj-clock', 'obj-laptop', 'obj-keyboard', 'obj-mouse', 'obj-scissors'
);

update public.quests set environments = array['home']::public.game_environment[]
where key in ('obj-remote', 'obj-teddy-bear', 'obj-toothbrush');

-- Colour, smile, and the things people carry stay valid anywhere, which is the
-- column default; only the exceptions above and below are named.

-- --------------------------------------------------------------------------
-- New objects. Every target_class is a COCO label the served model knows.
-- --------------------------------------------------------------------------

insert into public.quests
  (id, key, label, prompt, kind, difficulty, target_class, environments, validator_config)
values
  -- School and shared indoor
  ('10000000-0000-4000-8000-000000000101', 'obj-dining-table', 'Ширээ', 'ШИРЭЭ ОЛ', 'object', 'easy', 'dining table', array['school', 'home']::public.game_environment[], '{"consensus": 3, "confidence": 0.65, "borderlineMin": 0.45}'::jsonb),
  ('10000000-0000-4000-8000-000000000102', 'obj-potted-plant', 'Тогтоолт цэцэг', 'ЦЭЦЭГ ОЛ', 'object', 'easy', 'potted plant', array['school', 'home']::public.game_environment[], '{"consensus": 3, "confidence": 0.65, "borderlineMin": 0.45}'::jsonb),
  ('10000000-0000-4000-8000-000000000103', 'obj-tv', 'Телевиз', 'ТЕЛЕВИЗ ОЛ', 'object', 'medium', 'tv', array['school', 'home']::public.game_environment[], '{"consensus": 3, "confidence": 0.65, "borderlineMin": 0.45}'::jsonb),
  ('10000000-0000-4000-8000-000000000104', 'obj-umbrella', 'Шүхэр', 'ШҮХЭР ОЛ', 'object', 'medium', 'umbrella', array['school', 'home', 'outdoor']::public.game_environment[], '{"consensus": 3, "confidence": 0.65, "borderlineMin": 0.45}'::jsonb),
  ('10000000-0000-4000-8000-000000000105', 'obj-sports-ball', 'Бөмбөг', 'БӨМБӨГ ОЛ', 'object', 'medium', 'sports ball', array['school', 'outdoor']::public.game_environment[], '{"consensus": 3, "confidence": 0.65, "borderlineMin": 0.45}'::jsonb),
  ('10000000-0000-4000-8000-000000000106', 'obj-tie', 'Зангиа', 'ЗАНГИА ОЛ', 'object', 'hard', 'tie', array['school']::public.game_environment[], '{"consensus": 3, "confidence": 0.65, "borderlineMin": 0.45}'::jsonb),
  ('10000000-0000-4000-8000-000000000107', 'obj-suitcase', 'Чемодан', 'ЧЕМОДАН ОЛ', 'object', 'hard', 'suitcase', array['school', 'home', 'outdoor']::public.game_environment[], '{"consensus": 3, "confidence": 0.65, "borderlineMin": 0.45}'::jsonb),

  -- Home
  ('10000000-0000-4000-8000-000000000111', 'obj-couch', 'Буйдан', 'БУЙДАН ОЛ', 'object', 'easy', 'couch', array['home']::public.game_environment[], '{"consensus": 3, "confidence": 0.65, "borderlineMin": 0.45}'::jsonb),
  ('10000000-0000-4000-8000-000000000112', 'obj-bed', 'Ор', 'ОР ОЛ', 'object', 'easy', 'bed', array['home']::public.game_environment[], '{"consensus": 3, "confidence": 0.65, "borderlineMin": 0.45}'::jsonb),
  ('10000000-0000-4000-8000-000000000113', 'obj-bowl', 'Гүн таваг', 'ГҮН ТАВАГ ОЛ', 'object', 'easy', 'bowl', array['home']::public.game_environment[], '{"consensus": 3, "confidence": 0.65, "borderlineMin": 0.45}'::jsonb),
  ('10000000-0000-4000-8000-000000000114', 'obj-orange', 'Жүрж', 'ЖҮРЖ ОЛ', 'object', 'easy', 'orange', array['home']::public.game_environment[], '{"consensus": 3, "confidence": 0.65, "borderlineMin": 0.45}'::jsonb),
  ('10000000-0000-4000-8000-000000000115', 'obj-spoon', 'Халбага', 'ХАЛБАГА ОЛ', 'object', 'medium', 'spoon', array['home']::public.game_environment[], '{"consensus": 3, "confidence": 0.65, "borderlineMin": 0.45}'::jsonb),
  ('10000000-0000-4000-8000-000000000116', 'obj-fork', 'Сэрээ', 'СЭРЭЭ ОЛ', 'object', 'medium', 'fork', array['home']::public.game_environment[], '{"consensus": 3, "confidence": 0.65, "borderlineMin": 0.45}'::jsonb),
  ('10000000-0000-4000-8000-000000000117', 'obj-refrigerator', 'Хөргөгч', 'ХӨРГӨГЧ ОЛ', 'object', 'medium', 'refrigerator', array['home']::public.game_environment[], '{"consensus": 3, "confidence": 0.65, "borderlineMin": 0.45}'::jsonb),
  ('10000000-0000-4000-8000-000000000118', 'obj-sink', 'Угаалтуур', 'УГААЛТУУР ОЛ', 'object', 'medium', 'sink', array['home']::public.game_environment[], '{"consensus": 3, "confidence": 0.65, "borderlineMin": 0.45}'::jsonb),
  ('10000000-0000-4000-8000-000000000119', 'obj-vase', 'Ваар', 'ВААР ОЛ', 'object', 'hard', 'vase', array['home']::public.game_environment[], '{"consensus": 3, "confidence": 0.65, "borderlineMin": 0.45}'::jsonb),
  ('10000000-0000-4000-8000-00000000011a', 'obj-microwave', 'Богино долгионы зуух', 'БОГИНО ДОЛГИОНЫ ЗУУХ ОЛ', 'object', 'hard', 'microwave', array['home']::public.game_environment[], '{"consensus": 3, "confidence": 0.65, "borderlineMin": 0.45}'::jsonb),
  ('10000000-0000-4000-8000-00000000011b', 'obj-wine-glass', 'Хундага', 'ХУНДАГА ОЛ', 'object', 'hard', 'wine glass', array['home']::public.game_environment[], '{"consensus": 3, "confidence": 0.65, "borderlineMin": 0.45}'::jsonb),
  ('10000000-0000-4000-8000-00000000011c', 'obj-hair-drier', 'Үс хатаагч', 'ҮС ХАТААГЧ ОЛ', 'object', 'hard', 'hair drier', array['home']::public.game_environment[], '{"consensus": 3, "confidence": 0.65, "borderlineMin": 0.45}'::jsonb),

  -- Outdoors
  ('10000000-0000-4000-8000-000000000121', 'obj-car', 'Машин', 'МАШИН ОЛ', 'object', 'easy', 'car', array['outdoor']::public.game_environment[], '{"consensus": 3, "confidence": 0.65, "borderlineMin": 0.45}'::jsonb),
  ('10000000-0000-4000-8000-000000000122', 'obj-bicycle', 'Дугуй', 'ДУГУЙ ОЛ', 'object', 'easy', 'bicycle', array['outdoor']::public.game_environment[], '{"consensus": 3, "confidence": 0.65, "borderlineMin": 0.45}'::jsonb),
  ('10000000-0000-4000-8000-000000000123', 'obj-bench', 'Гудамжны сандал', 'ГУДАМЖНЫ САНДАЛ ОЛ', 'object', 'easy', 'bench', array['outdoor']::public.game_environment[], '{"consensus": 3, "confidence": 0.65, "borderlineMin": 0.45}'::jsonb),
  ('10000000-0000-4000-8000-000000000124', 'obj-dog', 'Нохой', 'НОХОЙ ОЛ', 'object', 'medium', 'dog', array['outdoor']::public.game_environment[], '{"consensus": 3, "confidence": 0.65, "borderlineMin": 0.45}'::jsonb),
  ('10000000-0000-4000-8000-000000000125', 'obj-cat', 'Муур', 'МУУР ОЛ', 'object', 'medium', 'cat', array['outdoor', 'home']::public.game_environment[], '{"consensus": 3, "confidence": 0.65, "borderlineMin": 0.45}'::jsonb),
  ('10000000-0000-4000-8000-000000000126', 'obj-bird', 'Шувуу', 'ШУВУУ ОЛ', 'object', 'medium', 'bird', array['outdoor']::public.game_environment[], '{"consensus": 3, "confidence": 0.65, "borderlineMin": 0.45}'::jsonb),
  ('10000000-0000-4000-8000-000000000127', 'obj-bus', 'Автобус', 'АВТОБУС ОЛ', 'object', 'medium', 'bus', array['outdoor']::public.game_environment[], '{"consensus": 3, "confidence": 0.65, "borderlineMin": 0.45}'::jsonb),
  ('10000000-0000-4000-8000-000000000128', 'obj-truck', 'Ачааны машин', 'АЧААНЫ МАШИН ОЛ', 'object', 'medium', 'truck', array['outdoor']::public.game_environment[], '{"consensus": 3, "confidence": 0.65, "borderlineMin": 0.45}'::jsonb),
  ('10000000-0000-4000-8000-000000000129', 'obj-traffic-light', 'Гэрлэн дохио', 'ГЭРЛЭН ДОХИО ОЛ', 'object', 'medium', 'traffic light', array['outdoor']::public.game_environment[], '{"consensus": 3, "confidence": 0.65, "borderlineMin": 0.45}'::jsonb),
  ('10000000-0000-4000-8000-00000000012a', 'obj-motorcycle', 'Мотоцикль', 'МОТОЦИКЛЬ ОЛ', 'object', 'hard', 'motorcycle', array['outdoor']::public.game_environment[], '{"consensus": 3, "confidence": 0.65, "borderlineMin": 0.45}'::jsonb),
  ('10000000-0000-4000-8000-00000000012b', 'obj-stop-sign', 'Зогсох тэмдэг', 'ЗОГСОХ ТЭМДЭГ ОЛ', 'object', 'hard', 'stop sign', array['outdoor']::public.game_environment[], '{"consensus": 3, "confidence": 0.65, "borderlineMin": 0.45}'::jsonb),
  ('10000000-0000-4000-8000-00000000012c', 'obj-skateboard', 'Скэйтборд', 'СКЭЙТБОРД ОЛ', 'object', 'hard', 'skateboard', array['outdoor']::public.game_environment[], '{"consensus": 3, "confidence": 0.65, "borderlineMin": 0.45}'::jsonb);

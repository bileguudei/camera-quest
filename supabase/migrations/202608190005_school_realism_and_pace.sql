-- Two play-testing corrections.
--
-- 1. School was asking for fruit, cutlery and a suitcase, none of which is in a
--    classroom. 202608190003 widened those quests to school on the assumption
--    of a canteen; this takes it back. School keeps what is actually on a desk.
-- 2. An object turned green on screen well before it scored. The overlay marks
--    a detection as the target from 0.45 confidence, while a pass needed 0.65
--    across three frames, so a clearly visible object sat there unscored. The
--    pass threshold moves to meet the overlay.

update public.quests
set environments = array_remove(environments, 'school')
where key in (
  'obj-apple', 'obj-banana', 'obj-orange', 'obj-carrot',
  'obj-spoon', 'obj-fork', 'obj-bowl', 'obj-suitcase'
);

update public.quests
set validator_config = validator_config || jsonb_build_object('confidence', 0.55)
where kind = 'object';

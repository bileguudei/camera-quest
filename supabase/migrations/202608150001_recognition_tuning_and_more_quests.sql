-- Tune specialist validators for full-frame mobile capture. These values stay
-- in data so later production calibration does not require a code deployment.
update public.quests
set validator_config = validator_config || jsonb_build_object(
  'minArea', 0.025,
  'minRegionArea', 0.015,
  'saturation', case when target_color = 'red' then 0.34 else 0.28 end,
  'value', 0.18,
  'consensus', 3
)
where kind = 'color';

update public.quests
set validator_config = validator_config || jsonb_build_object(
  'consensus', 3,
  'minPalmSpan', 0.06,
  'minFingerReach', 0.12
)
where kind = 'fingers';

-- Additional curated COCO classes. Easy/medium items are common household
-- objects; small or less common items intentionally remain hard quests.
insert into public.quests
  (id, key, label, prompt, kind, difficulty, target_class, validator_config)
values
  ('10000000-0000-4000-8000-000000000019', 'obj-apple', 'Алим', 'АЛИМ ОЛ', 'object', 'easy', 'apple', '{"confidence":0.65,"borderlineMin":0.45,"consensus":3}'),
  ('10000000-0000-4000-8000-000000000020', 'obj-banana', 'Гадил', 'ГАДИЛ ОЛ', 'object', 'easy', 'banana', '{"confidence":0.65,"borderlineMin":0.45,"consensus":3}'),
  ('10000000-0000-4000-8000-000000000021', 'obj-chair', 'Сандал', 'САНДАЛ ОЛ', 'object', 'easy', 'chair', '{"confidence":0.65,"borderlineMin":0.45,"consensus":3}'),
  ('10000000-0000-4000-8000-000000000022', 'obj-laptop', 'Зөөврийн компьютер', 'ЗӨӨВРИЙН КОМПЬЮТЕР ОЛ', 'object', 'medium', 'laptop', '{"confidence":0.65,"borderlineMin":0.45,"consensus":3}'),
  ('10000000-0000-4000-8000-000000000023', 'obj-remote', 'Удирдлага', 'УДИРДЛАГА ОЛ', 'object', 'medium', 'remote', '{"confidence":0.65,"borderlineMin":0.45,"consensus":3}'),
  ('10000000-0000-4000-8000-000000000024', 'obj-clock', 'Цаг', 'ЦАГ ОЛ', 'object', 'medium', 'clock', '{"confidence":0.65,"borderlineMin":0.45,"consensus":3}'),
  ('10000000-0000-4000-8000-000000000025', 'obj-scissors', 'Хайч', 'ХАЙЧ ОЛ', 'object', 'hard', 'scissors', '{"confidence":0.65,"borderlineMin":0.45,"consensus":3}'),
  ('10000000-0000-4000-8000-000000000026', 'obj-toothbrush', 'Шүдний сойз', 'ШҮДНИЙ СОЙЗ ОЛ', 'object', 'hard', 'toothbrush', '{"confidence":0.65,"borderlineMin":0.45,"consensus":3}'),
  ('10000000-0000-4000-8000-000000000027', 'obj-teddy-bear', 'Тоглоомон баавгай', 'ТОГЛООМОН БААВГАЙ ОЛ', 'object', 'hard', 'teddy bear', '{"confidence":0.65,"borderlineMin":0.45,"consensus":3}')
on conflict (key) do update set
  label = excluded.label,
  prompt = excluded.prompt,
  difficulty = excluded.difficulty,
  target_class = excluded.target_class,
  validator_config = excluded.validator_config,
  active = true;

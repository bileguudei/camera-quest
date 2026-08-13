insert into public.levels (level, minimum_xp)
select level, 50 * (level - 1) * level
from generate_series(1, 50) as level;

insert into public.achievements (id, key, name, description, rule_key, threshold, icon) values
  ('20000000-0000-4000-8000-000000000001', 'first_clear', 'Анхны ялалт', 'Анхны quest-ээ амжилттай дуусга.', 'first_clear', 1, '✨'),
  ('20000000-0000-4000-8000-000000000002', 'quick_draw', 'Хурдан гар', '5 секундээс бага хугацаанд ол.', 'quick_draw', 5000, '⚡'),
  ('20000000-0000-4000-8000-000000000003', 'on_fire', 'Галтай', '3 дараалсан амжилт гарга.', 'on_fire', 3, '🔥'),
  ('20000000-0000-4000-8000-000000000004', 'unstoppable', 'Зогсоошгүй', '10 дараалсан амжилт гарга.', 'unstoppable', 10, '🚀'),
  ('20000000-0000-4000-8000-000000000005', 'perfect_game', 'Төгс тоглолт', 'Нэг тоглолтод 5/5 амжилт гарга.', 'perfect_game', 5, '🏆'),
  ('20000000-0000-4000-8000-000000000006', 'rainbow', 'Солонго', 'Дөрвөн өнгийн quest-ийг бүгдийг дуусга.', 'rainbow', 4, '🌈'),
  ('20000000-0000-4000-8000-000000000007', 'object_hunter', 'Object hunter', '25 object quest амжилттай дуусга.', 'object_hunter', 25, '🎯');

insert into public.quests
  (id, key, label, prompt, kind, difficulty, target_class, finger_count, target_color, hex, validator_config)
values
  ('10000000-0000-4000-8000-000000000001', 'color-red', 'Улаан', 'УЛААН ЗҮЙЛ ОЛ', 'color', 'easy', null, null, 'red', '#ff4d4d', '{"minArea":0.12,"saturation":0.45,"value":0.25,"consensus":4}'),
  ('10000000-0000-4000-8000-000000000002', 'color-blue', 'Цэнхэр', 'ЦЭНХЭР ЗҮЙЛ ОЛ', 'color', 'easy', null, null, 'blue', '#3d8bff', '{"minArea":0.12,"saturation":0.45,"value":0.25,"consensus":4}'),
  ('10000000-0000-4000-8000-000000000003', 'color-green', 'Ногоон', 'НОГООН ЗҮЙЛ ОЛ', 'color', 'medium', null, null, 'green', '#3be08a', '{"minArea":0.12,"saturation":0.45,"value":0.25,"consensus":4}'),
  ('10000000-0000-4000-8000-000000000004', 'color-yellow', 'Шар', 'ШАР ЗҮЙЛ ОЛ', 'color', 'medium', null, null, 'yellow', '#ffd24a', '{"minArea":0.12,"saturation":0.45,"value":0.25,"consensus":4}'),
  ('10000000-0000-4000-8000-000000000005', 'obj-bottle', 'Лонх', 'ЛОНХ ОЛ', 'object', 'easy', 'bottle', null, null, null, '{"confidence":0.65,"borderlineMin":0.45,"consensus":3}'),
  ('10000000-0000-4000-8000-000000000006', 'obj-cup', 'Аяга', 'АЯГА ОЛ', 'object', 'easy', 'cup', null, null, null, '{"confidence":0.65,"borderlineMin":0.45,"consensus":3}'),
  ('10000000-0000-4000-8000-000000000007', 'obj-book', 'Ном', 'НОМ ХАРУУЛ', 'object', 'easy', 'book', null, null, null, '{"confidence":0.65,"borderlineMin":0.45,"consensus":3}'),
  ('10000000-0000-4000-8000-000000000008', 'obj-phone', 'Утас', 'УТАС ОЛ', 'object', 'medium', 'cell phone', null, null, null, '{"confidence":0.65,"borderlineMin":0.45,"consensus":3}'),
  ('10000000-0000-4000-8000-000000000009', 'obj-backpack', 'Үүргэвч', 'ҮҮРГЭВЧ ОЛ', 'object', 'medium', 'backpack', null, null, null, '{"confidence":0.65,"borderlineMin":0.45,"consensus":3}'),
  ('10000000-0000-4000-8000-000000000010', 'obj-handbag', 'Цүнх', 'ЦҮНХ ОЛ', 'object', 'medium', 'handbag', null, null, null, '{"confidence":0.65,"borderlineMin":0.45,"consensus":3}'),
  ('10000000-0000-4000-8000-000000000011', 'obj-keyboard', 'Keyboard', 'KEYBOARD ОЛ', 'object', 'hard', 'keyboard', null, null, null, '{"confidence":0.65,"borderlineMin":0.45,"consensus":3}'),
  ('10000000-0000-4000-8000-000000000012', 'obj-mouse', 'Mouse', 'MOUSE ОЛ', 'object', 'hard', 'mouse', null, null, null, '{"confidence":0.65,"borderlineMin":0.45,"consensus":3}'),
  ('10000000-0000-4000-8000-000000000013', 'fingers-1', '1 хуруу', '1 ХУРУУ ХАРУУЛ', 'fingers', 'easy', null, 1, null, null, '{"count":1,"consensus":4}'),
  ('10000000-0000-4000-8000-000000000014', 'fingers-2', '2 хуруу', '2 ХУРУУ ХАРУУЛ', 'fingers', 'easy', null, 2, null, null, '{"count":2,"consensus":4}'),
  ('10000000-0000-4000-8000-000000000015', 'fingers-3', '3 хуруу', '3 ХУРУУ ХАРУУЛ', 'fingers', 'medium', null, 3, null, null, '{"count":3,"consensus":4}'),
  ('10000000-0000-4000-8000-000000000016', 'fingers-4', '4 хуруу', '4 ХУРУУ ХАРУУЛ', 'fingers', 'hard', null, 4, null, null, '{"count":4,"consensus":4}'),
  ('10000000-0000-4000-8000-000000000017', 'fingers-5', '5 хуруу', '5 ХУРУУ ХАРУУЛ', 'fingers', 'hard', null, 5, null, null, '{"count":5,"consensus":4}'),
  ('10000000-0000-4000-8000-000000000018', 'smile', 'Инээмсэглэл', 'ИНЭЭМСЭГЛЭ', 'smile', 'hard', null, null, null, null, '{"delta":0.35,"absolute":0.55,"consensus":4}');

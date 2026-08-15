begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(30);

select extensions.is(
  (select count(*)::integer from public.quests where key in (
    'obj-apple', 'obj-banana', 'obj-chair', 'obj-laptop', 'obj-remote',
    'obj-clock', 'obj-scissors', 'obj-toothbrush', 'obj-teddy-bear'
  )),
  9,
  'additional curated object quests are seeded'
);
select extensions.ok(
  (select bool_and(
    (validator_config->>'consensus')::integer = 3
    and (validator_config->>'minPalmSpan')::numeric = 0.06
  ) from public.quests where kind = 'fingers'),
  'finger quests use the tolerant three-frame geometry contract'
);
select extensions.ok(
  (select bool_and(
    (validator_config->>'consensus')::integer = 3
    and (validator_config->>'minArea')::numeric = 0.025
    and (validator_config->>'minRegionArea')::numeric = 0.015
  ) from public.quests where kind = 'color'),
  'color quests accept a small coherent object region'
);

insert into auth.users (id, aud, role, email)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'owner-a@example.test'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'owner-b@example.test');

insert into public.player_profiles
  (id, owner_id, device_slot, name, avatar, color, current_streak, best_streak)
values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1, 'Alpha', '🦊', 'violet', 2, 2);

insert into public.games (id, owner_id)
values ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

insert into public.game_players (id, game_id, player_id, seat)
values (
  '33333333-3333-4333-8333-333333333333',
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  1
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
select extensions.is(
  (select count(*)::integer from public.player_profiles),
  1,
  'owner can read its local player profiles'
);

select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);
select extensions.is(
  (select count(*)::integer from public.player_profiles),
  0,
  'another anonymous device cannot read profiles'
);
reset role;

select extensions.ok(
  not has_function_privilege(
    'authenticated',
    'public.resolve_turn(uuid,integer,integer,real,text,text,text,text)',
    'EXECUTE'
  ),
  'browser role cannot award a score'
);
select extensions.ok(
  has_function_privilege(
    'service_role',
    'public.resolve_turn(uuid,integer,integer,real,text,text,text,text)',
    'EXECUTE'
  ),
  'vision service role can resolve a turn'
);

insert into public.turns
  (id, game_id, game_player_id, player_id, quest_id, round, status, started_at, deadline_at)
values (
  '44444444-4444-4444-8444-444444444444',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '11111111-1111-4111-8111-111111111111',
  '10000000-0000-4000-8000-000000000005',
  1,
  'active',
  clock_timestamp() - interval '1 second',
  clock_timestamp() + interval '29 seconds'
);

set local role service_role;
select extensions.lives_ok(
  $$select public.resolve_turn(
    '44444444-4444-4444-8444-444444444444', 1, 120, 0.99::real,
    'object', 'test-model', 'test-validator', 'matched'
  )$$,
  'active turn resolves atomically'
);
select extensions.lives_ok(
  $$select public.resolve_turn(
    '44444444-4444-4444-8444-444444444444', 1, 120, 0.99::real,
    'object', 'test-model', 'test-validator', 'duplicate'
  )$$,
  'duplicate resolution is idempotent'
);
reset role;

select extensions.is(
  (select total_xp from public.player_profiles where id = '11111111-1111-4111-8111-111111111111'),
  (select points from public.turns where id = '44444444-4444-4444-8444-444444444444'),
  'duplicate resolution awards XP once'
);
select extensions.is(
  (select count(*)::integer from public.vision_attempts where turn_id = '44444444-4444-4444-8444-444444444444'),
  1,
  'duplicate sequence creates one attempt'
);
select extensions.ok(
  (select result ?& array[
    'playerId', 'playerName', 'playerColor', 'challengeId', 'challengePrompt',
    'success', 'timeMs', 'elapsedMs', 'totalAfter', 'totalScore'
  ] from public.turns where id = '44444444-4444-4444-8444-444444444444'),
  'passed result is canonical for both vision pass and timeout-race responses'
);
select extensions.set_eq(
  $$
    select a.key
    from public.player_achievements pa
    join public.achievements a on a.id = pa.achievement_id
    where pa.player_id = '11111111-1111-4111-8111-111111111111'
  $$,
  array['first_clear', 'quick_draw', 'on_fire']::text[],
  'fast third consecutive success unlocks the exact eligible achievements'
);
select extensions.is(
  (select current_streak from public.player_profiles where id = '11111111-1111-4111-8111-111111111111'),
  3,
  'success increments streak'
);

insert into public.turns
  (id, game_id, game_player_id, player_id, quest_id, round, status, started_at, deadline_at, vision_attempt_count)
values (
  '55555555-5555-4555-8555-555555555555',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '11111111-1111-4111-8111-111111111111',
  '10000000-0000-4000-8000-000000000006',
  2,
  'active',
  clock_timestamp() - interval '31 seconds',
  clock_timestamp() - interval '1 second',
  1
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
select extensions.lives_ok(
  $$select public.expire_turn('55555555-5555-4555-8555-555555555555')$$,
  'owner can expire a turn after the server deadline'
);
reset role;
select extensions.is(
  (select status::text from public.turns where id = '55555555-5555-4555-8555-555555555555'),
  'timed_out',
  'expired turn is marked timed_out'
);
select extensions.is(
  (select current_streak from public.player_profiles where id = '11111111-1111-4111-8111-111111111111'),
  0,
  'real timeout resets streak'
);

insert into public.turns
  (id, game_id, game_player_id, player_id, quest_id, round, status, resolved_at, retry_count)
values (
  '66666666-6666-4666-8666-666666666666',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '11111111-1111-4111-8111-111111111111',
  '10000000-0000-4000-8000-000000000003',
  3,
  'aborted',
  clock_timestamp(),
  1
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
select extensions.lives_ok(
  $$select public.prepare_turn(
    '22222222-2222-4222-8222-222222222222',
    '11111111-1111-4111-8111-111111111111',
    3::smallint,
    '{}'::text[]
  )$$,
  'turn can be prepared after the penalty-free retry'
);
select extensions.is(
  (
    public.prepare_turn(
      '22222222-2222-4222-8222-222222222222',
      '11111111-1111-4111-8111-111111111111',
      3::smallint,
      '{}'::text[]
    )->>'turnId'
  )::uuid,
  (
    select id from public.turns
    where game_id = '22222222-2222-4222-8222-222222222222'
      and player_id = '11111111-1111-4111-8111-111111111111'
      and round = 3 and status = 'prepared'
  ),
  'duplicate prepare returns the existing open turn'
);
select extensions.is(
  (
    select count(*)::integer from public.turns
    where game_id = '22222222-2222-4222-8222-222222222222'
      and player_id = '11111111-1111-4111-8111-111111111111'
      and round = 3 and status in ('prepared', 'active')
  ),
  1,
  'duplicate prepare never creates a second open turn'
);
reset role;
select extensions.is(
  (select retry_count from public.turns where game_id = '22222222-2222-4222-8222-222222222222' and round = 3 and status = 'prepared'),
  1::smallint,
  'retry allowance propagates so it cannot repeat forever'
);
select extensions.isnt(
  (select quest_id from public.turns where game_id = '22222222-2222-4222-8222-222222222222' and round = 3 and status = 'prepared'),
  '10000000-0000-4000-8000-000000000003'::uuid,
  'a quest does not repeat for the player in one game'
);
select extensions.is(
  (select q.difficulty::text
   from public.turns t join public.quests q on q.id = t.quest_id
   where t.game_id = '22222222-2222-4222-8222-222222222222'
     and t.round = 3 and t.status = 'prepared'),
  'medium',
  'round three always selects medium difficulty'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);
select extensions.throws_ok(
  $$insert into public.turn_feedback (turn_id, owner_id, reason) values (
    '44444444-4444-4444-8444-444444444444',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'false_positive'
  )$$,
  '42501',
  'new row violates row-level security policy for table "turn_feedback"',
  'another device cannot submit feedback for the owner'
);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
select extensions.lives_ok(
  $$insert into public.turn_feedback (turn_id, owner_id, reason) values (
    '44444444-4444-4444-8444-444444444444',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'false_positive'
  )$$,
  'owner can store metadata-only feedback'
);
reset role;

insert into public.turns
  (id, game_id, game_player_id, player_id, quest_id, round, status, started_at, deadline_at)
values (
  '77777777-7777-4777-8777-777777777777',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '11111111-1111-4111-8111-111111111111',
  '10000000-0000-4000-8000-000000000008',
  4,
  'active',
  clock_timestamp() - interval '31 seconds',
  clock_timestamp() - interval '1 second'
);

set local role service_role;
select extensions.throws_ok(
  $$select public.resolve_turn(
    '77777777-7777-4777-8777-777777777777', 1, 120, 0.99::real,
    'object', 'test-model', 'test-validator', 'late'
  )$$,
  '22023',
  'TURN_EXPIRED',
  'score resolution rejects the server-expired deadline'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);
select extensions.throws_ok(
  $$select public.abandon_game('22222222-2222-4222-8222-222222222222')$$,
  '42501',
  'GAME_NOT_OWNED',
  'another device cannot abandon the game'
);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
select extensions.lives_ok(
  $$select public.abandon_game('22222222-2222-4222-8222-222222222222')$$,
  'owner can abandon its active game'
);
reset role;

select extensions.lives_ok(
  $$delete from auth.users where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  'deleting an anonymous device account cascades through match history'
);
select extensions.is(
  (
    select count(*)::integer
    from public.player_profiles
    where owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ),
  0,
  'device account deletion leaves no owned profiles'
);

select * from extensions.finish();
rollback;

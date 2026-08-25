begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(106);

select extensions.is(
  (select count(*)::integer from public.quests where key in (
    'obj-apple', 'obj-banana', 'obj-chair', 'obj-laptop', 'obj-remote',
    'obj-clock', 'obj-scissors', 'obj-toothbrush', 'obj-teddy-bear'
  )),
  9,
  'additional curated object quests are seeded'
);
select extensions.is(
  (select count(*)::integer from public.quests where kind::text = 'fingers'),
  0,
  'the finger quest is gone from the catalogue'
);
select extensions.ok(
  not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'quest_kind' and e.enumlabel = 'fingers'
  ),
  'the finger quest kind is gone from the enum as well'
);
-- Five rounds need two easy, two medium and one hard quest in whichever room
-- the host picked, so every environment keeps a pool deeper than that.
select extensions.ok(
  (select bool_and(quests >= 3) from (
     select count(*) as quests
     from public.quests q, unnest(q.environments) as e(env)
     where q.active
     group by e.env, q.difficulty
   ) pools),
  'every environment has a deep enough pool at each difficulty'
);
select extensions.is(
  (select count(distinct e.env)::integer
   from public.quests q, unnest(q.environments) as e(env)),
  3,
  'all three environments are represented in the catalogue'
);
-- Object recognition is deliberately untouched by the environment work: no
-- frame-coverage gate is configured for it.
select extensions.ok(
  (select bool_and(
     not (validator_config ? 'minArea') and not (validator_config ? 'minAreaWhenSeen')
   ) from public.quests where kind = 'object'),
  'object quests carry no frame-coverage gate'
);
-- Two stable frames are enough to score, while one-frame detector noise still
-- cannot award points. The UI only marks a box as confirmed after this gate.
select extensions.ok(
  (select bool_and(
     (validator_config->>'confidence')::numeric
       - (validator_config->>'borderlineMin')::numeric <= 0.1
     and (validator_config->>'consensus')::integer = 2
   ) from public.quests where kind = 'object'),
  'object scoring uses the playtested threshold and two-frame consensus'
);
-- Past the easy rounds a turn asks for a condition: several things held in the
-- same frame at once. Easy stays one thing, exactly as it always was.
select extensions.ok(
  (select bool_and(
     jsonb_array_length(coalesce(validator_config->'targetClasses', '[]'::jsonb)) >= 2
   ) from public.quests
   where active and kind = 'object' and difficulty <> 'easy'),
  'every medium and hard object quest wants more than one thing at once'
);
select extensions.ok(
  (select bool_and(not (validator_config ? 'targetClasses'))
   from public.quests
   where active and kind = 'object' and difficulty = 'easy'),
  'an easy object quest still wants a single thing'
);
-- The screen ticks each wanted thing off by name as the scan confirms it, and
-- target_class stays the first of them for the background-avoidance ordering.
select extensions.ok(
  (select bool_and(
     jsonb_array_length(validator_config->'targetLabels')
       = jsonb_array_length(validator_config->'targetClasses')
     and target_class = validator_config->'targetClasses'->>0
   ) from public.quests where validator_config ? 'targetClasses'),
  'each thing a condition wants is named for the screen'
);
-- Nobody finds fruit or cutlery in a classroom.
select extensions.is(
  (select count(*)::integer from public.quests
   where active and 'school' = any (environments)
     and key in ('obj-apple', 'obj-banana', 'obj-orange', 'obj-carrot',
                 'obj-spoon', 'obj-fork', 'obj-bowl', 'obj-suitcase')),
  0,
  'school asks only for things that are in a classroom'
);
-- A coherent saturated region plus calibration still rejects background
-- colour, without forcing the player to push the object against the lens.
select extensions.ok(
  (select bool_and(
     (validator_config->>'saturation')::numeric >= 0.3
     and (validator_config->>'consensus')::integer = 3
   ) from public.quests where kind = 'color'),
  'colour keeps a saturation floor and three-frame stability gate'
);
select extensions.ok(
  (select bool_and(
    (validator_config->>'consensus')::integer = 3
    and (validator_config->>'minArea')::numeric = 0.025
    and (validator_config->>'minRegionArea')::numeric = 0.015
  ) from public.quests where kind = 'color'),
  'colour accepts a mid-distance coherent object region'
);

insert into auth.users (id, aud, role, email)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'owner-a@example.test'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'owner-b@example.test');

insert into public.player_profiles
  (id, owner_id, device_slot, name, avatar, color, current_streak, best_streak)
values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1, 'Alpha', '🦊', 'violet', 2, 2);

insert into public.games (id, owner_id, host_id)
values (
  '22222222-2222-4222-8222-222222222222',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
);

insert into public.game_players (id, game_id, player_id, seat, owner_id)
values (
  '33333333-3333-4333-8333-333333333333',
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  1,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
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

-- ---------------------------------------------------------------------------
-- Online lobbies: seats belong to phones, not to the host.
-- ---------------------------------------------------------------------------

insert into auth.users (id, aud, role, email)
values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'authenticated', 'authenticated', 'host@example.test'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'authenticated', 'authenticated', 'guest@example.test'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'authenticated', 'authenticated', 'stranger@example.test');

create temporary table lobby_handle (game_id uuid, code text);
grant select on lobby_handle to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', true);
select extensions.lives_ok(
  $$select public.create_online_game('Host')$$,
  'a phone can open an online table'
);
reset role;

insert into lobby_handle
select id, join_code from public.games
where host_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

select extensions.matches(
  (select code from lobby_handle),
  '^[A-Z0-9]{6}$',
  'the join code is six unambiguous characters'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', true);
select extensions.is(
  (public.join_game((select code from lobby_handle), 'Guest')->>'selfSeat')::integer,
  2,
  'the second phone lands in the next free seat'
);
select extensions.is(
  (public.join_game((select code from lobby_handle), 'Guest')->>'selfSeat')::integer,
  2,
  'rejoining keeps the original seat instead of taking a second one'
);
reset role;

select extensions.is(
  (select count(*)::integer from public.game_players where game_id = (select game_id from lobby_handle)),
  2,
  'a rejoin never allocates a second seat'
);
select extensions.is(
  (select color from public.player_profiles where owner_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  'blue',
  'the server assigns the seat colour so two phones cannot share one'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', true);
select extensions.is(
  (select count(*)::integer from public.games where id = (select game_id from lobby_handle)),
  0,
  'a phone that never joined cannot read the table'
);

select set_config('request.jwt.claim.sub', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', true);
select extensions.is(
  (select count(*)::integer from public.player_profiles
   where owner_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  1,
  'a member can read the scoreboard identity of the phones it plays with'
);

select extensions.throws_ok(
  $$select public.start_online_game((select game_id from lobby_handle))$$,
  '42501',
  'GAME_NOT_OWNED',
  'only the host starts the match'
);

select set_config('request.jwt.claim.sub', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', true);
select extensions.lives_ok(
  $$select public.start_online_game((select game_id from lobby_handle))$$,
  'the host closes the lobby and opens round one'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', true);
select extensions.throws_ok(
  $$select public.prepare_turn(
    (select game_id from lobby_handle),
    (select player_id from public.game_players
     where game_id = (select game_id from lobby_handle) and seat = 2),
    1::smallint,
    '{}'::text[]
  )$$,
  '22023',
  'NOT_YOUR_TURN',
  'a phone cannot jump the queue while the pointer points at another seat'
);
select extensions.is(
  (public.advance_turn_pointer((select game_id from lobby_handle), 1::smallint, 1::smallint)
    ->>'currentSeat')::integer,
  2,
  'reporting the finished pointer moves the table to the next seat'
);
select extensions.is(
  (public.advance_turn_pointer((select game_id from lobby_handle), 1::smallint, 1::smallint)
    ->>'currentSeat')::integer,
  2,
  'a second phone reporting the same turn does not skip a player'
);
reset role;

-- The spectator channel carries a camera image, so its topic parser must not
-- authorize anything that is not a real game the caller sits at.
select extensions.is(
  public.spectate_game_id('spectate:' || (select game_id from lobby_handle)::text),
  (select game_id from lobby_handle),
  'a well-formed spectate topic resolves to its game'
);
select extensions.is(
  public.spectate_game_id('spectate:not-a-uuid'),
  null,
  'a malformed topic resolves to no game at all'
);
select extensions.is(
  public.spectate_game_id('games:' || (select game_id from lobby_handle)::text),
  null,
  'another topic namespace cannot borrow the spectator policy'
);

-- ---------------------------------------------------------------------------
-- P0 presence, host migration, immutable rematch, and vision abuse controls.
-- ---------------------------------------------------------------------------

update public.game_players
set last_seen_at = clock_timestamp() - interval '30 seconds'
where game_id = (select game_id from lobby_handle)
  and owner_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', true);
select extensions.is(
  public.heartbeat_game((select game_id from lobby_handle))->>'isHost',
  'true',
  'an active member heartbeat takes over from a stale host'
);
reset role;

select extensions.is(
  (select host_id from public.games where id = (select game_id from lobby_handle)),
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid,
  'host migration is persisted on the authoritative game row'
);

update public.games
set status = 'completed', lobby_open = false, completed_at = clock_timestamp()
where id = (select game_id from lobby_handle);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', true);
select extensions.is(
  (public.request_rematch((select game_id from lobby_handle))->>'rematchReadyCount')::integer,
  1,
  'the first rematch vote waits without mutating match history'
);
reset role;

select extensions.is(
  (select count(*)::integer from public.games where rematch_of = (select game_id from lobby_handle)),
  0,
  'one vote cannot create a rematch lobby'
);

create temporary table rematch_handle (game_id uuid, ticket uuid);
grant select, update on rematch_handle to authenticated, service_role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', true);
insert into rematch_handle (game_id)
select (public.request_rematch((select game_id from lobby_handle))->>'gameId')::uuid;
reset role;

select extensions.is(
  (select count(*)::integer from public.games where rematch_of = (select game_id from lobby_handle)),
  1,
  'the final vote creates exactly one rematch lobby'
);
select extensions.is(
  (select status::text from public.games where id = (select game_id from rematch_handle)),
  'active',
  'the rematch is a fresh active game'
);
select extensions.ok(
  (select lobby_open from public.games where id = (select game_id from rematch_handle)),
  'the rematch waits in a fresh lobby instead of reusing the completed table'
);
select extensions.is(
  (select count(*)::integer from public.game_players where game_id = (select game_id from rematch_handle)),
  2,
  'the active rematch cohort keeps its seats'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', true);
select extensions.is(
  (public.request_rematch((select game_id from lobby_handle))->>'gameId')::uuid,
  (select game_id from rematch_handle),
  'repeated rematch requests converge on the same game id'
);
update rematch_handle
set ticket = (public.issue_vision_ticket((select game_id from rematch_handle))->>'ticket')::uuid;
reset role;

select extensions.ok(
  (select ticket is not null from rematch_handle),
  'an active game member receives a short-lived calibration ticket'
);

set local role service_role;
select extensions.ok(
  public.consume_vision_ticket(
    (select ticket from rematch_handle),
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'calibrate'
  ),
  'the vision service consumes a valid ticket once'
);
select extensions.ok(
  not public.consume_vision_ticket(
    (select ticket from rematch_handle),
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'calibrate'
  ),
  'a calibration ticket cannot be replayed'
);
select extensions.ok(
  public.claim_vision_budget('test:subject:0123456789abcdef', 2, 60),
  'the first distributed quota claim succeeds'
);
select extensions.ok(
  public.claim_vision_budget('test:subject:0123456789abcdef', 2, 60),
  'the last claim inside the quota succeeds'
);
select extensions.ok(
  not public.claim_vision_budget('test:subject:0123456789abcdef', 2, 60),
  'a distributed quota blocks the next container too'
);
select extensions.is(
  public.vision_service_state()->>'enabled',
  'true',
  'the remote vision switch defaults to enabled'
);
reset role;

update public.vision_service_controls
set enabled = false, reason = 'release drill', updated_at = clock_timestamp()
where service = 'vision';

set local role service_role;
select extensions.is(
  public.vision_service_state()->>'enabled',
  'false',
  'the remote vision switch changes without a frontend deploy'
);
reset role;

insert into public.turns (
  game_id, game_player_id, player_id, quest_id, round, status,
  started_at, deadline_at, vision_attempt_count
)
select
  (select game_id from rematch_handle), gp.id, gp.player_id,
  '10000000-0000-4000-8000-000000000005', 1, 'active',
  clock_timestamp() - interval '36 seconds',
  clock_timestamp() - interval '6 seconds',
  1
from public.game_players gp
where gp.game_id = (select game_id from rematch_handle) and gp.seat = 1;

update public.game_players
set last_seen_at = clock_timestamp() - interval '30 seconds'
where game_id = (select game_id from rematch_handle) and seat = 1;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', true);
select extensions.is(
  (
    public.recover_disconnected_turn(
      (select id from public.turns where game_id = (select game_id from rematch_handle))
    )->>'currentSeat'
  )::integer,
  2,
  'a spectator expires a stale active seat and advances the pointer by CAS'
);
reset role;

select extensions.ok(
  (select left_at is not null from public.game_players
   where game_id = (select game_id from rematch_handle) and seat = 1),
  'disconnect recovery removes only the stale seat from future turns'
);

select extensions.ok(
  not has_function_privilege(
    'authenticated',
    'public.claim_vision_budget(text,integer,integer)',
    'EXECUTE'
  ),
  'browser identities cannot forge distributed quota claims'
);
select extensions.ok(
  has_function_privilege(
    'authenticated',
    'public.issue_vision_ticket(uuid,text)',
    'EXECUTE'
  ),
  'authenticated game members can request calibration tickets'
);
select extensions.ok(
  has_function_privilege(
    'service_role',
    'public.consume_vision_ticket(uuid,uuid,text)',
    'EXECUTE'
  ),
  'only the vision service path can consume calibration tickets'
);
select extensions.ok(
  has_function_privilege(
    'authenticated',
    'public.recover_disconnected_turn(uuid)',
    'EXECUTE'
  ),
  'a spectator can invoke the server-authorized disconnect recovery CAS'
);

-- ---------------------------------------------------------------------------
-- Online Mimic Rush: Face Bomb is server-owned while solo remains local-only.
-- ---------------------------------------------------------------------------

insert into auth.users (id, aud, role, email)
values
  ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'authenticated', 'authenticated', 'mimic-host@example.test'),
  ('99999999-9999-4999-8999-999999999999', 'authenticated', 'authenticated', 'mimic-guest@example.test');

create temporary table mimic_handle (game_id uuid, code text);
grant select on mimic_handle to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'ffffffff-ffff-4fff-8fff-ffffffffffff', true);
select extensions.lives_ok(
  $$select public.create_online_game('Mimic host', 'home', 'mimic_rush')$$,
  'a host can create an explicit Mimic Rush lobby'
);
reset role;

insert into mimic_handle
select id, join_code from public.games
where host_id = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

set local role authenticated;
select set_config('request.jwt.claim.sub', '99999999-9999-4999-8999-999999999999', true);
select extensions.is(
  (public.join_game((select code from mimic_handle), 'Mimic guest')->>'selfSeat')::integer,
  2,
  'a second phone joins the Face Bomb lobby normally'
);
select extensions.lives_ok(
  $$select public.set_player_ready((select game_id from mimic_handle), true)$$,
  'the guest becomes ready only after its camera and face model preflight'
);
select extensions.throws_ok(
  $$select public.start_online_game((select game_id from mimic_handle))$$,
  '42501',
  'GAME_NOT_OWNED',
  'a ready guest still cannot start Face Bomb'
);

select set_config('request.jwt.claim.sub', 'ffffffff-ffff-4fff-8fff-ffffffffffff', true);
select extensions.lives_ok(
  $$select public.set_player_ready((select game_id from mimic_handle), true)$$,
  'the host becomes ready after the same device preflight'
);
select extensions.lives_ok(
  $$select public.start_online_game((select game_id from mimic_handle))$$,
  'the host starts once every seated phone is ready'
);
reset role;

select extensions.is(
  (select game_kind::text from public.games where id = (select game_id from mimic_handle)),
  'mimic_rush',
  'the selected game kind is stored on the authoritative game row'
);
select extensions.is(
  (select count(*)::integer from public.mimic_player_states
   where game_id = (select game_id from mimic_handle)),
  2,
  'Face Bomb creates one life row per active seat'
);
select extensions.is(
  (select status from public.mimic_turns where game_id = (select game_id from mimic_handle)),
  'prepared',
  'the first timer waits until the active face is framed'
);
select extensions.ok(
  (select bool_and(lives = 3) from public.mimic_player_states
   where game_id = (select game_id from mimic_handle)),
  'every player starts with three lives'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '99999999-9999-4999-8999-999999999999', true);
select extensions.is(
  (
    public.expire_mimic_turn(
      (select id from public.mimic_turns where game_id = (select game_id from mimic_handle))
    )->'mimicBattle'->'turn'->>'status'
  ),
  'prepared',
  'a spectator cannot expire a connected player during framing grace'
);

select set_config('request.jwt.claim.sub', 'ffffffff-ffff-4fff-8fff-ffffffffffff', true);
select extensions.is(
  (
    public.activate_mimic_turn(
      (select id from public.mimic_turns where game_id = (select game_id from mimic_handle))
    )->'mimicBattle'->'turn'->>'status'
  ),
  'active',
  'the active phone starts its seven-second server deadline after calibration'
);

select set_config('request.jwt.claim.sub', '99999999-9999-4999-8999-999999999999', true);
select extensions.throws_ok(
  $$select public.pass_mimic_turn(
    (select id from public.mimic_turns where game_id = (select game_id from mimic_handle))
  )$$,
  '42501',
  'NOT_YOUR_TURN',
  'a spectator cannot claim another player expression'
);

select set_config('request.jwt.claim.sub', 'ffffffff-ffff-4fff-8fff-ffffffffffff', true);
select extensions.is(
  (
    public.pass_mimic_turn(
      (select id from public.mimic_turns
       where game_id = (select game_id from mimic_handle) and status = 'active')
    )->>'currentSeat'
  )::integer,
  2,
  'a successful expression passes the bomb exactly one seat'
);
reset role;

select extensions.is(
  (select lives from public.mimic_player_states mps
   join public.game_players gp on gp.id = mps.game_player_id
   where mps.game_id = (select game_id from mimic_handle) and gp.seat = 1),
  3::smallint,
  'passing the bomb does not cost a life'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '99999999-9999-4999-8999-999999999999', true);
select extensions.is(
  (
    public.activate_mimic_turn(
      (select id from public.mimic_turns
       where game_id = (select game_id from mimic_handle) and status = 'prepared')
    )->'mimicBattle'->'turn'->>'status'
  ),
  'active',
  'the next phone activates only its own prepared turn'
);
reset role;

update public.mimic_turns
set started_at = clock_timestamp() - interval '8 seconds',
    deadline_at = clock_timestamp() - interval '1 second'
where game_id = (select game_id from mimic_handle) and status = 'active';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'ffffffff-ffff-4fff-8fff-ffffffffffff', true);
select extensions.is(
  (
    public.expire_mimic_turn(
      (select id from public.mimic_turns
       where game_id = (select game_id from mimic_handle) and status = 'active')
    )->>'currentSeat'
  )::integer,
  1,
  'any member watchdog advances an expired Face Bomb turn by CAS'
);
reset role;

select extensions.is(
  (select lives from public.mimic_player_states mps
   join public.game_players gp on gp.id = mps.game_player_id
   where mps.game_id = (select game_id from mimic_handle) and gp.seat = 2),
  2::smallint,
  'a timeout costs exactly one life'
);

-- Put the guest on its last life, then run one more fair host pass and expiry
-- to prove the last-player-standing completion path without duplicating laps.
update public.mimic_player_states mps
set lives = 1
from public.game_players gp
where gp.id = mps.game_player_id
  and mps.game_id = (select game_id from mimic_handle)
  and gp.seat = 2;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'ffffffff-ffff-4fff-8fff-ffffffffffff', true);
select extensions.lives_ok(
  $$select public.activate_mimic_turn(
    (select id from public.mimic_turns
     where game_id = (select game_id from mimic_handle) and status = 'prepared')
  )$$,
  'the surviving host activates its next prepared turn'
);
select extensions.lives_ok(
  $$select public.pass_mimic_turn(
    (select id from public.mimic_turns
     where game_id = (select game_id from mimic_handle) and status = 'active')
  )$$,
  'the surviving host completes the next expression and passes normally'
);

select set_config('request.jwt.claim.sub', '99999999-9999-4999-8999-999999999999', true);
select extensions.lives_ok(
  $$select public.activate_mimic_turn(
    (select id from public.mimic_turns
     where game_id = (select game_id from mimic_handle) and status = 'prepared')
  )$$,
  'the last-life player receives its own final turn'
);
reset role;

update public.mimic_turns
set started_at = clock_timestamp() - interval '8 seconds',
    deadline_at = clock_timestamp() - interval '1 second'
where game_id = (select game_id from mimic_handle) and status = 'active';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'ffffffff-ffff-4fff-8fff-ffffffffffff', true);
select extensions.is(
  (
    public.expire_mimic_turn(
      (select id from public.mimic_turns
       where game_id = (select game_id from mimic_handle) and status = 'active')
    )->>'status'
  ),
  'completed',
  'the match completes as soon as one player remains alive'
);
select extensions.is(
  (
    public.game_state((select game_id from mimic_handle))
      ->'mimicBattle'->>'winnerSeat'
  )::integer,
  1,
  'the authoritative result names the last alive seat as winner'
);
select extensions.is(
  (public.request_rematch((select game_id from mimic_handle))->>'rematchReadyCount')::integer,
  1,
  'the first Face Bomb rematch vote waits for the other player'
);

select set_config('request.jwt.claim.sub', '99999999-9999-4999-8999-999999999999', true);
select extensions.is(
  public.request_rematch((select game_id from mimic_handle))->>'gameKind',
  'mimic_rush',
  'the rematch trigger preserves Face Bomb instead of reverting to Camera Quest'
);
reset role;

select extensions.ok(
  not has_function_privilege(
    'authenticated',
    'public.finish_mimic_turn(uuid,boolean)',
    'EXECUTE'
  ),
  'browser identities cannot call the internal life/turn transition directly'
);
select extensions.ok(
  has_function_privilege(
    'authenticated',
    'public.expire_mimic_turn(uuid)',
    'EXECUTE'
  ),
  'every table member can run the deadline watchdog through its guarded RPC'
);

select * from extensions.finish();
rollback;

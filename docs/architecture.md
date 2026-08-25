# Camera Quest architecture

## System boundary

```mermaid
flowchart LR
  B["Mobile/Desktop browser<br/>Next.js + XState"]
  E["Supabase Edge game-api<br/>Seoul"]
  A["Supabase Anonymous Auth"]
  D[("Postgres + RLS + RPC<br/>authoritative state")]
  V["Modal T4/L4 GPU ASGI<br/>JWT + specialists + RF-DETR-L"]
  M["Gemini Flash<br/>borderline object only"]

  B -->|"typed commands; no score"| E
  E --> A
  E -->|"transactional RPC"| D
  B -->|"authenticated WebSocket<br/>transient JPEG stream"| V
  V -->|"JWKS / owner / active turn"| A
  V -->|"read once; resolve RPC"| D
  V -.->|"0.45–0.65 only"| M
```

The browser owns presentation, camera lifecycle, ROI capture, and the visible timer. XState is the only client game-flow state. PostgreSQL owns quest selection, server deadline, score, XP, level, streak, achievements, and idempotency. Modal owns calibration and vision validation, but cannot choose the quest from client input.

No browser ML runtime ships in production. `LocalGameRepository` and the force-success controls are selected only in explicit development mode.

## Turn sequence

```mermaid
sequenceDiagram
  actor P as Player
  participant B as Browser/XState
  participant V as Modal GPU ASGI
  participant E as Supabase game-api
  participant D as Postgres RPC

  P->>B: Бэлэн
  B->>V: /v1/calibrate + 5 neutral frames
  V->>V: fixed batch 5 object scan
  V-->>B: signed calibration token + baseline
  B->>E: prepare-turn
  E->>D: select non-repeated quest + insert prepared turn
  D-->>B: turnId + quest
  B->>B: reveal then 3–2–1
  B->>E: activate-turn
  E->>D: lock row; set server deadline +30s
  D-->>B: startedAt + deadlineAt + serverNow
  B->>V: open /v1/stream; authenticate + turnId + calibration token
  V->>D: verify owner and load active turn/config once
  loop one streamed batch in flight
    B->>V: sequenceNo then 5 frames as each JPEG is encoded
    V->>V: specialist early consensus or local RF-DETR batch
    alt continue
      V->>D: record metadata-only attempt
      V-->>B: progress + normalized boxes
    else pass
      V->>D: resolve_turn under row lock
      D-->>V: score/XP/level/streak/achievements
      V-->>B: authoritative pass outcome
    else system error
      V->>D: abort_turn
      V-->>B: penalty-free replay signal
    end
  end
```

The visible countdown derives from `deadlineAt + serverClockOffset`, not an incrementing React timer. Background tab throttling therefore does not pause the turn. `resolve_turn` locks the turn and returns the existing result if the same pass arrives twice.

## Environments

A game names the room it is played in — `school`, `home` or `outdoor` — and `prepare_turn` filters
the quest pool by it, so a fridge is never asked for in a schoolyard. The host chooses once, at
creation; joining phones inherit it. Every environment keeps more than the five quests a player
needs, and `quests.environments` is a `game_environment[]` so one object can belong to several rooms.

The finger-counting quest was removed down to the enum value, along with its validator, the hand
landmarker asset and the calibration baseline that supported it.

## Online tables

A host opens a table with `create_online_game`, which returns a six-character join code; up to five
more phones call `join_game` with it. Seats, colours and avatars are assigned by the server, so two
phones can never collide. The lobby closes when the host calls `start_online_game`.

```mermaid
sequenceDiagram
  participant H as Host phone
  participant G as Guest phone
  participant D as Postgres RPC
  participant R as Supabase Realtime

  H->>D: create_online_game → join code
  G->>D: join_game(code) → seat
  D-->>R: games/game_players change
  R-->>H: refetch game_state
  H->>D: start_online_game (lobby closes)
  D-->>R: authoritative start change
  R-->>H: every phone enters round intro; no second Start action
  R-->>G: every phone enters round intro; no second Start action
  loop each turn
    Note over H,G: only the seat matching games.current_seat opens a camera
    D-->>R: turns change
    R-->>G: refetch game_state → spectate, then see the result
    H->>D: advance_turn_pointer(round, seat)
  end
```

`games.current_round`/`current_seat` are the only turn order. `advance_turn_pointer` is a
compare-and-swap on the pointer the caller observed, so two phones reporting the same finished turn
move the table exactly once, and any member — not only the host — can advance it or expire a turn
that is five seconds past its deadline. That is what keeps a dropped phone from freezing the table.

Realtime change events are treated as a signal, not as data: every event triggers a `game_state`
read, and a slow poll runs behind it so a coalesced or dropped event cannot desynchronize a phone.

While a turn runs, the waiting phones watch it live. Two transports carry that, both over the same
**private** `spectate:<gameId>` channel, which is authorized by RLS on `realtime.messages` through
`is_game_member` — never by an unguessable topic:

- **WebRTC** is the primary path. The channel doubles as the signalling bus, so a real peer-to-peer
  video call needs no server of its own and no paid service: public STUN, no TURN, no SFU. The
  playing phone is always the offerer — it is the only side with media — so there is no glare to
  resolve. Each watcher gets a detail-biased 640×360-class sender capped at 500 kbps and 20 fps,
  which keeps a five-peer mesh bounded without reducing small objects to a 240p blur.
- **JPEG frames** are the fallback, at 288px and about 10 fps with adaptive JPEG quality. They carry the view until WebRTC
  connects and permanently for networks where a direct connection never will. The publisher tracks
  which watchers reported `transport: "webrtc"` and stops sending frames only once none are left on
  the fallback. Smoothness there comes from three things: the browser client raises Realtime's
  default 10 events/second throttle, encoding uses async `toBlob` rather than the main-thread
  blocking `toDataURL`, and the publisher paces itself so a slow phone drops frames instead of
  queueing a backlog.

Both payloads arrive from another player's browser and are re-validated with Zod on receipt; the
image must be a `data:image/jpeg;base64,` URL, and an SDP is length-bounded. The live view is
presentation only: it is captured separately from the scoring frames, it can never delay a batch or
change a verdict, and the player sees a banner naming how many people are watching.

## Code layout and dependency direction

```text
src/app → feature UI → feature application → domain
                         ↓
                    repository interface
                         ↓
             Supabase or local-dev adapter

camera → raw MediaStream + full visible frame + streamed 512px JPEG samples
vision → generated OpenAPI types + runtime Zod validation
progression → display-only achievement/level formatting
```

- `src/features/game/domain`: pure rules and types; no React, network, or storage.
- `src/features/game/application`: XState machine and use cases.
- `src/features/game/infrastructure`: command API and repository adapters.
- `src/features/game/ui`: preserved screens and visual components; they only render and forward input.
- `src/features/camera`: camera and frame capture; it never scores or stores images.
- `src/features/vision`: persistent WebSocket transport with HTTP fallback, DTO validation,
  overlays, and one-in-flight loop.
- `supabase/migrations`: authoritative data and transaction boundary.
- `vision-service/app/validators`: interchangeable specialist validators behind one interface.

Direct imports are intentional. Do not add barrel files or duplicate Supabase server state into another client store.

## Data and security invariants

- Anonymous Supabase `auth.uid()` owns every local profile and game. All user-facing tables have RLS.
- Online tables read by membership, not by ownership: `is_game_member(game_id)` is a security definer
  function so a policy on `game_players` cannot recurse into itself. Writes stay RPC-only.
- `game_players.owner_id` is the seat's auth user — the host in a local game, each phone online.
  Every turn RPC and the vision service authorize against that seat, never against `games.owner_id`.
- Browser roles can call command RPCs but cannot execute `resolve_turn`, `record_vision_attempt`, or `abort_turn`.
- Modal verifies JWT signature through Supabase JWKS, issuer, audience, and that `sub` equals the
  owner of the turn's seat. The host of an online table cannot validate — and so cannot score —
  another player's turn.
- Vision validates the database quest/config; target, score, model version, and deadline are never trusted from browser fields.
- `vision_attempts` stores latency/confidence/decision/reason only. No bytea, URL, frame, or image column exists.
- Non-pass attempt telemetry is queued with Modal `.spawn()` so its idempotent Supabase RPC does
  not delay the verdict. Pass resolution, deadline checks, score, XP, and abort remain synchronous.
- Stream authentication sends the access token in the first WebSocket message, never in the URL;
  browser `Origin` must match the allowlist. The active turn/config is cached only for that socket,
  while deadline and transactional resolution remain authoritative.
- Frame batches are five 512×512 JPEGs, each capped at 300 KB and the batch capped at 1.5 MiB.
- Calibration tokens are HMAC-signed, owner-bound, and expire after 10 minutes.
- Sequence numbers have container-fast replay/rate checks and a database unique key as the global guard.
  Only an authorized active turn enters that replay map; inactive keys expire after 10 minutes and
  the map has a hard 10,000-key bound. Warmup, calibration, and validation also carry per-subject quotas.
- If Sentry is enabled, its scrubbers delete request bodies/cookies and filter image/frame-like
  fields on both Next.js and Python. Empty DSNs keep observability disabled without changing game
  behavior.
- A turn with zero successful vision attempts gets one penalty-free replay. Retry state propagates to the replacement turn so it cannot loop forever.

## Add a quest using an existing validator

1. Add a new migration that inserts a `quests` row. Do not edit an already-deployed seed migration.
2. Use one of `object`, `smile`, or `color`, a valid difficulty, and validator config matching that validator.
   Set `environments` to the rooms the quest is plausible in; the default is all three.
3. Ensure each difficulty has enough active quests **per environment** for five rounds without repeating per player.
4. Add domain fixture only if local/E2E mode needs the quest.
5. Run DB reset, pgTAP, contract generation, frontend tests, and live accuracy trials.

Threshold changes belong in `validator_config`; they should not require a frontend or Python code deploy.

## Add a validator kind

1. Implement `Validator` from `vision-service/app/validators/base.py`; keep consensus deterministic and return normalized detections.
2. Register it in `vision-service/app/services.py` and add unit tests with synthetic/public fixtures.
3. Add the kind to the Postgres enum/quest constraint, Python `QuestConfig`, TypeScript `ChallengeKind`, and runtime Zod schema through migrations/contracts.
4. Regenerate FastAPI OpenAPI and TypeScript types. Never edit `src/generated/vision-api.ts` by hand.
5. Add calibration claims only when the validator truly needs a neutral baseline.
6. Run false-pass/true-pass release trials and record a new validator version on resolved turns.

## Add an achievement

1. Insert immutable metadata in a new migration.
2. Add the authoritative predicate to `unlock_achievements`; use cumulative stats or the locked game/profile row, never client claims.
3. Add the display name to `achievementPresentation.ts`.
4. Add pgTAP cases for unlock threshold, duplicate unlock, and ownership.

## Generated contracts

FastAPI generates `vision-service/openapi.json`; `openapi-typescript` generates `src/generated/vision-api.ts`. Supabase generates `src/generated/database.types.ts`. `npm run check:contracts` detects committed JSON/TypeScript and migration hash drift. CI separately runs `generate_openapi.py --check`, closing the Python → OpenAPI side of the chain.

## Failure policy

- Camera denied: no turn starts; show retry and permission help.
- Vision/GPU/Gemini exception: abort, do not reset streak, and replay the same player.
- Gemini failure: treat it as `continue`; RF-DETR remains primary.
- Browser timeout: call `expire_turn`; respect positive `remainingMs` if its clock was early.
- Modal outage before a valid attempt: one penalty-free retry. Sustained outage should disable new games with `VISION_ENABLED` operationally.
- Duplicate network delivery: SQL row lock and existing result make scoring idempotent.

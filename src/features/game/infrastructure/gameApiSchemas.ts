import { z } from "zod";

const colorSchema = z.enum(["violet", "blue", "lime", "orange", "pink", "cyan"]);
const serverTimestampSchema = z.iso.datetime({ offset: true });
const environmentSchema = z.enum(["school", "home", "outdoor"]);

export const playerSchema = z.object({
  id: z.uuid(),
  profileId: z.uuid().optional(),
  seat: z.number().int().min(1).max(6),
  name: z.string().min(1).max(24),
  color: colorSchema,
  avatar: z.string().min(1).max(16),
  score: z.number().int().nonnegative(),
  totalXp: z.number().int().nonnegative(),
  level: z.number().int().min(1).max(50),
  streak: z.number().int().nonnegative(),
});

export const challengeSchema = z.object({
  id: z.uuid().or(z.string().min(1)),
  kind: z.enum(["object", "smile", "color"]),
  label: z.string().min(1),
  prompt: z.string().min(1),
  difficulty: z.enum(["easy", "medium", "hard"]),
  targetClass: z.string().nullish().transform((value) => value ?? undefined),
  color: z.enum(["red", "blue", "green", "yellow"]).nullish().transform((value) => value ?? undefined),
  hex: z.string().nullish().transform((value) => value ?? undefined),
  validatorConfig: z.record(z.string(), z.unknown()),
});

export const gameSessionSchema = z.object({
  gameId: z.uuid(),
  environment: environmentSchema.default("home"),
  players: z.array(playerSchema).min(1).max(6),
});

export const preparedTurnSchema = z.object({
  turnId: z.uuid(),
  challenge: challengeSchema,
});

export const activeTurnSchema = z.object({
  turnId: z.uuid(),
  startedAt: serverTimestampSchema,
  deadlineAt: serverTimestampSchema,
  serverNow: serverTimestampSchema,
});

export const turnOutcomeSchema = z.object({
  turnId: z.uuid(),
  playerId: z.uuid(),
  playerName: z.string(),
  playerColor: colorSchema,
  challengeId: z.uuid().or(z.string().min(1)),
  challengePrompt: z.string(),
  success: z.boolean(),
  timeMs: z.number().int().nonnegative(),
  points: z.number().int().nonnegative(),
  xp: z.number().int().nonnegative(),
  totalAfter: z.number().int().nonnegative(),
  totalXp: z.number().int().nonnegative(),
  level: z.number().int().min(1).max(50),
  streak: z.number().int().nonnegative(),
  unlockedAchievementIds: z.array(z.string()),
  systemError: z.boolean().optional(),
  retryAllowed: z.boolean().optional(),
});

export const expireTurnSchema = z.object({
  outcome: turnOutcomeSchema.optional(),
  remainingMs: z.number().int().positive().optional(),
});

const lobbyPlayerSchema = playerSchema.extend({
  ready: z.boolean(),
  left: z.boolean(),
  isSelf: z.boolean(),
});

const lobbyTurnSchema = z
  .object({
    turnId: z.uuid(),
    seat: z.number().int().min(1).max(6),
    round: z.number().int().min(1).max(5),
    status: z.enum(["prepared", "active", "passed", "timed_out", "aborted"]),
    deadlineAt: serverTimestampSchema.nullish().transform((value) => value ?? null),
    prompt: z.string().min(1),
    // An unresolved turn carries `{}`; only a finished one has an outcome.
    result: z.unknown().transform((value) => turnOutcomeSchema.safeParse(value).data ?? null),
  })
  .transform(({ result, ...turn }) => ({ ...turn, outcome: result }));

export const lobbyStateSchema = z.object({
  gameId: z.uuid(),
  mode: z.enum(["local", "online"]),
  environment: environmentSchema,
  status: z.enum(["active", "completed", "abandoned"]),
  joinCode: z.string().length(6).nullish().transform((value) => value ?? null),
  lobbyOpen: z.boolean(),
  currentRound: z.number().int().min(1).max(5),
  currentSeat: z.number().int().min(1).max(6),
  isHost: z.boolean(),
  selfSeat: z.number().int().min(1).max(6).nullish().transform((value) => value ?? null),
  players: z.array(lobbyPlayerSchema).min(1).max(6),
  lastTurn: lobbyTurnSchema.nullish().transform((value) => value ?? null),
});

/** Broadcast payloads come from another player's browser, so they are validated. */
export const turnPreviewFrameSchema = z.object({
  seat: z.number().int().min(1).max(6),
  turnId: z.uuid(),
  image: z.string().max(80_000).startsWith("data:image/jpeg;base64,"),
  progress: z.number().min(0).max(1),
  detections: z
    .array(
      z.object({
        label: z.string().max(80),
        score: z.number().min(0).max(1),
        box: z.object({
          x: z.number(),
          y: z.number(),
          w: z.number(),
          h: z.number(),
        }),
        isTarget: z.boolean(),
      }),
    )
    .max(12),
});

/** Negotiation messages also come from a peer's browser, so they are bounded. */
export const turnSignalSchema = z.object({
  kind: z.enum(["watch", "offer", "answer", "ice", "transport"]),
  from: z.string().min(8).max(64),
  to: z.string().min(8).max(64).optional(),
  // An SDP is large but bounded; anything past this is not a session
  // description this game produced.
  sdp: z.string().max(20_000).optional(),
  candidate: z
    .object({
      candidate: z.string().max(1_000),
      sdpMid: z.string().max(16).nullable(),
      sdpMLineIndex: z.number().int().min(0).max(16).nullable(),
      usernameFragment: z.string().max(256).nullable(),
    })
    .optional(),
  transport: z.enum(["webrtc", "jpeg"]).optional(),
});

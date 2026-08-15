import { z } from "zod";

const colorSchema = z.enum(["violet", "blue", "lime", "orange", "pink", "cyan"]);
const serverTimestampSchema = z.iso.datetime({ offset: true });

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
  kind: z.enum(["object", "fingers", "smile", "color"]),
  label: z.string().min(1),
  prompt: z.string().min(1),
  difficulty: z.enum(["easy", "medium", "hard"]),
  targetClass: z.string().nullish().transform((value) => value ?? undefined),
  fingerCount: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).nullish().transform((value) => value ?? undefined),
  color: z.enum(["red", "blue", "green", "yellow"]).nullish().transform((value) => value ?? undefined),
  hex: z.string().nullish().transform((value) => value ?? undefined),
  validatorConfig: z.record(z.string(), z.unknown()),
});

export const gameSessionSchema = z.object({
  gameId: z.uuid(),
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

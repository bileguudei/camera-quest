import { z } from "npm:zod@4";

export const commandSchema = z.discriminatedUnion("command", [
  z.object({
    command: z.literal("create-game"),
    payload: z.object({
      players: z.array(z.object({
        seat: z.number().int().min(1).max(6),
        name: z.string().trim().min(1).max(24),
        avatar: z.string().min(1).max(16),
        color: z.enum(["violet", "blue", "lime", "orange", "pink", "cyan"]),
        profileId: z.string().uuid().optional(),
      })).min(1).max(6),
    }),
  }),
  z.object({
    command: z.literal("prepare-turn"),
    payload: z.object({
      gameId: z.string().uuid(),
      playerId: z.string().uuid(),
      round: z.number().int().min(1).max(5),
      calibrationToken: z.string().min(16).max(4096),
      backgroundClasses: z.array(z.string().max(80)).max(50),
    }),
  }),
  z.object({
    command: z.literal("activate-turn"),
    payload: z.object({ turnId: z.string().uuid() }),
  }),
  z.object({
    command: z.literal("expire-turn"),
    payload: z.object({ turnId: z.string().uuid() }),
  }),
  z.object({
    command: z.literal("complete-game"),
    payload: z.object({ gameId: z.string().uuid() }),
  }),
  z.object({
    command: z.literal("abandon-game"),
    payload: z.object({ gameId: z.string().uuid() }),
  }),
]);

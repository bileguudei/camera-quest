import { z } from "npm:zod@4";

// Online seats take their colour and avatar from the seat the server hands
// out, so two phones can never show up in the same colour.
const displayName = z.string().trim().min(1).max(24);
// The room the host plays in; the RPC draws every quest of the game from it.
const environment = z.enum(["school", "home", "outdoor"]);

export const commandSchema = z.discriminatedUnion("command", [
  z.object({
    command: z.literal("create-game"),
    payload: z.object({
      environment,
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
    command: z.literal("create-online-game"),
    payload: z.object({ name: displayName, environment }),
  }),
  z.object({
    command: z.literal("join-game"),
    payload: z.object({
      // Six characters over an unambiguous alphabet; case is normalized here so
      // a player typing lowercase still finds the lobby.
      joinCode: z.string().trim().length(6).regex(/^[A-Za-z0-9]{6}$/),
      name: displayName,
    }),
  }),
  z.object({
    command: z.literal("game-state"),
    payload: z.object({ gameId: z.string().uuid() }),
  }),
  z.object({
    command: z.literal("set-ready"),
    payload: z.object({ gameId: z.string().uuid(), ready: z.boolean() }),
  }),
  z.object({
    command: z.literal("leave-game"),
    payload: z.object({ gameId: z.string().uuid() }),
  }),
  z.object({
    command: z.literal("start-online-game"),
    payload: z.object({ gameId: z.string().uuid() }),
  }),
  z.object({
    command: z.literal("advance-turn"),
    payload: z.object({
      gameId: z.string().uuid(),
      // The pointer the caller believes finished; the RPC only advances on a
      // match, so two phones reporting the same turn advance the game once.
      fromRound: z.number().int().min(1).max(5),
      fromSeat: z.number().int().min(1).max(6),
    }),
  }),
  z.object({
    command: z.literal("abandon-game"),
    payload: z.object({ gameId: z.string().uuid() }),
  }),
]);

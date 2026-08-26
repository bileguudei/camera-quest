import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@4";
import { commandSchema } from "./schema.ts";
import { bearerToken, supabasePublicKey } from "./requestPolicy.ts";
import { headersFor } from "./corsPolicy.ts";

const allowedOrigins = new Set(
  (Deno.env.get("CORS_ALLOWED_ORIGINS") ?? "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

const json = (origin: string | null, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: headersFor(origin, allowedOrigins) });

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: allowedOrigins.has(origin ?? "") ? 204 : 403,
      headers: headersFor(origin, allowedOrigins),
    });
  }
  if (request.method !== "POST" || (origin && !allowedOrigins.has(origin))) {
    return json(origin, { code: "INVALID_REQUEST" }, 403);
  }
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 64_000) return json(origin, { code: "INVALID_REQUEST" }, 413);

  const authorization = request.headers.get("authorization");
  const accessToken = bearerToken(authorization);
  if (!accessToken) return json(origin, { code: "UNAUTHORIZED" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publicKey = supabasePublicKey(
    Deno.env.get("SUPABASE_PUBLISHABLE_KEYS"),
    Deno.env.get("SUPABASE_ANON_KEY"),
  );
  if (!supabaseUrl || !publicKey) return json(origin, { code: "GAME_UNAVAILABLE" }, 503);
  const client = createClient(supabaseUrl, publicKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });

  const user = await client.auth.getUser(accessToken);
  if (user.error || !user.data.user) return json(origin, { code: "UNAUTHORIZED" }, 401);

  let parsed: z.infer<typeof commandSchema>;
  try {
    parsed = commandSchema.parse(await request.json());
  } catch {
    return json(origin, { code: "INVALID_REQUEST" }, 400);
  }

  const rpc = (() => {
    switch (parsed.command) {
      case "create-game":
        return client.rpc("create_game", {
          p_players: parsed.payload.players,
          p_environment: parsed.payload.environment,
        });
      case "prepare-turn":
        return client.rpc("prepare_turn", {
          p_game_id: parsed.payload.gameId,
          p_player_id: parsed.payload.playerId,
          p_round: parsed.payload.round,
          p_background_classes: parsed.payload.backgroundClasses,
        });
      case "activate-turn":
        return client.rpc("activate_turn", { p_turn_id: parsed.payload.turnId });
      case "expire-turn":
        return client.rpc("expire_turn", { p_turn_id: parsed.payload.turnId });
      case "recover-disconnected-turn":
        return client.rpc("recover_disconnected_turn", { p_turn_id: parsed.payload.turnId });
      case "complete-game":
        return client.rpc("complete_game", { p_game_id: parsed.payload.gameId });
      case "abandon-game":
        return client.rpc("abandon_game", { p_game_id: parsed.payload.gameId });
      case "create-online-game":
        return client.rpc("create_online_game", {
          p_name: parsed.payload.name,
          p_environment: parsed.payload.environment,
          p_game_kind: parsed.payload.gameKind,
        });
      case "join-game":
        return client.rpc("join_game", {
          p_join_code: parsed.payload.joinCode.toUpperCase(),
          p_name: parsed.payload.name,
        });
      case "game-state":
        return client.rpc("game_state", { p_game_id: parsed.payload.gameId });
      case "set-ready":
        return client.rpc("set_player_ready", {
          p_game_id: parsed.payload.gameId,
          p_ready: parsed.payload.ready,
        });
      case "leave-game":
        return client.rpc("leave_game", { p_game_id: parsed.payload.gameId });
      case "start-online-game":
        return client.rpc("start_online_game", { p_game_id: parsed.payload.gameId });
      case "activate-mimic-turn":
        return client.rpc("activate_mimic_turn", { p_turn_id: parsed.payload.turnId });
      case "pass-mimic-turn":
        return client.rpc("pass_mimic_turn", { p_turn_id: parsed.payload.turnId });
      case "expire-mimic-turn":
        return client.rpc("expire_mimic_turn", { p_turn_id: parsed.payload.turnId });
      case "heartbeat-game":
        return client.rpc("heartbeat_game", { p_game_id: parsed.payload.gameId });
      case "request-rematch":
        return client.rpc("request_rematch", { p_game_id: parsed.payload.gameId });
      case "issue-vision-ticket":
        return client.rpc("issue_vision_ticket", {
          p_game_id: parsed.payload.gameId,
          p_purpose: "calibrate",
        });
      case "advance-turn":
        return client.rpc("advance_turn_pointer", {
          p_game_id: parsed.payload.gameId,
          p_from_round: parsed.payload.fromRound,
          p_from_seat: parsed.payload.fromSeat,
        });
    }
  })();

  const result = await rpc;
  if (result.error) {
    const known = [
      "TURN_EXPIRED", "TURN_NOT_ACTIVE", "GAME_NOT_OWNED", "NO_QUEST_AVAILABLE",
      "GAME_NOT_FOUND", "LOBBY_FULL", "LOBBY_CLOSED", "NOT_YOUR_TURN",
      "TURN_STILL_OPEN", "NOT_ENOUGH_PLAYERS", "JOIN_CODE_UNAVAILABLE",
      "REMATCH_NOT_AVAILABLE", "INVALID_VISION_PURPOSE",
      "PLAYERS_NOT_READY", "MIMIC_TURN_NOT_READY", "MIMIC_TURN_EXPIRED",
    ];
    const code = known.find((value) => result.error.message.includes(value)) ?? "GAME_UNAVAILABLE";
    return json(origin, { code, message: code }, code === "GAME_UNAVAILABLE" ? 503 : 409);
  }
  return json(origin, result.data);
});

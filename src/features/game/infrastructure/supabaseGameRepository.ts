"use client";

import { z } from "zod";
import { FunctionRegion } from "@supabase/supabase-js";
import type { GameEnvironment, LobbyState } from "@/features/game/domain/types";
import type { GameRepository } from "./gameRepository";
import type {
  CreateGameInput,
  PrepareTurnInput,
  TurnChannel,
  TurnChannelHandlers,
} from "./gameRepository";
import type { TurnFeedbackReason } from "./gameRepository";
import {
  activeTurnSchema,
  turnPreviewFrameSchema,
  turnSignalSchema,
  expireTurnSchema,
  gameSessionSchema,
  lobbyStateSchema,
  preparedTurnSchema,
} from "./gameApiSchemas";
import {
  ensureAnonymousAccessToken,
  getSupabaseBrowserClient,
} from "@/shared/supabase/browserClient";
import { AppError } from "@/shared/errors/appError";

/** Realtime is the fast path; this is the safety net behind it. */
const LOBBY_POLL_MS = 10_000;

const commandErrorSchema = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
});

export class SupabaseGameRepository implements GameRepository {
  readonly mode = "supabase" as const;

  async createGame(input: CreateGameInput) {
    return gameSessionSchema.parse(
      await this.command("create-game", {
        environment: input.environment,
        players: input.players.map(({ name, avatar, color, seat, profileId }) => ({
          name,
          avatar,
          color,
          seat,
          profileId,
        })),
      }),
    );
  }

  async prepareTurn(input: PrepareTurnInput) {
    return preparedTurnSchema.parse(await this.command("prepare-turn", input));
  }

  async activateTurn(turnId: string) {
    return activeTurnSchema.parse(await this.command("activate-turn", { turnId }));
  }

  async expireTurn(turnId: string) {
    return expireTurnSchema.parse(await this.command("expire-turn", { turnId }));
  }

  async completeGame(gameId: string) {
    await this.command("complete-game", { gameId });
  }

  async abandonGame(gameId: string) {
    await this.command("abandon-game", { gameId });
  }

  async submitTurnFeedback(turnId: string, reason: TurnFeedbackReason) {
    await ensureAnonymousAccessToken();
    const client = getSupabaseBrowserClient();
    const user = await client.auth.getUser();
    if (user.error || !user.data.user) throw user.error ?? new Error("Anonymous user missing");
    const result = await client.from("turn_feedback").insert({
      turn_id: turnId,
      owner_id: user.data.user.id,
      reason,
    });
    if (result.error) throw result.error;
  }

  async createOnlineGame(name: string, environment: GameEnvironment) {
    return lobbyStateSchema.parse(
      await this.command("create-online-game", { name, environment }),
    );
  }

  async joinGame(joinCode: string, name: string) {
    return lobbyStateSchema.parse(
      await this.command("join-game", { joinCode: joinCode.trim().toUpperCase(), name }),
    );
  }

  async readGameState(gameId: string) {
    return lobbyStateSchema.parse(await this.command("game-state", { gameId }));
  }

  async setReady(gameId: string, ready: boolean) {
    return lobbyStateSchema.parse(await this.command("set-ready", { gameId, ready }));
  }

  async startOnlineGame(gameId: string) {
    return lobbyStateSchema.parse(await this.command("start-online-game", { gameId }));
  }

  async leaveGame(gameId: string) {
    await this.command("leave-game", { gameId });
  }

  async advanceTurn(gameId: string, fromRound: number, fromSeat: number) {
    return lobbyStateSchema.parse(
      await this.command("advance-turn", { gameId, fromRound, fromSeat }),
    );
  }

  subscribeToGame(gameId: string, onState: (state: LobbyState) => void) {
    const client = getSupabaseBrowserClient();
    let closed = false;
    let refreshing = false;
    let queued = false;

    // The change events are only a signal. Reading the authoritative snapshot
    // back means a dropped or coalesced event cannot leave a phone out of sync.
    const refresh = async () => {
      if (closed) return;
      if (refreshing) {
        queued = true;
        return;
      }
      refreshing = true;
      try {
        const state = await this.readGameState(gameId);
        if (!closed) onState(state);
      } catch {
        // A transient read failure is covered by the next event or poll.
      } finally {
        refreshing = false;
        if (queued && !closed) {
          queued = false;
          void refresh();
        }
      }
    };

    const channel = client.channel(`game:${gameId}`);
    for (const table of ["games", "game_players", "turns"] as const) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: table === "games" ? `id=eq.${gameId}` : `game_id=eq.${gameId}`,
        },
        () => void refresh(),
      );
    }
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") void refresh();
    });

    // Realtime can drop silently on a phone that backgrounds; a slow poll keeps
    // the table honest without turning into a busy loop.
    const poll = window.setInterval(() => void refresh(), LOBBY_POLL_MS);

    return () => {
      closed = true;
      window.clearInterval(poll);
      void client.removeChannel(channel);
    };
  }

  joinTurnChannel(gameId: string, handlers: TurnChannelHandlers): TurnChannel {
    const client = getSupabaseBrowserClient();
    // Private: a camera stream must be authorized per game, not merely hidden
    // behind an unguessable topic. RLS on realtime.messages is the gate, and
    // the WebRTC offers travelling here inherit exactly the same rule.
    const channel = client.channel(`spectate:${gameId}`, {
      config: { private: true, broadcast: { self: false } },
    });
    let ready = false;

    channel.on("broadcast", { event: "frame" }, (message) => {
      const frame = turnPreviewFrameSchema.safeParse(message.payload);
      if (frame.success) handlers.onFrame?.(frame.data);
    });
    channel.on("broadcast", { event: "signal" }, (message) => {
      const signal = turnSignalSchema.safeParse(message.payload);
      if (signal.success) handlers.onSignal?.(signal.data);
    });

    // A private channel is authorized by the socket's JWT, so the token has to
    // be on the socket before the join — not whenever the session listener runs.
    void ensureAnonymousAccessToken()
      .then((token) => {
        client.realtime.setAuth(token);
        channel.subscribe((status) => {
          ready = status === "SUBSCRIBED";
        });
      })
      .catch(() => {
        // Without a session there is nothing to watch; the turn still plays.
      });

    const send = (event: string, payload: unknown) => {
      // Dropping a message while the socket is still joining is correct: the
      // watch ping repeats and the turn clock never waits for a preview.
      if (!ready) return;
      void channel.send({ type: "broadcast", event, payload });
    };

    return {
      publishFrame: (frame) => send("frame", frame),
      publishSignal: (signal) => send("signal", signal),
      close: () => {
        ready = false;
        void client.removeChannel(channel);
      },
    };
  }

  getAccessToken() {
    return ensureAnonymousAccessToken();
  }

  private async command(command: string, payload: unknown): Promise<unknown> {
    await ensureAnonymousAccessToken();
    const response = await getSupabaseBrowserClient().functions.invoke("game-api", {
      body: { command, payload },
      region: FunctionRegion.ApNortheast2,
      timeout: 10_000,
    });
    if (!response.error) return response.data;

    let errorPayload: unknown = response.data;
    if (response.error.context instanceof Response) {
      try {
        errorPayload = await response.error.context.clone().json();
      } catch {
        // The SDK message below remains the safe fallback for non-JSON failures.
      }
    }
    const parsed = commandErrorSchema.safeParse(errorPayload);
    throw new AppError(
      parsed.data?.code === "TURN_EXPIRED" ? "TURN_EXPIRED" : "GAME_UNAVAILABLE",
      parsed.data?.message ?? response.error.message,
      true,
    );
  }
}

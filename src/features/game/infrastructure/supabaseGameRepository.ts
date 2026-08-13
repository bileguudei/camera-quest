"use client";

import { z } from "zod";
import { FunctionRegion } from "@supabase/supabase-js";
import type { GameRepository } from "./gameRepository";
import type { CreateGameInput, PrepareTurnInput } from "./gameRepository";
import type { TurnFeedbackReason } from "./gameRepository";
import {
  activeTurnSchema,
  expireTurnSchema,
  gameSessionSchema,
  preparedTurnSchema,
} from "./gameApiSchemas";
import {
  ensureAnonymousAccessToken,
  getSupabaseBrowserClient,
} from "@/shared/supabase/browserClient";
import { AppError } from "@/shared/errors/appError";

const commandErrorSchema = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
});

export class SupabaseGameRepository implements GameRepository {
  readonly mode = "supabase" as const;

  async createGame(input: CreateGameInput) {
    return gameSessionSchema.parse(
      await this.command("create-game", {
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

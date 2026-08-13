import { AppError } from "@/shared/errors/appError";
import type { GameRepository } from "./gameRepository";

const unavailable = (): never => {
  throw new AppError(
    "GAME_UNAVAILABLE",
    "Production backend environment тохируулагдаагүй байна.",
  );
};

/** Prevents a misconfigured production deploy from silently becoming a fake game. */
export class UnavailableGameRepository implements GameRepository {
  readonly mode = "unavailable" as const;
  async createGame() { return unavailable(); }
  async prepareTurn() { return unavailable(); }
  async activateTurn() { return unavailable(); }
  async expireTurn() { return unavailable(); }
  async completeGame() { return unavailable(); }
  async abandonGame() { return unavailable(); }
  async submitTurnFeedback() { return unavailable(); }
  async getAccessToken() { return unavailable(); }
}

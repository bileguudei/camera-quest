import type { GameRepository } from "./gameRepository";
import { UnavailableGameRepository } from "./unavailableGameRepository";

export function createEnvironmentRepository(): GameRepository {
  return new UnavailableGameRepository();
}

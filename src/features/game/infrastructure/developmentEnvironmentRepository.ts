import type { GameRepository } from "./gameRepository";
import { LocalGameRepository } from "./localGameRepository";

export function createEnvironmentRepository(): GameRepository {
  return new LocalGameRepository();
}

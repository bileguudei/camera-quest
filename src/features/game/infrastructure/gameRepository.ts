import type {
  ActiveTurn,
  GameSession,
  Player,
  PreparedTurn,
  TurnOutcome,
} from "@/features/game/domain/types";

export interface CreateGameInput {
  players: Player[];
}

export interface PrepareTurnInput {
  gameId: string;
  playerId: string;
  round: number;
  calibrationToken: string;
  backgroundClasses: string[];
}

export interface ExpireTurnResult {
  outcome?: TurnOutcome;
  remainingMs?: number;
}

export type TurnFeedbackReason = "false_positive" | "missed_target" | "slow" | "other";

/**
 * UI and XState depend only on this boundary. Supabase remains authoritative
 * in production; the local adapter exists solely for development and E2E.
 */
export interface GameRepository {
  readonly mode: "supabase" | "local" | "unavailable";
  createGame(input: CreateGameInput): Promise<GameSession>;
  prepareTurn(input: PrepareTurnInput): Promise<PreparedTurn>;
  activateTurn(turnId: string): Promise<ActiveTurn>;
  expireTurn(turnId: string): Promise<ExpireTurnResult>;
  completeGame(gameId: string): Promise<void>;
  abandonGame(gameId: string): Promise<void>;
  submitTurnFeedback(turnId: string, reason: TurnFeedbackReason): Promise<void>;
  resolveLocalTurn?(turnId: string, success: boolean, elapsedMs: number): Promise<TurnOutcome>;
  getAccessToken(): Promise<string>;
}

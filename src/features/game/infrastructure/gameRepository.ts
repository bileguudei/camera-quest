import type {
  ActiveTurn,
  GameEnvironment,
  GameKind,
  GameSession,
  LobbyState,
  Player,
  PreparedTurn,
  TurnOutcome,
  TurnPreviewFrame,
  TurnSignal,
} from "@/features/game/domain/types";

export interface CreateGameInput {
  players: Player[];
  environment: GameEnvironment;
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

export interface VisionTicket {
  ticket: string;
  expiresAt: string;
}

export interface TurnChannelHandlers {
  onFrame?: (frame: TurnPreviewFrame) => void;
  onSignal?: (signal: TurnSignal) => void;
}

export interface TurnChannel {
  publishFrame: (frame: TurnPreviewFrame) => void;
  publishSignal: (signal: TurnSignal) => void;
  close: () => void;
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
  recoverDisconnectedTurn(turnId: string): Promise<LobbyState>;
  completeGame(gameId: string): Promise<void>;
  abandonGame(gameId: string): Promise<void>;
  submitTurnFeedback(turnId: string, reason: TurnFeedbackReason): Promise<void>;
  /** Online lobbies. Every call returns the whole authoritative table state. */
  createOnlineGame(
    name: string,
    environment: GameEnvironment,
    gameKind: GameKind,
  ): Promise<LobbyState>;
  joinGame(joinCode: string, name: string): Promise<LobbyState>;
  readGameState(gameId: string): Promise<LobbyState>;
  setReady(gameId: string, ready: boolean): Promise<LobbyState>;
  startOnlineGame(gameId: string): Promise<LobbyState>;
  activateMimicTurn(turnId: string): Promise<LobbyState>;
  passMimicTurn(turnId: string): Promise<LobbyState>;
  expireMimicTurn(turnId: string): Promise<LobbyState>;
  heartbeatGame(gameId: string): Promise<LobbyState>;
  requestRematch(gameId: string): Promise<LobbyState>;
  issueVisionTicket(gameId: string): Promise<VisionTicket>;
  leaveGame(gameId: string): Promise<void>;
  /**
   * Compare-and-swap: the pointer only moves when the server agrees the caller
   * is reporting the turn that just finished, so two phones advance it once.
   */
  advanceTurn(gameId: string, fromRound: number, fromSeat: number): Promise<LobbyState>;
  /** Realtime fan-out; the callback receives a freshly read authoritative snapshot. */
  subscribeToGame(gameId: string, onState: (state: LobbyState) => void): () => void;
  /**
   * One private channel per game carrying both the camera preview frames and
   * the WebRTC negotiation between the phones. Sharing it means the live video
   * call inherits the same membership authorization and needs no other server.
   */
  joinTurnChannel(gameId: string, handlers: TurnChannelHandlers): TurnChannel;
  resolveLocalTurn?(turnId: string, success: boolean, elapsedMs: number): Promise<TurnOutcome>;
  getAccessToken(): Promise<string>;
}

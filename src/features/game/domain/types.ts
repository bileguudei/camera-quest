export type Phase =
  | "landing"
  | "onlineStart"
  | "lobby"
  | "setup"
  | "cameraCheck"
  | "roundIntro"
  | "playerHandoff"
  | "calibrating"
  | "questReveal"
  | "countdown"
  | "playing"
  | "turnResult"
  | "roundResult"
  | "mimicBattle"
  | "winner";

export type PlayerColorKey =
  | "violet"
  | "blue"
  | "lime"
  | "orange"
  | "pink"
  | "cyan";

export interface Player {
  id: string;
  profileId?: string;
  /** 1-based seat number controls the stable avatar and colour. */
  seat: number;
  name: string;
  color: PlayerColorKey;
  avatar: string;
  score: number;
  totalXp: number;
  level: number;
  streak: number;
}

export type GameMode = "local" | "online";
export type GameKind = "camera_quest" | "mimic_rush";

/** The room the host is playing in. It decides which objects can be asked for. */
export type GameEnvironment = "school" | "home" | "outdoor";

export interface LobbyPlayer extends Player {
  ready: boolean;
  left: boolean;
  connected: boolean;
  isHost: boolean;
  isSelf: boolean;
  /** Present only in an online Mimic Rush match. */
  mimicLives?: number;
  mimicEliminated?: boolean;
}

export type MimicBattleTurnStatus = "prepared" | "active" | "passed" | "failed";

export interface MimicBattleTurn {
  turnId: string;
  turnNumber: number;
  seat: number;
  challengeId: import("@/features/pose-party/domain/mimicRules").MimicChallengeId;
  status: MimicBattleTurnStatus;
  preparedAt: string;
  deadlineAt: string | null;
  durationMs: number;
}

export interface MimicBattleResult {
  turnId: string;
  seat: number;
  challengeId: import("@/features/pose-party/domain/mimicRules").MimicChallengeId;
  success: boolean;
  livesAfter: number;
}

/** Server-owned Face Bomb state carried inside the normal lobby snapshot. */
export interface MimicBattleState {
  turn: MimicBattleTurn | null;
  lastResult: MimicBattleResult | null;
  winnerSeat: number | null;
  serverNow: string;
}

export type TurnStatus = "prepared" | "active" | "passed" | "timed_out" | "aborted";

/** The last turn of the table, so a phone that is not playing can follow along. */
export interface LobbyTurn {
  turnId: string;
  seat: number;
  round: number;
  status: TurnStatus;
  deadlineAt: string | null;
  prompt: string;
  outcome: TurnOutcome | null;
}

/** Authoritative table state. Only the server moves `currentRound`/`currentSeat`. */
export interface LobbyState {
  gameId: string;
  mode: GameMode;
  gameKind: GameKind;
  environment: GameEnvironment;
  status: "active" | "completed" | "abandoned";
  joinCode: string | null;
  lobbyOpen: boolean;
  currentRound: number;
  currentSeat: number;
  isHost: boolean;
  selfSeat: number | null;
  players: LobbyPlayer[];
  lastTurn: LobbyTurn | null;
  rematchReadyCount: number;
  rematchPlayerCount: number;
  selfRematchReady: boolean;
  mimicBattle: MimicBattleState | null;
}

/** Presentation-only live view of the active player's camera. Never scored. */
export interface TurnPreviewFrame {
  seat: number;
  turnId: string;
  /** JPEG data URL, deliberately small enough for one Realtime message. */
  image: string;
  progress: number;
  detections: {
    label: string;
    score: number;
    box: { x: number; y: number; w: number; h: number };
    isTarget: boolean;
  }[];
}

/**
 * WebRTC negotiation rides the same private channel as the preview frames, so
 * a live video call between the phones needs no signalling server of its own.
 */
export interface TurnSignal {
  kind: "watch" | "offer" | "answer" | "ice" | "transport";
  /** Random per-tab id; a seat can be re-taken after a reload. */
  from: string;
  to?: string;
  sdp?: string;
  candidate?: {
    candidate: string;
    sdpMid: string | null;
    sdpMLineIndex: number | null;
    usernameFragment: string | null;
  };
  transport?: "webrtc" | "jpeg";
}

export type Difficulty = "easy" | "medium" | "hard";
export type ChallengeKind = "object" | "smile" | "color";

export interface Challenge {
  id: string;
  kind: ChallengeKind;
  label: string;
  prompt: string;
  difficulty: Difficulty;
  targetClass?: string;
  color?: "red" | "blue" | "green" | "yellow";
  hex?: string;
  validatorConfig: Record<string, unknown>;
}

export interface RoundConfig {
  index: number;
  difficulty: Difficulty;
  seconds: 30;
}

export interface AchievementUnlock {
  id: string;
  name?: string;
}

export interface TurnOutcome {
  turnId: string;
  playerId: string;
  playerName: string;
  playerColor: PlayerColorKey;
  challengeId: string;
  challengePrompt: string;
  success: boolean;
  timeMs: number;
  points: number;
  xp: number;
  totalAfter: number;
  totalXp: number;
  level: number;
  streak: number;
  unlockedAchievementIds: string[];
  systemError?: boolean;
  retryAllowed?: boolean;
}

export interface RankRow {
  player: Player;
  rank: number;
  delta: number;
  gained: number;
}

export type CameraFacing = "environment" | "user";
export type CameraMode = "live" | "demo";

export interface GameSession {
  gameId: string;
  environment: GameEnvironment;
  players: Player[];
}

export interface PreparedTurn {
  turnId: string;
  challenge: Challenge;
}

export interface ActiveTurn {
  turnId: string;
  startedAt: string;
  deadlineAt: string;
  serverNow: string;
}

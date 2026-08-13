export type Phase =
  | "landing"
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

export type Difficulty = "easy" | "medium" | "hard";
export type ChallengeKind = "object" | "fingers" | "smile" | "color";

export interface Challenge {
  id: string;
  kind: ChallengeKind;
  label: string;
  prompt: string;
  difficulty: Difficulty;
  targetClass?: string;
  fingerCount?: 1 | 2 | 3 | 4 | 5;
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

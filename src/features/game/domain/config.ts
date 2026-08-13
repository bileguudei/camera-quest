import type { Difficulty, PlayerColorKey, RoundConfig } from "./types";

export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 6;

export const SEAT_COLORS: PlayerColorKey[] = [
  "violet",
  "blue",
  "lime",
  "orange",
  "pink",
  "cyan",
];

export const PLAYER_COLOR_HEX: Record<PlayerColorKey, string> = {
  violet: "var(--p-violet)",
  blue: "var(--p-blue)",
  lime: "var(--p-lime)",
  orange: "var(--p-orange)",
  pink: "var(--p-pink)",
  cyan: "var(--p-cyan)",
};

export const PLAYER_COLOR_DEEP: Record<PlayerColorKey, string> = {
  violet: "#6f37d6",
  blue: "#2059c4",
  lime: "#6ba518",
  orange: "#c2681a",
  pink: "#c2306e",
  cyan: "#128e99",
};

export const SEAT_AVATARS = ["🦊", "🐼", "🐯", "🐸", "🦉", "🐙"];

export const ROUNDS: RoundConfig[] = [
  { index: 1, difficulty: "easy", seconds: 30 },
  { index: 2, difficulty: "easy", seconds: 30 },
  { index: 3, difficulty: "medium", seconds: 30 },
  { index: 4, difficulty: "medium", seconds: 30 },
  { index: 5, difficulty: "hard", seconds: 30 },
];

export const TOTAL_ROUNDS = ROUNDS.length;

export const BASE_POINTS: Record<Difficulty, number> = {
  easy: 8,
  medium: 12,
  hard: 16,
};

export const SPEED_POINTS: Record<Difficulty, number> = {
  easy: 20,
  medium: 24,
  hard: 30,
};

export const DIFFICULTY_ACCENT: Record<Difficulty, string> = {
  easy: "var(--success)",
  medium: "var(--warn)",
  hard: "var(--danger)",
};

const fastDevelopmentFlow =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_DEV_CONTROLS_ENABLED === "true";

/** Production timing remains fixed; the explicit dev flag makes 30-turn E2E practical. */
export const TIMING = {
  roundIntroHold: fastDevelopmentFlow ? 30 : 1500,
  turnIntroReveal: fastDevelopmentFlow ? 30 : 900,
  questRevealHold: fastDevelopmentFlow ? 50 : 1800,
  countdownStep: fastDevelopmentFlow ? 25 : 750,
  successHold: fastDevelopmentFlow ? 30 : 1300,
  failHold: fastDevelopmentFlow ? 30 : 1300,
  screenTransition: fastDevelopmentFlow ? 0.01 : 0.26,
  warnAt: 10,
  dangerAt: 5,
  criticalAt: 3,
} as const;

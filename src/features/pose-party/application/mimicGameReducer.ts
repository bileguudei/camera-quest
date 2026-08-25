import {
  MIMIC_ROUNDS,
  PASS_SCORE,
  type MimicChallengeId,
  type MimicScoreComponent,
} from "../domain/mimicRules";

export const HOLD_DURATION_MS = 450;
export const ROUND_DURATION_MS = 7_000;

export type MimicStage =
  | "intro"
  | "loading"
  | "framing"
  | "countdown"
  | "playing"
  | "roundResult"
  | "finished"
  | "error";

export interface MimicOutcome {
  challengeId: MimicChallengeId;
  success: boolean;
  points: number;
}

export interface MimicGameState {
  stage: MimicStage;
  roundIndex: number;
  roundStartedAt: number | null;
  remainingMs: number;
  holdStartedAt: number | null;
  holdProgress: number;
  liveScore: number;
  liveFeedback: string;
  liveComponents: readonly MimicScoreComponent[];
  totalScore: number;
  combo: number;
  maxCombo: number;
  outcomes: MimicOutcome[];
  lastResult: MimicOutcome | null;
  errorMessage: string | null;
}

export const initialMimicGameState: MimicGameState = {
  stage: "intro",
  roundIndex: 0,
  roundStartedAt: null,
  remainingMs: ROUND_DURATION_MS,
  holdStartedAt: null,
  holdProgress: 0,
  liveScore: 0,
  liveFeedback: "Хөдөлгөөнөө эхлүүлээрэй",
  liveComponents: [],
  totalScore: 0,
  combo: 0,
  maxCombo: 0,
  outcomes: [],
  lastResult: null,
  errorMessage: null,
};

export type MimicGameEvent =
  | { type: "START" }
  | { type: "READY" }
  | { type: "FRAMED" }
  | { type: "COUNTDOWN_COMPLETE"; at: number }
  | {
      type: "SAMPLE";
      score: number;
      at: number;
      feedback?: string;
      components?: readonly MimicScoreComponent[];
    }
  | { type: "TICK"; at: number }
  | { type: "NEXT"; at: number }
  | { type: "ERROR"; message: string }
  | { type: "RESTART" }
  | { type: "PLAY_AGAIN" };

const finishRound = (
  state: MimicGameState,
  success: boolean,
  at: number,
): MimicGameState => {
  const challenge = MIMIC_ROUNDS[state.roundIndex];
  if (!challenge) return state;
  const nextCombo = success ? state.combo + 1 : 0;
  const timeLeft = Math.max(
    0,
    ROUND_DURATION_MS - (at - (state.roundStartedAt ?? at)),
  );
  const points = success ? Math.round(600 + timeLeft * 0.08 + nextCombo * 75) : 0;
  const outcome = { challengeId: challenge.id, success, points };
  return {
    ...state,
    stage: "roundResult",
    remainingMs: timeLeft,
    holdStartedAt: null,
    holdProgress: success ? 1 : 0,
    totalScore: state.totalScore + points,
    combo: nextCombo,
    maxCombo: Math.max(state.maxCombo, nextCombo),
    outcomes: [...state.outcomes, outcome],
    lastResult: outcome,
  };
};

export function mimicGameReducer(
  state: MimicGameState,
  event: MimicGameEvent,
): MimicGameState {
  switch (event.type) {
    case "START":
      return state.stage === "intro" ? { ...state, stage: "loading" } : state;
    case "READY":
      return state.stage === "loading" ? { ...state, stage: "framing" } : state;
    case "FRAMED":
      return state.stage === "framing" ? { ...state, stage: "countdown" } : state;
    case "COUNTDOWN_COMPLETE":
      return state.stage === "countdown"
        ? {
            ...state,
            stage: "playing",
            roundStartedAt: event.at,
            remainingMs: ROUND_DURATION_MS,
            holdStartedAt: null,
            holdProgress: 0,
            liveScore: 0,
            liveFeedback: "Хөдөлгөөнөө эхлүүлээрэй",
            liveComponents: [],
          }
        : state;
    case "SAMPLE": {
      if (state.stage !== "playing") return state;
      if (event.score < PASS_SCORE) {
        return {
          ...state,
          liveScore: event.score,
          liveFeedback: event.feedback ?? state.liveFeedback,
          liveComponents: event.components ?? state.liveComponents,
          holdStartedAt: null,
          holdProgress: 0,
        };
      }
      const holdStartedAt = state.holdStartedAt ?? event.at;
      const holdProgress = Math.min(1, (event.at - holdStartedAt) / HOLD_DURATION_MS);
      if (holdProgress >= 1) return finishRound(state, true, event.at);
      return {
        ...state,
        liveScore: event.score,
        liveFeedback: event.feedback ?? state.liveFeedback,
        liveComponents: event.components ?? state.liveComponents,
        holdStartedAt,
        holdProgress,
      };
    }
    case "TICK": {
      if (state.stage !== "playing" || state.roundStartedAt === null) return state;
      const remainingMs = Math.max(0, ROUND_DURATION_MS - (event.at - state.roundStartedAt));
      if (remainingMs === 0) return finishRound(state, false, event.at);
      return { ...state, remainingMs };
    }
    case "NEXT": {
      if (state.stage !== "roundResult") return state;
      const nextRound = state.roundIndex + 1;
      if (nextRound >= MIMIC_ROUNDS.length) {
        return { ...state, stage: "finished", roundStartedAt: null };
      }
      return {
        ...state,
        stage: "playing",
        roundIndex: nextRound,
        roundStartedAt: event.at,
        remainingMs: ROUND_DURATION_MS,
        holdStartedAt: null,
        holdProgress: 0,
        liveScore: 0,
        liveFeedback: "Хөдөлгөөнөө эхлүүлээрэй",
        liveComponents: [],
        lastResult: null,
      };
    }
    case "ERROR":
      return { ...state, stage: "error", errorMessage: event.message };
    case "RESTART":
      return { ...initialMimicGameState, outcomes: [] };
    case "PLAY_AGAIN":
      return {
        ...initialMimicGameState,
        stage: "loading",
        outcomes: [],
      };
  }
}

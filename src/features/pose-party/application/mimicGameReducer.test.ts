import { describe, expect, it } from "vitest";
import { MIMIC_ROUNDS } from "../domain/mimicRules";
import {
  HOLD_DURATION_MS,
  ROUND_DURATION_MS,
  initialMimicGameState,
  mimicGameReducer,
} from "./mimicGameReducer";

const enterFirstRound = () => {
  let state = mimicGameReducer(initialMimicGameState, { type: "START" });
  state = mimicGameReducer(state, { type: "READY" });
  state = mimicGameReducer(state, { type: "FRAMED" });
  return mimicGameReducer(state, { type: "COUNTDOWN_COMPLETE", at: 1_000 });
};

describe("Mimic Rush reducer", () => {
  it("waits for camera/model readiness and a close-up face before counting down", () => {
    let state = mimicGameReducer(initialMimicGameState, { type: "START" });
    expect(state.stage).toBe("loading");
    state = mimicGameReducer(state, { type: "READY" });
    expect(state.stage).toBe("framing");
    state = mimicGameReducer(state, { type: "FRAMED" });
    expect(state.stage).toBe("countdown");
  });

  it("rewards a held match and grows the combo", () => {
    let state = enterFirstRound();
    state = mimicGameReducer(state, { type: "SAMPLE", score: 0.91, at: 1_100 });
    state = mimicGameReducer(state, {
      type: "SAMPLE",
      score: 0.93,
      at: 1_100 + HOLD_DURATION_MS,
    });

    expect(state.stage).toBe("roundResult");
    expect(state.lastResult?.success).toBe(true);
    expect(state.combo).toBe(1);
    expect(state.totalScore).toBeGreaterThan(500);
  });

  it("resets partial hold progress when the expression is lost", () => {
    let state = enterFirstRound();
    state = mimicGameReducer(state, { type: "SAMPLE", score: 0.9, at: 1_100 });
    state = mimicGameReducer(state, { type: "SAMPLE", score: 0.2, at: 1_300 });

    expect(state.holdStartedAt).toBeNull();
    expect(state.holdProgress).toBe(0);
  });

  it("times out a round without freezing the game", () => {
    let state = enterFirstRound();
    state = mimicGameReducer(state, {
      type: "TICK",
      at: 1_000 + ROUND_DURATION_MS,
    });

    expect(state.stage).toBe("roundResult");
    expect(state.lastResult?.success).toBe(false);
    expect(state.combo).toBe(0);
  });

  it("finishes after the full challenge catalog and restarts cleanly", () => {
    let state = enterFirstRound();
    for (let index = 0; index < MIMIC_ROUNDS.length; index += 1) {
      state = mimicGameReducer(state, { type: "SAMPLE", score: 1, at: index * 2_000 + 1_100 });
      state = mimicGameReducer(state, {
        type: "SAMPLE",
        score: 1,
        at: index * 2_000 + 1_100 + HOLD_DURATION_MS,
      });
      state = mimicGameReducer(state, { type: "NEXT", at: index * 2_000 + 2_000 });
    }

    expect(state.stage).toBe("finished");
    expect(state.outcomes).toHaveLength(MIMIC_ROUNDS.length);
    state = mimicGameReducer(state, { type: "RESTART" });
    expect(state).toEqual(initialMimicGameState);
  });
});

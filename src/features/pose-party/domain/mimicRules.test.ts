import { describe, expect, it } from "vitest";
import {
  FUSION_ROUNDS,
  MIMIC_ROUNDS,
  MOTION_FUSION_ROUNDS,
  PASS_SCORE,
  buildMimicBaseline,
  evaluateMimic,
  framingHint,
  isSelfieFramed,
  scoreMimic,
  type MimicObservation,
  type NormalizedPoint,
} from "./mimicRules";

const observation = (blendshapes: Record<string, number> = {}): MimicObservation => ({
  faceLandmarks: [{ x: 0.35, y: 0.25 }, { x: 0.65, y: 0.7 }],
  blendshapes,
  headPose: null,
});

const posedObservation = (
  headPose: NonNullable<MimicObservation["headPose"]>,
): MimicObservation => ({ ...observation(), headPose });

describe("Mimic Rush rules", () => {
  it("ships one twelve-round Fusion deck and preserves the original six rounds", () => {
    expect(FUSION_ROUNDS.map((round) => round.id)).toEqual([
      "fusion_smile_wink_left",
      "fusion_smile_wink_right",
      "fusion_surprise_brow",
      "fusion_kiss_eyes",
      "fusion_frown_squint",
      "fusion_smile_brow",
    ]);
    expect(MOTION_FUSION_ROUNDS.map((round) => round.id)).toEqual([
      "fusion_smile_tilt_left",
      "fusion_surprise_turn_right",
      "fusion_kiss_tilt_right",
      "fusion_frown_turn_left",
      "fusion_brow_nod_up",
      "fusion_squint_nod_down",
    ]);
    expect(MIMIC_ROUNDS).toHaveLength(12);
    expect(MIMIC_ROUNDS.map((round) => round.id)).not.toContain("smile");
    expect(MIMIC_ROUNDS.map((round) => round.id)).not.toContain("head_tilt_left");
  });

  it.each([
    ["smile", { mouthSmileLeft: 0.58, mouthSmileRight: 0.54 }],
    ["surprise", { jawOpen: 0.5 }],
    ["kiss", { mouthPucker: 0.82, mouthFunnel: 0.7 }],
    ["frown", { mouthFrownLeft: 0.44, mouthFrownRight: 0.4 }],
    ["brow_raise", { browInnerUp: 0.5 }],
    ["squint", { eyeSquintLeft: 0.64, eyeSquintRight: 0.61 }],
    ["mouth_left", { mouthLeft: 0.7 }],
    ["mouth_right", { mouthRight: 0.7 }],
    ["lip_press", { mouthPressLeft: 0.65, mouthPressRight: 0.62 }],
  ] as const)("accepts a clear %s expression", (id, blendshapes) => {
    expect(scoreMimic(id, observation(blendshapes))).toBeGreaterThanOrEqual(PASS_SCORE);
  });

  it("distinguishes left wink, right wink, and closing both eyes", () => {
    expect(
      scoreMimic("wink_left", observation({ eyeBlinkLeft: 0.9, eyeBlinkRight: 0.08 })),
    ).toBeGreaterThanOrEqual(0.8);
    expect(
      scoreMimic("wink_right", observation({ eyeBlinkLeft: 0.08, eyeBlinkRight: 0.9 })),
    ).toBeGreaterThanOrEqual(0.8);
    expect(
      scoreMimic("wink_left", observation({ eyeBlinkLeft: 0.9, eyeBlinkRight: 0.9 })),
    ).toBeLessThan(PASS_SCORE);
    expect(
      scoreMimic("eyes_closed", observation({ eyeBlinkLeft: 0.9, eyeBlinkRight: 0.9 })),
    ).toBeGreaterThanOrEqual(0.8);
  });

  it("does not auto-pass kiss from a naturally high neutral pucker score", () => {
    const baseline = buildMimicBaseline([
      observation({ mouthPucker: 0.71, mouthFunnel: 0.16 }),
      observation({ mouthPucker: 0.74, mouthFunnel: 0.17 }),
      observation({ mouthPucker: 0.72, mouthFunnel: 0.15 }),
    ]);

    expect(
      scoreMimic("kiss", observation({ mouthPucker: 0.73, mouthFunnel: 0.17 }), baseline),
    ).toBeLessThan(PASS_SCORE);
    expect(
      scoreMimic("kiss", observation({ mouthPucker: 0.92, mouthFunnel: 0.4 }), baseline),
    ).toBeGreaterThanOrEqual(PASS_SCORE);
  });

  it("uses the neutral face as a personal baseline for subtler expressions", () => {
    const baseline = buildMimicBaseline([
      observation({ mouthSmileLeft: 0.08, mouthSmileRight: 0.07, browInnerUp: 0.06 }),
      observation({ mouthSmileLeft: 0.1, mouthSmileRight: 0.08, browInnerUp: 0.05 }),
      observation({ mouthSmileLeft: 0.09, mouthSmileRight: 0.09, browInnerUp: 0.07 }),
    ]);

    const subtleSmile = observation({ mouthSmileLeft: 0.34, mouthSmileRight: 0.33 });
    expect(scoreMimic("smile", subtleSmile)).toBeLessThan(PASS_SCORE);
    expect(scoreMimic("smile", subtleSmile, baseline)).toBeGreaterThanOrEqual(PASS_SCORE);
  });

  it("requires both expressions in a fusion challenge and identifies the weak part", () => {
    const smileOnly = observation({
      mouthSmileLeft: 0.7,
      mouthSmileRight: 0.68,
      eyeBlinkLeft: 0.08,
      eyeBlinkRight: 0.08,
    });
    const fused = observation({
      mouthSmileLeft: 0.7,
      mouthSmileRight: 0.68,
      eyeBlinkLeft: 0.9,
      eyeBlinkRight: 0.08,
    });

    const incomplete = evaluateMimic("fusion_smile_wink_left", smileOnly);
    expect(incomplete.score).toBeLessThan(PASS_SCORE);
    expect(incomplete.feedback).toMatch(/зүүн нүдээ/i);
    expect(incomplete.components).toHaveLength(2);
    expect(evaluateMimic("fusion_smile_wink_left", fused).score).toBeGreaterThanOrEqual(
      PASS_SCORE,
    );
  });

  it("requires both the expression and head motion in a motion-fusion challenge", () => {
    const baseline = buildMimicBaseline([
      posedObservation({ pitch: 0, yaw: 0, roll: 0 }),
      posedObservation({ pitch: 0.01, yaw: -0.01, roll: 0.01 }),
      posedObservation({ pitch: -0.01, yaw: 0.01, roll: -0.01 }),
    ]);
    const smileOnly = {
      ...observation({ mouthSmileLeft: 0.72, mouthSmileRight: 0.7 }),
      headPose: { pitch: 0, yaw: 0, roll: 0 },
    };
    const fused = {
      ...smileOnly,
      headPose: { pitch: 0, yaw: 0, roll: 0.32 },
    };

    const incomplete = evaluateMimic("fusion_smile_tilt_left", smileOnly, baseline);
    expect(incomplete.score).toBeLessThan(PASS_SCORE);
    expect(incomplete.feedback).toMatch(/зүүн мөр/i);
    expect(incomplete.components).toHaveLength(2);
    expect(evaluateMimic("fusion_smile_tilt_left", fused, baseline).score).toBeGreaterThanOrEqual(
      PASS_SCORE,
    );
  });

  it("calibrates head motion and rejects neutral or the wrong direction", () => {
    const neutralPose = { pitch: 0.02, yaw: -0.01, roll: 0.03 };
    const baseline = buildMimicBaseline([
      posedObservation(neutralPose),
      posedObservation({ pitch: 0.01, yaw: 0, roll: 0.02 }),
      posedObservation({ pitch: 0.03, yaw: -0.02, roll: 0.04 }),
    ]);

    expect(scoreMimic("head_tilt_left", posedObservation(neutralPose), baseline)).toBeLessThan(
      PASS_SCORE,
    );
    expect(
      scoreMimic(
        "head_tilt_left",
        posedObservation({ pitch: 0.02, yaw: -0.01, roll: 0.32 }),
        baseline,
      ),
    ).toBeGreaterThanOrEqual(PASS_SCORE);
    expect(
      scoreMimic(
        "head_tilt_left",
        posedObservation({ pitch: 0.02, yaw: -0.01, roll: -0.32 }),
        baseline,
      ),
    ).toBeLessThan(PASS_SCORE);
  });

  it.each([
    ["head_turn_left", { pitch: 0, yaw: 0.32, roll: 0 }, { pitch: 0, yaw: -0.32, roll: 0 }],
    ["head_turn_right", { pitch: 0, yaw: -0.32, roll: 0 }, { pitch: 0, yaw: 0.32, roll: 0 }],
    ["head_nod_up", { pitch: 0.28, yaw: 0, roll: 0 }, { pitch: -0.28, yaw: 0, roll: 0 }],
    ["head_nod_down", { pitch: -0.28, yaw: 0, roll: 0 }, { pitch: 0.28, yaw: 0, roll: 0 }],
    ["head_tilt_left", { pitch: 0, yaw: 0, roll: 0.32 }, { pitch: 0, yaw: 0, roll: -0.32 }],
    ["head_tilt_right", { pitch: 0, yaw: 0, roll: -0.32 }, { pitch: 0, yaw: 0, roll: 0.32 }],
  ] as const)("maps %s to exactly one player-space direction", (id, intended, opposite) => {
    const baseline = buildMimicBaseline([
      posedObservation({ pitch: 0, yaw: 0, roll: 0 }),
      posedObservation({ pitch: 0.01, yaw: -0.01, roll: 0.01 }),
      posedObservation({ pitch: -0.01, yaw: 0.01, roll: -0.01 }),
    ]);

    expect(scoreMimic(id, posedObservation(intended), baseline)).toBeGreaterThanOrEqual(
      PASS_SCORE,
    );
    expect(scoreMimic(id, posedObservation(opposite), baseline)).toBeLessThan(PASS_SCORE);
  });

  it("returns actionable live feedback for an incomplete expression", () => {
    expect(evaluateMimic("smile", observation({ mouthSmileLeft: 0.12 })).feedback).toMatch(
      /Илүү чанга инээгээрэй/,
    );
    expect(
      evaluateMimic(
        "wink_left",
        observation({ eyeBlinkLeft: 0.82, eyeBlinkRight: 0.84 }),
      ).feedback,
    ).toMatch(/баруун нүдээ нээлттэй/i);
  });

  it("requires a comfortably sized, centered selfie instead of a full body", () => {
    const framed: NormalizedPoint[] = [
      { x: 0.32, y: 0.18 },
      { x: 0.68, y: 0.72 },
    ];
    const farAway: NormalizedPoint[] = [
      { x: 0.47, y: 0.4 },
      { x: 0.53, y: 0.52 },
    ];

    expect(isSelfieFramed(framed)).toBe(true);
    expect(isSelfieFramed(farAway)).toBe(false);
    expect(framingHint(farAway)).toMatch(/ойртуулаарай/);
  });
});

import { describe, expect, it } from "vitest";
import { headPoseFromMatrix } from "./headPose";

const rotationZ = (radians: number) => {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return [
    cosine,
    sine,
    0,
    0,
    -sine,
    cosine,
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    1,
  ];
};

describe("head pose extraction", () => {
  it("extracts stable roll from MediaPipe's column-major transform", () => {
    expect(headPoseFromMatrix(rotationZ(0.3))?.roll).toBeCloseTo(0.3, 5);
    expect(headPoseFromMatrix(rotationZ(-0.25))?.roll).toBeCloseTo(-0.25, 5);
  });

  it("rejects missing or non-finite matrices", () => {
    expect(headPoseFromMatrix([])).toBeNull();
    expect(headPoseFromMatrix([...rotationZ(0), Number.NaN])).toBeNull();
  });
});

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

const rotationX = (radians: number) => {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return [
    1,
    0,
    0,
    0,
    0,
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
  ];
};

const rotationY = (radians: number) => {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return [
    cosine,
    0,
    -sine,
    0,
    0,
    1,
    0,
    0,
    sine,
    0,
    cosine,
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

  it("normalizes raw yaw and pitch to the player's mirrored selfie directions", () => {
    expect(headPoseFromMatrix(rotationY(0.3))?.yaw).toBeCloseTo(-0.3, 5);
    expect(headPoseFromMatrix(rotationY(-0.25))?.yaw).toBeCloseTo(0.25, 5);
    expect(headPoseFromMatrix(rotationX(0.28))?.pitch).toBeCloseTo(-0.28, 5);
    expect(headPoseFromMatrix(rotationX(-0.22))?.pitch).toBeCloseTo(0.22, 5);
  });

  it("rejects missing or non-finite matrices", () => {
    expect(headPoseFromMatrix([])).toBeNull();
    expect(headPoseFromMatrix([...rotationZ(0), Number.NaN])).toBeNull();
  });
});

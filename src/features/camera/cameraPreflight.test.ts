import { describe, expect, it } from "vitest";
import { averageLuminance } from "./cameraPreflight";

describe("camera preflight lighting", () => {
  it("classifies black and bright frames on a stable luminance scale", () => {
    expect(averageLuminance(new Uint8ClampedArray([0, 0, 0, 255]))).toBe(0);
    expect(averageLuminance(new Uint8ClampedArray([255, 255, 255, 255]))).toBeCloseTo(255);
  });

  it("weights green more strongly than blue like perceived brightness", () => {
    const green = averageLuminance(new Uint8ClampedArray([0, 100, 0, 255]));
    const blue = averageLuminance(new Uint8ClampedArray([0, 0, 100, 255]));
    expect(green).toBeGreaterThan(blue);
  });
});

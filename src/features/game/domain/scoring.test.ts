import { describe, expect, it } from "vitest";
import { levelForXp, scoreTurn } from "./scoring";

describe("production scoring", () => {
  it("applies the difficulty base and proportional 30-second speed pool", () => {
    expect(scoreTurn("easy", 0)).toBe(28);
    expect(scoreTurn("easy", 30_000)).toBe(8);
    expect(scoreTurn("medium", 15_000)).toBe(24);
    expect(scoreTurn("hard", 15_000)).toBe(31);
  });

  it("uses the seeded quadratic level thresholds", () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(99)).toBe(1);
    expect(levelForXp(100)).toBe(2);
    expect(levelForXp(300)).toBe(3);
    expect(levelForXp(Number.MAX_SAFE_INTEGER)).toBe(50);
  });
});

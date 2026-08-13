import { describe, expect, it } from "vitest";
import { remainingFromDeadline } from "./turnClock";

describe("server clock", () => {
  it("applies the measured server offset and never goes negative", () => {
    expect(remainingFromDeadline(40_000, 2_000, 10_000)).toBe(28_000);
    expect(remainingFromDeadline(10_000, 2_000, 10_000)).toBe(0);
  });
});

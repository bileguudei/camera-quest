import { describe, expect, it } from "vitest";
import { visionVerdictSchema } from "./visionTypes";

describe("vision DTO", () => {
  it("rejects a pass without a valid bounded detection", () => {
    const result = visionVerdictSchema.safeParse({
      decision: "pass",
      progress: 2,
      detections: [],
    });
    expect(result.success).toBe(false);
  });
});

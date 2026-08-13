import { describe, expect, it } from "vitest";
import { visionErrorCode } from "./visionClient";

describe("visionErrorCode", () => {
  it("keeps deadline and frame failures distinct from infrastructure errors", () => {
    expect(visionErrorCode(409, { detail: { code: "TURN_EXPIRED" } })).toBe("TURN_EXPIRED");
    expect(visionErrorCode(422, { code: "INVALID_FRAME" })).toBe("INVALID_FRAME");
    expect(visionErrorCode(503, {})).toBe("VISION_UNAVAILABLE");
  });
});

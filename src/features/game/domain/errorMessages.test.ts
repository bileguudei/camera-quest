import { describe, expect, it } from "vitest";
import { handoffErrorMessage } from "./errorMessages";

describe("handoffErrorMessage", () => {
  it("does not mislabel a backend failure as a vision outage", () => {
    expect(handoffErrorMessage("GAME_UNAVAILABLE")).toContain("backend");
    expect(handoffErrorMessage("GAME_UNAVAILABLE")).not.toContain("Таних систем");
  });

  it("keeps the penalty-free retry explanation for a signed vision failure", () => {
    expect(handoffErrorMessage("VISION_UNAVAILABLE")).toContain("оноонд нөлөөлөхгүй");
  });
});

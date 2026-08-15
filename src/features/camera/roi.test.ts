import { describe, expect, it } from "vitest";
import { fullFrameRect } from "./roi";

describe("fullFrameRect", () => {
  it("uses the entire visible camera frame", () => {
    expect(fullFrameRect()).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });
});

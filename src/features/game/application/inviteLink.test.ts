import { describe, expect, it } from "vitest";
import { buildInviteUrl, normalizeJoinCode } from "./inviteLink";

describe("normalizeJoinCode", () => {
  it("accepts a code however a chat app mangled it", () => {
    expect(normalizeJoinCode("d9zh22")).toBe("D9ZH22");
    expect(normalizeJoinCode(" D9-ZH 22 ")).toBe("D9ZH22");
  });

  it("rejects anything that is not six characters", () => {
    expect(normalizeJoinCode("D9ZH2")).toBeNull();
    expect(normalizeJoinCode("D9ZH222")).toBeNull();
    expect(normalizeJoinCode(null)).toBeNull();
    expect(normalizeJoinCode("")).toBeNull();
  });
});

describe("buildInviteUrl", () => {
  it("puts the code on the root of the deployed origin", () => {
    expect(buildInviteUrl("https://camera-quest.vercel.app", "D9ZH22")).toBe(
      "https://camera-quest.vercel.app/?join=D9ZH22",
    );
  });
});

import { describe, expect, it } from "vitest";
import { turnPreviewFrameSchema, turnSignalSchema } from "../infrastructure/gameApiSchemas";
import { TURN_VIDEO_ENCODING } from "./useTurnVideo";

const frame = (overrides: Record<string, unknown> = {}) => ({
  seat: 2,
  turnId: "00000000-0000-4000-8000-0000000000cc",
  image: "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
  progress: 0.42,
  detections: [
    { label: "cup", score: 0.91, box: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 }, isTarget: true },
  ],
  ...overrides,
});

describe("turn preview payload", () => {
  it("accepts a live frame from another player's phone", () => {
    const parsed = turnPreviewFrameSchema.safeParse(frame());

    expect(parsed.success).toBe(true);
    expect(parsed.data?.detections[0].isTarget).toBe(true);
  });

  it("rejects a payload that is not a jpeg data URL", () => {
    // The payload crosses from another browser, so an <img src> must never be
    // pointed at an arbitrary URL a peer chose.
    expect(turnPreviewFrameSchema.safeParse(frame({ image: "https://evil.test/x.jpg" })).success)
      .toBe(false);
    expect(turnPreviewFrameSchema.safeParse(frame({ image: "javascript:alert(1)" })).success)
      .toBe(false);
  });

  it("bounds the frame size and detection count", () => {
    expect(
      turnPreviewFrameSchema.safeParse(
        frame({ image: `data:image/jpeg;base64,${"A".repeat(80_001)}` }),
      ).success,
    ).toBe(false);
    expect(
      turnPreviewFrameSchema.safeParse({
        ...frame(),
        detections: Array.from({ length: 13 }, () => ({
          label: "cup",
          score: 0.5,
          box: { x: 0, y: 0, w: 1, h: 1 },
          isTarget: false,
        })),
      }).success,
    ).toBe(false);
  });
});

describe("webrtc signalling payload", () => {
  const signal = (overrides: Record<string, unknown> = {}) => ({
    kind: "offer",
    from: "peer-aaaaaaaa",
    to: "peer-bbbbbbbb",
    sdp: "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\n",
    ...overrides,
  });

  it("accepts an offer, an answer and a candidate", () => {
    expect(turnSignalSchema.safeParse(signal()).success).toBe(true);
    expect(turnSignalSchema.safeParse(signal({ kind: "answer" })).success).toBe(true);
    expect(
      turnSignalSchema.safeParse(
        signal({
          kind: "ice",
          sdp: undefined,
          candidate: {
            candidate: "candidate:1 1 udp 2113937151 192.168.1.5 54321 typ host",
            sdpMid: "0",
            sdpMLineIndex: 0,
            usernameFragment: "abcd",
          },
        }),
      ).success,
    ).toBe(true);
  });

  it("rejects an unknown kind and an oversized description", () => {
    // The peer that sent this is another player's browser, not our server.
    expect(turnSignalSchema.safeParse(signal({ kind: "renegotiate-everything" })).success)
      .toBe(false);
    expect(turnSignalSchema.safeParse(signal({ sdp: "v".repeat(20_001) })).success).toBe(false);
  });

  it("keeps the transport report to the two paths the game has", () => {
    expect(turnSignalSchema.safeParse(signal({ kind: "transport", transport: "webrtc" })).success)
      .toBe(true);
    expect(turnSignalSchema.safeParse(signal({ kind: "transport", transport: "carrier-pigeon" }))
      .success).toBe(false);
  });
});

describe("multiplayer live video quality", () => {
  it("sends a detail-preserving 360p-class stream at a bounded bitrate", () => {
    expect(TURN_VIDEO_ENCODING.scaleResolutionDownBy).toBeLessThanOrEqual(2);
    expect(TURN_VIDEO_ENCODING.maxBitrate).toBeGreaterThanOrEqual(450_000);
    expect(TURN_VIDEO_ENCODING.maxFramerate).toBeLessThanOrEqual(24);
  });
});

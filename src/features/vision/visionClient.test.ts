import { describe, expect, it, vi } from "vitest";
import {
  createTurnVisionStream,
  visionErrorCode,
  visionStreamUrl,
} from "./visionClient";

vi.mock("@/shared/env/publicEnv", () => ({
  publicEnv: {
    visionUrl: "https://vision.example.com",
    visionEnabled: true,
  },
}));

vi.mock("@/features/camera/frameCapture", () => ({
  captureFrameBatch: vi.fn(),
  captureFrameSequence: vi.fn(
    async (
      video: HTMLVideoElement,
      onFrame: (frame: Blob, index: number) => void | Promise<void>,
    ) => {
      void video;
      for (let index = 0; index < 5; index += 1) {
        await onFrame(new Blob([`frame-${index}`], { type: "image/jpeg" }), index);
      }
    },
  ),
}));

class FakeWebSocket extends EventTarget {
  readyState: number = WebSocket.CONNECTING;
  sent: Array<string | Blob> = [];

  open() {
    this.readyState = WebSocket.OPEN;
    this.dispatchEvent(new Event("open"));
  }

  send(data: string | Blob) {
    this.sent.push(data);
  }

  message(data: unknown) {
    this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(data) }));
  }

  close() {
    this.readyState = WebSocket.CLOSED;
    this.dispatchEvent(new Event("close"));
  }
}

const continueVerdict = {
  decision: "continue",
  progress: 0.5,
  detections: [],
};

describe("visionErrorCode", () => {
  it("keeps deadline and frame failures distinct from infrastructure errors", () => {
    expect(visionErrorCode(409, { detail: { code: "TURN_EXPIRED" } })).toBe("TURN_EXPIRED");
    expect(visionErrorCode(422, { code: "INVALID_FRAME" })).toBe("INVALID_FRAME");
    expect(visionErrorCode(503, {})).toBe("VISION_UNAVAILABLE");
  });
});

describe("turn vision stream", () => {
  it("uses WSS without putting credentials in the URL", () => {
    expect(visionStreamUrl()).toBe("wss://vision.example.com/v1/stream");
  });

  it("authenticates once and reuses one connection across frame batches", async () => {
    const socket = new FakeWebSocket();
    const factory = vi.fn(() => socket as unknown as WebSocket);
    const stream = createTurnVisionStream(
      "access-token",
      "10000000-0000-4000-8000-000000000001",
      "signed-calibration-token",
      factory,
    );
    expect(stream).not.toBeNull();
    const controller = new AbortController();
    const video = document.createElement("video");

    const first = stream!.scan(video, 41, controller.signal);
    socket.open();
    await vi.waitFor(() => expect(socket.sent).toHaveLength(7));
    socket.message({ type: "ready" });
    socket.message({ type: "verdict", verdict: continueVerdict });
    await expect(first).resolves.toMatchObject(continueVerdict);

    const second = stream!.scan(video, 42, controller.signal);
    await vi.waitFor(() => expect(socket.sent).toHaveLength(13));
    socket.message({ type: "verdict", verdict: continueVerdict });
    await expect(second).resolves.toMatchObject(continueVerdict);

    expect(factory).toHaveBeenCalledTimes(1);
    const textMessages = socket.sent.filter((item): item is string => typeof item === "string");
    expect(JSON.parse(textMessages[0]!)).toMatchObject({
      type: "authenticate",
      accessToken: "access-token",
    });
    expect(JSON.parse(textMessages[1]!)).toEqual({ type: "batch", sequenceNo: 41 });
    expect(JSON.parse(textMessages[2]!)).toEqual({ type: "batch", sequenceNo: 42 });
    stream!.close();
  });
});

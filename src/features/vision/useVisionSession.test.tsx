import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTurnVisionStream, scanTurn } from "./visionClient";
import {
  sequenceStartFromEntropy,
  useVisionSession,
  VISION_RETRY_DELAY_MS,
} from "./useVisionSession";

vi.mock("./visionClient", () => ({
  createTurnVisionStream: vi.fn(() => null),
  scanTurn: vi.fn(),
}));

describe("useVisionSession", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("creates a positive Postgres-safe sequence base from browser entropy", () => {
    expect(sequenceStartFromEntropy(0)).toBe(1);
    expect(sequenceStartFromEntropy(2_000_000_000)).toBe(1);
    expect(sequenceStartFromEntropy(0xffff_ffff)).toBe(294_967_296);
  });

  it("retries a transient network failure without abandoning the active turn", async () => {
    vi.useFakeTimers();
    vi.mocked(scanTurn)
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockImplementation(() => new Promise(() => {}));
    const onSystemError = vi.fn();
    const videoRef = { current: document.createElement("video") };

    const { unmount } = renderHook(() =>
      useVisionSession({
        videoRef,
        active: true,
        turnId: "10000000-0000-4000-8000-000000000001",
        calibrationToken: "signed-calibration-token",
        accessToken: "access-token",
        localMode: false,
        onPass: vi.fn(),
        onSystemError,
        onExpired: vi.fn(),
        onLocalMatch: vi.fn(),
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(VISION_RETRY_DELAY_MS + 1);
    });

    expect(scanTurn).toHaveBeenCalledTimes(2);
    const firstSequence = vi.mocked(scanTurn).mock.calls[0]?.[3];
    const secondSequence = vi.mocked(scanTurn).mock.calls[1]?.[3];
    expect(firstSequence).toBeGreaterThan(0);
    expect(secondSequence).toBe(firstSequence! + 1);
    expect(onSystemError).not.toHaveBeenCalled();
    unmount();
  });

  it("prefers one persistent stream for an active remote turn", async () => {
    const stream = {
      scan: vi.fn(() => new Promise<never>(() => {})),
      close: vi.fn(),
    };
    vi.mocked(createTurnVisionStream).mockReturnValue(stream);
    const videoRef = { current: document.createElement("video") };

    const { unmount } = renderHook(() =>
      useVisionSession({
        videoRef,
        active: true,
        turnId: "10000000-0000-4000-8000-000000000001",
        calibrationToken: "signed-calibration-token",
        accessToken: "access-token",
        localMode: false,
        onPass: vi.fn(),
        onSystemError: vi.fn(),
        onExpired: vi.fn(),
        onLocalMatch: vi.fn(),
      }),
    );

    await vi.waitFor(() => expect(stream.scan).toHaveBeenCalledTimes(1));
    expect(scanTurn).not.toHaveBeenCalled();
    unmount();
    expect(stream.close).toHaveBeenCalled();
  });
});

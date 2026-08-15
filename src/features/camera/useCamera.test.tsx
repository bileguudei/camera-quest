import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCamera } from "./useCamera";

const originalMediaDevices = navigator.mediaDevices;

function cameraTrack() {
  let ended: (() => void) | undefined;
  return {
    track: {
      stop: vi.fn(),
      addEventListener: vi.fn((event: string, listener: () => void) => {
        if (event === "ended") ended = listener;
      }),
      removeEventListener: vi.fn(),
    } as unknown as MediaStreamTrack,
    end: () => ended?.(),
  };
}

function cameraStream(track: MediaStreamTrack) {
  return {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream;
}

describe("useCamera", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: originalMediaDevices,
    });
  });

  it("reopens the camera once when the active video track ends unexpectedly", async () => {
    const first = cameraTrack();
    const second = cameraTrack();
    const getUserMedia = vi
      .fn()
      .mockResolvedValueOnce(cameraStream(first.track))
      .mockResolvedValueOnce(cameraStream(second.track));
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });

    const { result } = renderHook(() => useCamera(true, "user"));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    act(() => first.end());

    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.stream).not.toBeNull();
  });
});

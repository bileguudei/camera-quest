import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FRAME_INTERVAL_MS,
  VIDEO_READY_TIMEOUT_MS,
  waitForVideoFrame,
} from "./frameCapture";

const makeVideo = () => {
  const video = document.createElement("video");
  let readyState: number = HTMLMediaElement.HAVE_NOTHING;
  let videoWidth: number = 0;

  Object.defineProperties(video, {
    readyState: { configurable: true, get: () => readyState },
    videoWidth: { configurable: true, get: () => videoWidth },
  });

  return {
    video,
    provideFrame() {
      readyState = HTMLMediaElement.HAVE_CURRENT_DATA;
      videoWidth = 512;
      video.dispatchEvent(new Event("loadeddata"));
    },
  };
};

describe("waitForVideoFrame", () => {
  afterEach(() => vi.useRealTimers());

  it("waits for pixels when a video element has just mounted", async () => {
    const fixture = makeVideo();
    const readiness = waitForVideoFrame(fixture.video);

    fixture.provideFrame();

    await expect(readiness).resolves.toBeUndefined();
  });

  it("fails with INVALID_FRAME after the readiness deadline", async () => {
    vi.useFakeTimers();
    const readiness = waitForVideoFrame(makeVideo().video);

    const assertion = expect(readiness).rejects.toMatchObject({ code: "INVALID_FRAME" });
    await vi.advanceTimersByTimeAsync(VIDEO_READY_TIMEOUT_MS);

    await assertion;
  });
});

describe("capture cadence", () => {
  it("collects the five-frame consensus window in 400ms", () => {
    expect(FRAME_INTERVAL_MS).toBe(100);
  });
});

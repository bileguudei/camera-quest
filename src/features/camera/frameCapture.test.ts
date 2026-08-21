import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FRAME_BATCH_SIZE,
  FRAME_INTERVAL_MS,
  PREVIEW_MAX_DATA_URL_LENGTH,
  PREVIEW_QUALITY,
  PREVIEW_SIZE,
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
  it("collects the five-frame consensus window fast enough to feel live", () => {
    // Time to a verdict is capture plus one GPU batch, so the window is kept
    // under a third of a second without asking for extra inference.
    expect(FRAME_INTERVAL_MS * (FRAME_BATCH_SIZE - 1)).toBeLessThanOrEqual(300);
  });

  it("keeps the multiplayer fallback readable without exceeding its wire budget", () => {
    expect(PREVIEW_SIZE).toBeGreaterThanOrEqual(288);
    expect(PREVIEW_QUALITY).toBeGreaterThanOrEqual(0.5);
    expect(PREVIEW_MAX_DATA_URL_LENGTH).toBeLessThanOrEqual(80_000);
  });
});

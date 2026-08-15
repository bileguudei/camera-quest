import { AppError } from "@/shared/errors/appError";
import { fullFrameRect, roiToVideo } from "./roi";

export const FRAME_SIZE = 512;
export const JPEG_QUALITY = 0.68;
export const FRAME_INTERVAL_MS = 100;
export const FRAME_BATCH_SIZE = 5;
export const VIDEO_READY_TIMEOUT_MS = 5_000;

const hasCurrentFrame = (video: HTMLVideoElement) =>
  video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0;

/** A newly mounted video needs a moment to expose pixels from the existing MediaStream. */
export async function waitForVideoFrame(
  video: HTMLVideoElement,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  if (hasCurrentFrame(video)) return;

  await new Promise<void>((resolve, reject) => {
    let timeout = 0;

    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener("loadeddata", handleReady);
      video.removeEventListener("canplay", handleReady);
      signal?.removeEventListener("abort", handleAbort);
    };
    const handleReady = () => {
      if (!hasCurrentFrame(video)) return;
      cleanup();
      resolve();
    };
    const handleAbort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };

    video.addEventListener("loadeddata", handleReady);
    video.addEventListener("canplay", handleReady);
    signal?.addEventListener("abort", handleAbort, { once: true });
    timeout = window.setTimeout(() => {
      cleanup();
      reject(new AppError("INVALID_FRAME", "Камерын frame хугацаандаа бэлэн болсонгүй.", true));
    }, VIDEO_READY_TIMEOUT_MS);

    // Close the race where the frame becomes ready while listeners are attached.
    handleReady();
  });
}

interface CaptureSurface {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
}

const createCaptureSurface = (): CaptureSurface => {
  const canvas = document.createElement("canvas");
  canvas.width = FRAME_SIZE;
  canvas.height = FRAME_SIZE;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new AppError("INVALID_FRAME", "Canvas үүсгэж чадсангүй.");
  return { canvas, context };
};

async function encodeCameraFrame(
  video: HTMLVideoElement,
  surface: CaptureSurface,
): Promise<Blob> {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth) {
    throw new AppError("INVALID_FRAME", "Камерын frame хараахан бэлэн биш байна.", true);
  }

  const visibleRoi = fullFrameRect();
  const sourceRoi = roiToVideo(visibleRoi, video);

  surface.context.drawImage(
    video,
    sourceRoi.x * video.videoWidth,
    sourceRoi.y * video.videoHeight,
    sourceRoi.w * video.videoWidth,
    sourceRoi.h * video.videoHeight,
    0,
    0,
    FRAME_SIZE,
    FRAME_SIZE,
  );

  const blob = await new Promise<Blob | null>((resolve) =>
    surface.canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob || blob.size === 0 || blob.size > 300_000) {
    throw new AppError("INVALID_FRAME", "Camera frame хэмжээ буруу байна.", true);
  }
  return blob;
}

/** Captures the complete camera area the player can currently see. */
export async function captureCameraFrame(video: HTMLVideoElement): Promise<Blob> {
  return encodeCameraFrame(video, createCaptureSurface());
}

const waitForSample = (signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener("abort", handleAbort);
    const handleAbort = () => {
      window.clearTimeout(timeout);
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timeout = window.setTimeout(() => {
      cleanup();
      resolve();
    }, FRAME_INTERVAL_MS);
    signal?.addEventListener("abort", handleAbort, { once: true });
  });

export async function captureFrameBatch(
  video: HTMLVideoElement,
  signal?: AbortSignal,
): Promise<Blob[]> {
  const frames: Blob[] = [];
  await captureFrameSequence(
    video,
    (frame) => {
      frames.push(frame);
    },
    signal,
  );
  return frames;
}

/** Sends each sample as soon as it is encoded so capture and upload overlap. */
export async function captureFrameSequence(
  video: HTMLVideoElement,
  onFrame: (frame: Blob, index: number) => void | Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  await waitForVideoFrame(video, signal);
  const surface = createCaptureSurface();
  for (let index = 0; index < FRAME_BATCH_SIZE; index += 1) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    await onFrame(await encodeCameraFrame(video, surface), index);
    if (index < FRAME_BATCH_SIZE - 1) {
      await waitForSample(signal);
    }
  }
}

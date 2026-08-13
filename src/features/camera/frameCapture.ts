import { AppError } from "@/shared/errors/appError";
import { roiRect, roiToVideo } from "./roi";

export const FRAME_SIZE = 512;
export const JPEG_QUALITY = 0.72;
export const FRAME_INTERVAL_MS = 200;
export const FRAME_BATCH_SIZE = 5;

export async function captureRoiFrame(video: HTMLVideoElement): Promise<Blob> {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth) {
    throw new AppError("INVALID_FRAME", "Камерын frame хараахан бэлэн биш байна.", true);
  }

  const visibleRoi = roiRect(video.clientWidth || video.videoWidth, video.clientHeight || video.videoHeight);
  const sourceRoi = roiToVideo(visibleRoi, video);
  const canvas = document.createElement("canvas");
  canvas.width = FRAME_SIZE;
  canvas.height = FRAME_SIZE;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new AppError("INVALID_FRAME", "Canvas үүсгэж чадсангүй.");

  context.drawImage(
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
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob || blob.size === 0 || blob.size > 300_000) {
    throw new AppError("INVALID_FRAME", "Camera frame хэмжээ буруу байна.", true);
  }
  return blob;
}

export async function captureFrameBatch(
  video: HTMLVideoElement,
  signal?: AbortSignal,
): Promise<Blob[]> {
  const frames: Blob[] = [];
  for (let index = 0; index < FRAME_BATCH_SIZE; index += 1) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    frames.push(await captureRoiFrame(video));
    if (index < FRAME_BATCH_SIZE - 1) {
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(resolve, FRAME_INTERVAL_MS);
        signal?.addEventListener(
          "abort",
          () => {
            window.clearTimeout(timeout);
            reject(new DOMException("Aborted", "AbortError"));
          },
          { once: true },
        );
      });
    }
  }
  return frames;
}

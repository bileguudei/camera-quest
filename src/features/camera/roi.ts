import type { DetectionBox } from "@/features/vision/visionTypes";

/** Recognition covers every pixel visible inside the camera surface. */
export function fullFrameRect(): DetectionBox {
  return { x: 0, y: 0, w: 1, h: 1 };
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));

/** Converts the full visible object-cover surface to its source-video crop. */
export function roiToVideo(roi: DetectionBox, video: HTMLVideoElement): DetectionBox {
  const videoWidth = video.videoWidth;
  const videoHeight = video.videoHeight;
  const clientWidth = video.clientWidth || videoWidth;
  const clientHeight = video.clientHeight || videoHeight;
  if (!videoWidth || !videoHeight) return roi;

  const scale = Math.max(clientWidth / videoWidth, clientHeight / videoHeight);
  const scaledX = (videoWidth * scale) / clientWidth;
  const scaledY = (videoHeight * scale) / clientHeight;
  const x = clamp((roi.x - (1 - scaledX) / 2) / scaledX);
  const y = clamp((roi.y - (1 - scaledY) / 2) / scaledY);
  return {
    x,
    y,
    w: clamp(roi.w / scaledX - Math.max(0, x + roi.w / scaledX - 1)),
    h: clamp(roi.h / scaledY - Math.max(0, y + roi.h / scaledY - 1)),
  };
}

import type { DetectionBox } from "@/features/vision/visionTypes";

export const ROI_SCALE = 0.62;
export const ROI_CSS_SIZE = `min(${ROI_SCALE * 100}vw, ${ROI_SCALE * 100}dvh)`;

export function roiRect(width: number, height: number): DetectionBox {
  const side = Math.min(width, height) * ROI_SCALE;
  return {
    x: (width - side) / 2 / width,
    y: (height - side) / 2 / height,
    w: side / width,
    h: side / height,
  };
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));

/** Converts the visible object-cover ROI to uncropped source-video space. */
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

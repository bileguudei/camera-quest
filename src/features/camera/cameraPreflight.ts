"use client";

import { useEffect, useState, type RefObject } from "react";
import type { CameraStatus } from "./useCamera";

export type LightingState = "checking" | "good" | "dark";

export function averageLuminance(pixels: Uint8ClampedArray): number {
  if (pixels.length < 4) return 0;
  let total = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    total += pixels[index]! * 0.2126 + pixels[index + 1]! * 0.7152 + pixels[index + 2]! * 0.0722;
  }
  return total / (pixels.length / 4);
}

export function sampleVideoLighting(video: HTMLVideoElement): LightingState {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return "checking";
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 18;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return "checking";
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return averageLuminance(context.getImageData(0, 0, canvas.width, canvas.height).data) >= 35
    ? "good"
    : "dark";
}

export function useCameraPreflight(
  videoRef: RefObject<HTMLVideoElement | null>,
  status: CameraStatus,
  demo: boolean,
) {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [lighting, setLighting] = useState<LightingState>(demo ? "good" : "checking");

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    if (demo || status !== "ready") return;
    const sample = () => {
      if (videoRef.current) setLighting(sampleVideoLighting(videoRef.current));
    };
    const first = window.setTimeout(sample, 300);
    const interval = window.setInterval(sample, 1_500);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, [demo, status, videoRef]);

  const effectiveLighting: LightingState = demo
    ? "good"
    : status === "ready"
      ? lighting
      : "checking";

  return {
    online,
    lighting: effectiveLighting,
    cameraReady: demo || status === "ready",
    deviceReady: (demo || status === "ready") && online && effectiveLighting === "good",
  };
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CameraFacing } from "@/features/game/domain/types";

export type CameraStatus = "idle" | "requesting" | "ready" | "denied" | "unavailable";

export interface CameraHandle {
  stream: MediaStream | null;
  status: CameraStatus;
  isReady: boolean;
  retry: () => void;
}

export function useCamera(active: boolean, facing: CameraFacing): CameraHandle {
  const streamRef = useRef<MediaStream | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const stop = () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("unavailable");
        return;
      }
      setStatus("requesting");
      stop();
      setStream(null);
      try {
        const next = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          next.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = next;
        setStream(next);
        setStatus("ready");
      } catch (error) {
        if (cancelled) return;
        const name = error instanceof DOMException ? error.name : "";
        setStatus(name === "NotFoundError" || name === "OverconstrainedError" ? "unavailable" : "denied");
      }
    };

    void start();
    return () => {
      cancelled = true;
      stop();
    };
  }, [active, attempt, facing]);

  return { stream, status, retry, isReady: status === "ready" };
}

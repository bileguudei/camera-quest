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
  const unexpectedEndRetriesRef = useRef(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => {
    unexpectedEndRetriesRef.current = 0;
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let nextStream: MediaStream | null = null;
    let removeTrackListeners = () => {};

    const stop = () => {
      removeTrackListeners();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };

    if (!active) {
      unexpectedEndRetriesRef.current = 0;
      stop();
      return;
    }

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
        nextStream = next;
        streamRef.current = next;
        const handleUnexpectedEnd = () => {
          if (cancelled || streamRef.current !== next) return;
          removeTrackListeners();
          streamRef.current = null;
          setStream(null);

          // A browser or device can end an otherwise healthy camera track while
          // the game stays mounted. Recover once, then expose a stable error so
          // we do not create an unbounded permission/restart loop.
          if (unexpectedEndRetriesRef.current >= 1) {
            setStatus("unavailable");
            return;
          }
          unexpectedEndRetriesRef.current += 1;
          setStatus("requesting");
          setAttempt((value) => value + 1);
        };
        next
          .getVideoTracks()
          .forEach((track) => track.addEventListener("ended", handleUnexpectedEnd));
        removeTrackListeners = () =>
          next
            .getVideoTracks()
            .forEach((track) => track.removeEventListener("ended", handleUnexpectedEnd));
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
      removeTrackListeners();
      nextStream?.getTracks().forEach((track) => track.stop());
      if (streamRef.current === nextStream) streamRef.current = null;
      stop();
    };
  }, [active, attempt, facing]);

  return active
    ? { stream, status, retry, isReady: status === "ready" }
    : { stream: null, status: "idle", retry, isReady: false };
}

"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { AppError } from "@/shared/errors/appError";
import type { Detection } from "./visionTypes";
import type { VisionOutcome } from "./visionTypes";
import { scanTurn } from "./visionClient";

export interface VisionSession {
  status: "idle" | "loading" | "ready" | "error";
  detections: Detection[];
  lock: number;
  colorFill: number;
  note?: string;
  rejectedAt?: number;
  forceMatch: () => void;
}

interface Options {
  videoRef: RefObject<HTMLVideoElement | null>;
  active: boolean;
  turnId: string | null;
  calibrationToken: string | null;
  accessToken: string | null;
  localMode: boolean;
  onPass: (outcome: VisionOutcome) => void;
  onSystemError: () => void;
  onExpired: () => void;
  onLocalMatch: () => void;
}

export function useVisionSession(options: Options): VisionSession {
  const [status, setStatus] = useState<VisionSession["status"]>("idle");
  const [detections, setDetections] = useState<Detection[]>([]);
  const [progress, setProgress] = useState(0);
  const [note, setNote] = useState<string>();
  const [rejectedAt, setRejectedAt] = useState(0);
  const sequence = useRef(0);
  const settled = useRef(false);
  const callbacks = useRef(options);

  useEffect(() => {
    callbacks.current = options;
  }, [options]);

  const forceMatch = useCallback(() => {
    if (callbacks.current.localMode) callbacks.current.onLocalMatch();
  }, []);

  useEffect(() => {
    if (!options.active || options.localMode) return;
    if (!options.turnId || !options.calibrationToken || !options.accessToken) return;

    const controller = new AbortController();
    settled.current = false;
    sequence.current = 0;

    const run = async () => {
      while (!controller.signal.aborted && !settled.current) {
        const video = options.videoRef.current;
        if (!video) {
          await new Promise((resolve) => window.setTimeout(resolve, 100));
          continue;
        }
        try {
          sequence.current += 1;
          const verdict = await scanTurn(
            video,
            options.accessToken!,
            options.turnId!,
            sequence.current,
            options.calibrationToken!,
            controller.signal,
          );
          setProgress(verdict.progress);
          setNote(verdict.note ?? undefined);
          setDetections(
            verdict.detections.map((detection, index) => ({
              id: `${sequence.current}-${index}`,
              className: detection.label,
              label: detection.label,
              score: detection.confidence,
              box: detection.box,
              isTarget: detection.target,
            })),
          );
          if (verdict.decision === "pass" && verdict.outcome) {
            settled.current = true;
            callbacks.current.onPass(verdict.outcome);
          } else if (verdict.decision === "system_error") {
            settled.current = true;
            callbacks.current.onSystemError();
          } else if (verdict.note) {
            setRejectedAt(Date.now());
          }
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") return;
          if (error instanceof AppError && error.code === "INVALID_FRAME") {
            setStatus("ready");
            setNote("Frame-ээ хүрээн дотор тогтвортой барина уу");
            setRejectedAt(Date.now());
            continue;
          }
          if (error instanceof AppError && error.code === "TURN_EXPIRED") {
            settled.current = true;
            callbacks.current.onExpired();
            return;
          }
          setStatus("error");
          settled.current = true;
          callbacks.current.onSystemError();
        }
      }
    };

    const kickoff = window.setTimeout(() => {
      setStatus("ready");
      void run();
    }, 0);
    return () => {
      window.clearTimeout(kickoff);
      controller.abort();
    };
  }, [
    options.accessToken,
    options.active,
    options.calibrationToken,
    options.localMode,
    options.turnId,
    options.videoRef,
  ]);

  return {
    status: !options.active
      ? "idle"
      : options.localMode
        ? "ready"
        : !options.turnId || !options.calibrationToken || !options.accessToken
          ? "loading"
          : status,
    detections,
    lock: progress,
    colorFill: progress,
    note,
    rejectedAt,
    forceMatch,
  };
}

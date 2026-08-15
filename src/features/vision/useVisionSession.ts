"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { AppError } from "@/shared/errors/appError";
import type { Detection } from "./visionTypes";
import type { VisionOutcome } from "./visionTypes";
import {
  createTurnVisionStream,
  scanTurn,
  type TurnVisionStream,
} from "./visionClient";

export const VISION_RETRY_DELAY_MS = 750;
const MAX_SEQUENCE_START = 2_000_000_000;

export const sequenceStartFromEntropy = (entropy: number) =>
  (entropy >>> 0) % MAX_SEQUENCE_START + 1;

const createSequenceStart = () => {
  const entropy = new Uint32Array(1);
  crypto.getRandomValues(entropy);
  return sequenceStartFromEntropy(entropy[0]!);
};

const waitForRetry = (signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(resolve, VISION_RETRY_DELAY_MS);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeout);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });

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
    // A reload must not reuse sequence numbers already accepted by Modal or
    // Postgres for this active turn. The bounded random base stays within int4.
    sequence.current = createSequenceStart();
    let stream: TurnVisionStream | null = null;
    try {
      stream = createTurnVisionStream(
        options.accessToken,
        options.turnId,
        options.calibrationToken,
      );
    } catch {
      // HTTP remains a compatibility fallback for local tools and rolling deploys.
      stream = null;
    }

    const run = async () => {
      while (!controller.signal.aborted && !settled.current) {
        const video = options.videoRef.current;
        if (!video) {
          await new Promise((resolve) => window.setTimeout(resolve, 100));
          continue;
        }
        try {
          sequence.current += 1;
          const verdict = stream
            ? await stream.scan(video, sequence.current, controller.signal)
            : await scanTurn(
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
            stream?.close();
            callbacks.current.onExpired();
            return;
          }
          if (process.env.NODE_ENV === "development") {
            const cause = error instanceof Error ? `${error.name} — ${error.message}` : typeof error;
            console.error(`Camera Quest vision session failed: ${cause}`);
          }
          setStatus("error");
          setNote("Таних үйлчилгээтэй дахин холбогдож байна");
          // A failed stream may have consumed its sequence number. Close it and
          // retry the next sequence through the HTTP compatibility endpoint.
          stream?.close();
          stream = null;
          try {
            await waitForRetry(controller.signal);
          } catch (retryError) {
            if (retryError instanceof DOMException && retryError.name === "AbortError") return;
            throw retryError;
          }
          setStatus("ready");
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
      stream?.close();
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

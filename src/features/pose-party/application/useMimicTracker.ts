"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { MimicObservation } from "../domain/mimicRules";
import type {
  MimicTrackerCommand,
  MimicTrackerMessage,
  ModelLoadStage,
} from "./mimicTrackerMessages";

export type MimicTrackerStatus = "idle" | "loading" | "ready" | "error";

interface UseMimicTrackerOptions {
  active: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  onObservation: (observation: MimicObservation, timestamp: number) => void;
  onError?: (message: string) => void;
  retryKey?: number;
}

interface MimicTrackerState {
  status: MimicTrackerStatus;
  loadStage: ModelLoadStage | null;
}

const FRAME_INTERVAL_MS = 100;

export function useMimicTracker({
  active,
  videoRef,
  onObservation,
  onError,
  retryKey = 0,
}: UseMimicTrackerOptions): MimicTrackerState {
  const workerRef = useRef<Worker | null>(null);
  const readyRef = useRef(false);
  const inFlightRef = useRef(false);
  const lastFrameAtRef = useRef(0);
  const observationRef = useRef(onObservation);
  const errorRef = useRef(onError);
  const [state, setState] = useState<MimicTrackerState>({
    status: "idle",
    loadStage: null,
  });

  useEffect(() => {
    observationRef.current = onObservation;
    errorRef.current = onError;
  }, [onError, onObservation]);

  useEffect(() => {
    if (!active) return;
    if (typeof Worker === "undefined" || typeof createImageBitmap === "undefined") {
      const message = "Энэ browser бодит цагийн нүүр танилтыг дэмжихгүй байна";
      const timer = window.setTimeout(() => {
        setState({ status: "error", loadStage: null });
        errorRef.current?.(message);
      }, 0);
      return () => window.clearTimeout(timer);
    }

    const worker = new Worker(new URL("./mimicLandmarker.worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;
    readyRef.current = false;
    inFlightRef.current = false;

    worker.onmessage = (event: MessageEvent<MimicTrackerMessage>) => {
      const message = event.data;
      if (message.type === "loading") {
        setState({ status: "loading", loadStage: message.stage });
      } else if (message.type === "ready") {
        readyRef.current = true;
        setState({ status: "ready", loadStage: null });
      } else if (message.type === "result") {
        inFlightRef.current = false;
        observationRef.current(message.observation, message.timestamp);
      } else {
        inFlightRef.current = false;
        readyRef.current = false;
        setState({ status: "error", loadStage: null });
        errorRef.current?.(message.message);
      }
    };
    worker.onerror = () => {
      const message = "Mimic model ажиллаж чадсангүй";
      setState({ status: "error", loadStage: null });
      errorRef.current?.(message);
    };
    worker.postMessage({ type: "init" } satisfies MimicTrackerCommand);

    let animationFrame = 0;
    const capture = async (now: number) => {
      animationFrame = requestAnimationFrame(capture);
      if (
        !readyRef.current ||
        inFlightRef.current ||
        now - lastFrameAtRef.current < FRAME_INTERVAL_MS
      ) {
        return;
      }
      const video = videoRef.current;
      if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

      inFlightRef.current = true;
      lastFrameAtRef.current = now;
      try {
        const bitmap = await createImageBitmap(video);
        if (workerRef.current !== worker) {
          bitmap.close();
          return;
        }
        worker.postMessage(
          {
            type: "frame",
            bitmap,
            timestamp: performance.now(),
          } satisfies MimicTrackerCommand,
          [bitmap],
        );
      } catch {
        inFlightRef.current = false;
      }
    };
    animationFrame = requestAnimationFrame(capture);

    return () => {
      cancelAnimationFrame(animationFrame);
      readyRef.current = false;
      inFlightRef.current = false;
      worker.postMessage({ type: "dispose" } satisfies MimicTrackerCommand);
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
    };
  }, [active, retryKey, videoRef]);

  return active ? state : { status: "idle", loadStage: null };
}

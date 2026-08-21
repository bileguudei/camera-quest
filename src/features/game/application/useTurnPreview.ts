"use client";

import { useEffect, useRef, type RefObject } from "react";
import { capturePreviewDataUrl } from "@/features/camera/frameCapture";
import type { TurnChannel } from "../infrastructure/gameRepository";
import type { Detection } from "@/features/vision/visionTypes";

/** 10fps offsets the larger fallback frame while still reading as live motion. */
export const PREVIEW_INTERVAL_MS = 100;
/** A spectator view goes back to "waiting" rather than freezing on a stale frame. */
export const PREVIEW_STALE_MS = 2_000;

interface PublisherOptions {
  videoRef: RefObject<HTMLVideoElement | null>;
  channel: TurnChannel | null;
  seat: number | null;
  turnId: string | null;
  /** False once every watcher is on WebRTC — then frames are pure waste. */
  enabled: boolean;
  progress: number;
  detections: Detection[];
}

/**
 * The fallback path for the live spectator view: a small JPEG of the player's
 * camera on the game channel. It carries the view until WebRTC connects, and
 * for the networks where a direct peer connection never will. It is decoupled
 * from the vision loop — a dropped or slow preview can never delay a batch,
 * change a verdict, or touch the score.
 */
export function useTurnPreviewPublisher({
  videoRef,
  channel,
  seat,
  turnId,
  enabled,
  progress,
  detections,
}: PublisherOptions): void {
  const latest = useRef({ progress, detections });

  useEffect(() => {
    latest.current = { progress, detections };
  }, [detections, progress]);

  useEffect(() => {
    if (!channel || !seat || !turnId || !enabled) return;
    let cancelled = false;
    let timer = 0;

    // Self-pacing instead of setInterval: the next capture is scheduled only
    // after the previous one is on the wire, so a slow phone drops frames
    // rather than queueing a backlog that arrives seconds late.
    const pump = async () => {
      const started = performance.now();
      const video = videoRef.current;
      if (video) {
        try {
          const image = await capturePreviewDataUrl(video);
          if (cancelled) return;
          if (image) {
            channel.publishFrame({
              seat,
              turnId,
              image,
              progress: Math.min(1, Math.max(0, latest.current.progress)),
              detections: latest.current.detections.slice(0, 12).map((detection) => ({
                label: detection.label,
                score: detection.score,
                box: detection.box,
                isTarget: detection.isTarget,
              })),
            });
          }
        } catch {
          // A preview frame is never worth failing a turn over.
        }
      }
      if (cancelled) return;
      const spent = performance.now() - started;
      timer = window.setTimeout(() => void pump(), Math.max(0, PREVIEW_INTERVAL_MS - spent));
    };

    void pump();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [channel, enabled, seat, turnId, videoRef]);
}

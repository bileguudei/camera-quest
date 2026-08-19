"use client";

import { Radio } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { mn } from "@/content/mn";
import { PREVIEW_STALE_MS } from "@/features/game/application/useTurnPreview";
import { useTurnVideoViewer } from "@/features/game/application/useTurnVideo";
import { PLAYER_COLOR_HEX } from "@/features/game/domain/config";
import type { LobbyState, Player, TurnPreviewFrame } from "@/features/game/domain/types";

interface SpectatorStageProps {
  lobby: LobbyState;
  player: Player;
  prompt: string | null;
  remainingLabel: string | null;
  className?: string;
}

/** Boxes and the progress bar refresh slower than the image; the eye cannot tell. */
const OVERLAY_INTERVAL_MS = 200;

/**
 * The stage a waiting phone watches: the active player's camera filling the
 * space it is given, with the recognition boxes drawn over it. Everything here
 * is presentation — the score still arrives through the authoritative turn row.
 */
export function SpectatorStage({
  lobby,
  player,
  prompt,
  remainingLabel,
  className = "",
}: SpectatorStageProps) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const staleTimer = useRef(0);
  const overlayAt = useRef(0);
  const [overlay, setOverlay] = useState<Pick<TurnPreviewFrame, "detections" | "progress"> | null>(
    null,
  );
  const [live, setLive] = useState(false);

  const handleFrame = useCallback(
    (frame: TurnPreviewFrame | null) => {
      if (!frame || frame.seat !== lobby.currentSeat) {
        setLive(false);
        setOverlay(null);
        return;
      }
      window.clearTimeout(staleTimer.current);
      staleTimer.current = window.setTimeout(() => setLive(false), PREVIEW_STALE_MS);
      // The image is written straight to the DOM: re-rendering React twelve
      // times a second is what turns a live view into a stutter.
      if (imageRef.current) imageRef.current.src = frame.image;
      setLive(true);

      const now = performance.now();
      if (now - overlayAt.current < OVERLAY_INTERVAL_MS) return;
      overlayAt.current = now;
      setOverlay({ detections: frame.detections, progress: frame.progress });
    },
    [lobby.currentSeat],
  );

  // WebRTC when the phones can reach each other, frames when they cannot. The
  // watcher never has to choose: whichever arrives is what it shows.
  const videoStream = useTurnVideoViewer({
    gameId: lobby.gameId,
    enabled: true,
    onFrame: handleFrame,
  });

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    element.srcObject = videoStream;
    if (videoStream) void element.play().catch(() => undefined);
  }, [videoStream]);

  useEffect(() => () => window.clearTimeout(staleTimer.current), []);

  const showing = videoStream ? "video" : live ? "frames" : "waiting";
  const color = PLAYER_COLOR_HEX[player.color];

  return (
    <div
      className={[
        "relative min-h-0 w-full overflow-hidden rounded-g4 border border-line/80 bg-black/55",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ boxShadow: `0 0 0 1px color-mix(in oklab, ${color} 28%, transparent)` }}
    >
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className={`absolute inset-0 size-full object-cover transition-opacity duration-300 ${
          showing === "video" ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* eslint-disable-next-line @next/next/no-img-element -- a data URL frame, not an asset */}
      <img
        ref={imageRef}
        alt=""
        decoding="sync"
        className={`absolute inset-0 size-full object-cover transition-opacity duration-300 ${
          showing === "frames" ? "opacity-100" : "opacity-0"
        }`}
      />

      {showing !== "waiting" && overlay && (
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {overlay.detections.map((detection, index) => (
            <span
              key={`${detection.label}-${index}`}
              className="absolute rounded-g1 border-2"
              style={{
                left: `${detection.box.x * 100}%`,
                top: `${detection.box.y * 100}%`,
                width: `${detection.box.w * 100}%`,
                height: `${detection.box.h * 100}%`,
                borderColor: detection.isTarget ? "var(--primary)" : "rgba(255,255,255,0.5)",
                boxShadow: detection.isTarget
                  ? "0 0 22px -4px var(--primary)"
                  : undefined,
              }}
            />
          ))}
        </div>
      )}

      {showing === "waiting" && (
        <div className="absolute inset-0 grid place-items-center px-6 text-center">
          <div className="flex flex-col items-center gap-3">
            <span className="grid size-14 animate-pulse place-items-center rounded-full bg-white/8 text-2xl">
              📷
            </span>
            <p className="max-w-[24ch] text-sm text-ink-3">{mn.online.waitingForCamera}</p>
          </div>
        </div>
      )}

      {/* Status chips float over the stage so the video keeps every pixel. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2.5 sm:p-3">
        {showing !== "waiting" ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-black/65 px-2.5 py-1 text-xs font-black tracking-wide text-danger backdrop-blur-[3px]">
            <Radio className="size-3.5 animate-pulse" strokeWidth={2.8} />
            {showing === "video" ? "LIVE HD" : "LIVE"}
          </span>
        ) : (
          <span />
        )}

        {remainingLabel && (
          <span className="rounded-full bg-black/65 px-3 py-1 font-display text-sm font-black tabular-nums text-ink backdrop-blur-[3px] sm:text-base">
            {remainingLabel}
          </span>
        )}
      </div>

      {/* Compact identity + quest for phones, where there is no side panel. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 lg:hidden">
        <div className="bg-gradient-to-t from-black/80 to-transparent p-3 pt-8">
          <p className="truncate font-display text-lg font-black" style={{ color }}>
            {mn.online.watchingLive(player.name)}
          </p>
          {prompt && <p className="mt-0.5 truncate text-sm text-ink-2">{prompt}</p>}
        </div>
      </div>

      {overlay && showing !== "waiting" && (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
          <div
            className="h-full bg-primary transition-[width] duration-200"
            style={{ width: `${Math.round(overlay.progress * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

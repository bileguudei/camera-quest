"use client";

import type { CSSProperties } from "react";
import type { Detection } from "@/features/vision/visionTypes";

interface BoundingBoxProps {
  detection: Detection;
  mirrored?: boolean;
  /** 0..1 lock progress — only meaningful for the target box. */
  lock?: number;
  /** Show the raw confidence value (development only). */
  showScore?: boolean;
}

/**
 * Corner-bracket box. Neutral grey for clutter, bright + animated for the
 * object the player is actually hunting.
 */
export function BoundingBox({
  detection,
  mirrored = false,
  lock = 0,
  showScore = false,
}: BoundingBoxProps) {
  const { box, isTarget, label, score } = detection;
  const color = isTarget ? "var(--primary)" : "#ffffff";

  const style: CSSProperties = {
    left: `${(mirrored ? 1 - box.x - box.w : box.x) * 100}%`,
    top: `${box.y * 100}%`,
    width: `${box.w * 100}%`,
    height: `${box.h * 100}%`,
    transition: "all 90ms linear",
  };

  return (
    <div className="pointer-events-none absolute" style={style}>
      <div
        className="absolute inset-0 rounded-g2 border-2"
        style={{
          borderColor: color,
          borderWidth: isTarget ? 3 : 2,
          // A plain white outline reads on any background once it carries its
          // own shadow — no tint needed to stay legible over live video.
          boxShadow: isTarget
            ? `0 0 0 ${Math.round(lock * 6)}px color-mix(in oklab, var(--primary) ${Math.round(lock * 26)}%, transparent), 0 0 26px -4px var(--primary)`
            : "0 0 0 1px rgb(0 0 0 / 0.45), 0 2px 10px -2px rgb(0 0 0 / 0.6)",
          opacity: isTarget ? 1 : 0.95,
        }}
      />

      {isTarget && (
        <>
          <Corner className="left-0 top-0 border-l-4 border-t-4 rounded-tl-g2" />
          <Corner className="right-0 top-0 border-r-4 border-t-4 rounded-tr-g2" />
          <Corner className="bottom-0 left-0 border-b-4 border-l-4 rounded-bl-g2" />
          <Corner className="bottom-0 right-0 border-b-4 border-r-4 rounded-br-g2" />
        </>
      )}

      <span
        className={[
          "absolute -top-1 left-0 -translate-y-full",
          "max-w-full truncate rounded-g1 px-2 py-1",
          "font-display text-xs font-extrabold tracking-tight sm:text-sm",
        ].join(" ")}
        style={{
          backgroundColor: isTarget ? "var(--primary)" : "rgba(10,13,28,0.85)",
          color: isTarget ? "var(--primary-ink)" : "#ffffff",
        }}
      >
        {label}
        {showScore && (
          <span className="ml-1.5 opacity-60 tabular-nums">
            {Math.round(score * 100)}%
          </span>
        )}
      </span>
    </div>
  );
}

function Corner({ className }: { className: string }) {
  return (
    <span
      aria-hidden
      className={["absolute size-5 border-primary", className].join(" ")}
    />
  );
}

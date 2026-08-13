"use client";

import { useEffect, useRef } from "react";
import type { ReactNode, RefObject } from "react";
import type { CameraFacing } from "@/features/game/domain/types";

interface CameraFrameProps {
  stream: MediaStream | null;
  facing: CameraFacing;
  /** No camera? Show the animated stand-in so the game stays playable. */
  demo?: boolean;
  children?: ReactNode;
  className?: string;
  dim?: boolean;
  /** Lets the detector read the very element the player is looking at. */
  videoRef?: RefObject<HTMLVideoElement | null>;
}

/**
 * The video surface. Always `object-cover` so the camera stays the dominant
 * visual element in both portrait and landscape.
 */
export function CameraFrame({
  stream,
  facing,
  demo = false,
  children,
  className = "",
  dim = false,
  videoRef,
}: CameraFrameProps) {
  const ownRef = useRef<HTMLVideoElement | null>(null);
  const ref = videoRef ?? ownRef;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }
    if (stream) void el.play().catch(() => {});
  }, [stream, ref]);

  return (
    <div className={["relative overflow-hidden bg-bg-2", className].join(" ")}>
      {stream && !demo ? (
        <video
          ref={ref}
          playsInline
          muted
          autoPlay
          className="absolute inset-0 size-full object-cover"
          style={{ transform: facing === "user" ? "scaleX(-1)" : undefined }}
        />
      ) : (
        <DemoSurface />
      )}

      {/* Readability scrim — keeps overlay text legible on bright rooms. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(7,10,22,0.72) 0%, rgba(7,10,22,0.05) 26%, rgba(7,10,22,0.08) 62%, rgba(7,10,22,0.82) 100%)",
        }}
      />

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-bg/70 transition-opacity duration-300"
        style={{ opacity: dim ? 1 : 0 }}
      />

      {children}
    </div>
  );
}

/** Fake "camera" for desktop testing and denied-permission demo mode. */
function DemoSurface() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#0b1030]">
      <div
        aria-hidden
        className="absolute -left-1/4 top-[-20%] size-[70%] rounded-full opacity-45 blur-3xl anim-float"
        style={{ background: "radial-gradient(circle, var(--accent), transparent 65%)" }}
      />
      <div
        aria-hidden
        className="absolute -right-[15%] bottom-[-15%] size-[65%] rounded-full opacity-35 blur-3xl anim-float"
        style={{
          background: "radial-gradient(circle, var(--accent-2), transparent 65%)",
          animationDelay: "1.2s",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.16]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.35) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />
      <div className="absolute inset-0 overflow-hidden">
        <div
          aria-hidden
          className="h-16 w-full anim-scan"
          style={{
            background:
              "linear-gradient(180deg, transparent, rgba(182,242,60,0.14), transparent)",
          }}
        />
      </div>
    </div>
  );
}

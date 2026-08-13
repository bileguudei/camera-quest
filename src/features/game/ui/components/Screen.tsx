"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { TIMING } from "@/features/game/domain/config";

interface ScreenProps {
  children: ReactNode;
  className?: string;
  /** `none` for full-bleed camera screens. */
  padding?: "none" | "normal";
  /** Skip the ambient glow layer (camera screens draw their own surface). */
  backdrop?: boolean;
}

/**
 * Every screen is a full-viewport stage — never a document that scrolls the
 * page. Inner regions opt into their own scrolling.
 */
export function Screen({
  children,
  className = "",
  padding = "normal",
  backdrop = true,
}: ScreenProps) {
  return (
    <motion.section
      initial={{ opacity: 0, scale: 0.985 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.015 }}
      transition={{ duration: TIMING.screenTransition, ease: [0.16, 1, 0.3, 1] }}
      className={[
        "relative flex h-[100dvh] w-full flex-col overflow-hidden",
        padding === "normal" ? "inset-safe" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {backdrop && <Backdrop />}
      {children}
    </motion.section>
  );
}

/** Static ambient glow. No animation — it sits behind everything, cheaply. */
export function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div
        className="absolute -left-[30%] -top-[18%] size-[75vmin] rounded-full opacity-30 blur-[90px]"
        style={{ background: "radial-gradient(circle, var(--accent), transparent 66%)" }}
      />
      <div
        className="absolute -right-[26%] top-[38%] size-[62vmin] rounded-full opacity-22 blur-[90px]"
        style={{ background: "radial-gradient(circle, var(--accent-2), transparent 66%)" }}
      />
      <div
        className="absolute bottom-[-24%] left-[12%] size-[58vmin] rounded-full opacity-16 blur-[90px]"
        style={{ background: "radial-gradient(circle, var(--primary), transparent 66%)" }}
      />
    </div>
  );
}

/** Scrollable middle region for setup-style screens. */
export function ScreenBody({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        "min-h-0 flex-1 overflow-y-auto overscroll-contain no-scrollbar",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

/** Sticky action area at the bottom of a screen. One primary action only. */
export function ScreenFooter({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={["shrink-0 pt-3", className].join(" ")}>
      <div className="mx-auto w-full max-w-md">{children}</div>
    </div>
  );
}

"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { TIMING } from "@/features/game/domain/config";
import { mn } from "@/content/mn";

interface CountdownProps {
  from?: number;
  /** Word shown after the last number, before finishing. */
  goLabel?: string;
  onDone: () => void;
  color?: string;
}

/** Big 3 · 2 · 1 · GO! — used by Round Intro and Turn Intro. */
export function Countdown({
  from = 3,
  goLabel = mn.turn.go,
  onDone,
  color = "var(--primary)",
}: CountdownProps) {
  // from..1, then 0 == the GO! frame
  const [n, setN] = useState(from);

  useEffect(() => {
    if (n < 0) return;
    const id = window.setTimeout(
      () => (n === 0 ? onDone() : setN((v) => v - 1)),
      TIMING.countdownStep,
    );
    return () => window.clearTimeout(id);
  }, [n, onDone]);

  const isGo = n === 0;

  return (
    <div
      className="grid place-items-center"
      role="status"
      aria-live="assertive"
      aria-label={isGo ? goLabel : String(n)}
    >
      <AnimatePresence mode="popLayout">
        <motion.span
          key={n}
          initial={{ scale: 0.35, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 1.7, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 18 }}
          className="font-display font-black leading-none tracking-tight"
          style={{
            color: isGo ? "var(--primary)" : color,
            fontSize: isGo ? "clamp(3.5rem,18vw,7rem)" : "clamp(5rem,30vw,12rem)",
            textShadow: `0 0 60px color-mix(in oklab, ${color} 55%, transparent)`,
          }}
        >
          {isGo ? goLabel : n}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";

interface ScorePopupProps {
  points: number;
  className?: string;
}

/** The "+24 оноо" burst. Transform/opacity only — safe over live video. */
export function ScorePopup({ points, className = "" }: ScorePopupProps) {
  return (
    <motion.div
      initial={{ scale: 0.3, opacity: 0, y: 18 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 340, damping: 16, delay: 0.12 }}
      className={[
        "font-display text-[clamp(2rem,11vw,3.5rem)] font-black leading-none text-primary",
        className,
      ].join(" ")}
      style={{ textShadow: "0 0 40px color-mix(in oklab, var(--primary) 55%, transparent)" }}
    >
      +{points}
    </motion.div>
  );
}

/** Counts a total up to its new value so scores feel earned. */
export function CountUp({
  to,
  duration = 700,
  className = "",
}: {
  to: number;
  duration?: number;
  className?: string;
}) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutCubic
      setValue(Math.round(to * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, duration]);

  return <span className={["tabular-nums", className].join(" ")}>{value}</span>;
}

"use client";

import { PASS_SCORE } from "../domain/mimicRules";

export function MimicProgressRing({
  score,
  holdProgress,
}: {
  score: number;
  holdProgress: number;
}) {
  const radius = 39;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(1, score));
  return (
    <div
      role="progressbar"
      aria-label="Expression progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      className="relative grid size-[5.6rem] place-items-center"
    >
      <svg viewBox="0 0 92 92" className="absolute inset-0 size-full -rotate-90">
        <circle
          cx="46"
          cy="46"
          r={radius}
          fill="rgba(7,10,22,0.5)"
          stroke="rgba(47,55,117,0.82)"
          strokeWidth="6"
        />
        <circle
          cx="46"
          cy="46"
          r={radius}
          fill="none"
          stroke={progress >= PASS_SCORE ? "var(--primary)" : "var(--accent-2)"}
          strokeLinecap="round"
          strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          className="transition-[stroke-dashoffset,stroke] duration-100 ease-linear"
          style={{
            filter: `drop-shadow(0 0 ${progress >= PASS_SCORE ? 7 : 4}px currentColor)`,
          }}
        />
      </svg>
      <div className="relative text-center">
        <span className="block font-display text-xl font-black leading-none text-ink">
          {Math.round(progress * 100)}
        </span>
        <span
          className={`mt-1 block text-[7px] font-black tracking-[0.13em] ${
            holdProgress > 0 ? "text-primary" : "text-ink-3"
          }`}
        >
          {holdProgress > 0 ? "HOLD" : "MATCH"}
        </span>
      </div>
    </div>
  );
}

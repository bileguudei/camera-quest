"use client";

import { TIMING } from "@/features/game/domain/config";

interface GameTimerProps {
  remainingMs: number;
  totalMs: number;
  /** Outer pixel size of the ring. */
  size?: number;
}

export type TimerUrgency = "calm" | "warn" | "danger" | "critical";

export function urgencyOf(remainingMs: number): TimerUrgency {
  const s = remainingMs / 1000;
  if (s <= TIMING.criticalAt) return "critical";
  if (s <= TIMING.dangerAt) return "danger";
  if (s <= TIMING.warnAt) return "warn";
  return "calm";
}

const COLORS: Record<TimerUrgency, string> = {
  calm: "var(--primary)",
  warn: "var(--warn)",
  danger: "var(--danger)",
  critical: "var(--danger)",
};

/**
 * Progress-ring countdown. Reads at arm's length and escalates in three steps:
 * 10s tint, 5s pulse, 3s hard pulse.
 */
export function GameTimer({ remainingMs, totalMs, size = 84 }: GameTimerProps) {
  const urgency = urgencyOf(remainingMs);
  const color = COLORS[urgency];
  const pct = Math.max(0, Math.min(1, remainingMs / totalMs));

  const stroke = size >= 100 ? 9 : 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));

  const anim =
    urgency === "critical"
      ? "anim-pulse-hard"
      : urgency === "danger"
        ? "anim-pulse-soft"
        : "";

  return (
    <div
      className={["relative grid place-items-center", anim].join(" ")}
      style={{ width: size, height: size }}
      role="timer"
      aria-live="off"
      aria-label={`Үлдсэн хугацаа ${seconds} секунд`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="rgba(7,10,22,0.62)"
          stroke="rgba(255,255,255,0.14)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{
            transition: "stroke-dashoffset 120ms linear, stroke 300ms linear",
            filter: `drop-shadow(0 0 6px ${color})`,
          }}
        />
      </svg>

      <span
        className="absolute font-display font-black leading-none tabular-nums"
        style={{
          color,
          fontSize: size * 0.36,
          textShadow: "0 2px 10px rgba(0,0,0,0.6)",
        }}
      >
        {seconds}
      </span>
    </div>
  );
}

/** Slim linear variant for landscape, where a ring eats vertical room. */
export function GameTimerBar({ remainingMs, totalMs }: GameTimerProps) {
  const urgency = urgencyOf(remainingMs);
  const color = COLORS[urgency];
  const pct = Math.max(0, Math.min(1, remainingMs / totalMs)) * 100;
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));

  return (
    <div className="flex items-center gap-3">
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-black/50 ring-1 ring-white/12">
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            backgroundColor: color,
            transition: "width 120ms linear, background-color 300ms linear",
          }}
        />
      </div>
      <span
        className="font-display text-2xl font-black tabular-nums"
        style={{ color }}
      >
        {seconds}
      </span>
    </div>
  );
}

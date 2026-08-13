import type { CSSProperties } from "react";
import { DIFFICULTY_ACCENT, TOTAL_ROUNDS } from "@/features/game/domain/config";
import { mn } from "@/content/mn";
import type { Difficulty } from "@/features/game/domain/types";

interface RoundBadgeProps {
  round: number;
  difficulty: Difficulty;
  size?: "sm" | "lg";
  className?: string;
}

export function RoundBadge({
  round,
  difficulty,
  size = "sm",
  className = "",
}: RoundBadgeProps) {
  const color = DIFFICULTY_ACCENT[difficulty];

  return (
    <span
      style={
        {
          color,
          borderColor: `color-mix(in oklab, ${color} 55%, transparent)`,
          backgroundColor: `color-mix(in oklab, ${color} 14%, var(--surface))`,
        } as CSSProperties
      }
      className={[
        "inline-flex shrink-0 items-center gap-2 rounded-full border font-display font-black tracking-wide",
        size === "lg" ? "px-5 py-2 text-lg" : "px-3 py-1 text-xs sm:text-sm",
        className,
      ].join(" ")}
    >
      {mn.round.badge(round)}
      <span className="opacity-55">·</span>
      <span className="font-bold">{mn.round.difficulty[difficulty]}</span>
    </span>
  );
}

/** Dot-per-round progress. Shows the shape of the whole game at a glance. */
export function GameProgress({
  round,
  total = TOTAL_ROUNDS,
  className = "",
}: {
  round: number;
  total?: number;
  className?: string;
}) {
  return (
    <div
      className={["flex items-center gap-1.5", className].join(" ")}
      aria-label={mn.round.of(round, total)}
    >
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        const state = n < round ? "done" : n === round ? "current" : "todo";
        return (
          <span
            key={n}
            aria-hidden
            className={[
              "h-1.5 rounded-full transition-all duration-300",
              state === "current"
                ? "w-7 bg-primary"
                : state === "done"
                  ? "w-3 bg-primary/45"
                  : "w-3 bg-line",
            ].join(" ")}
          />
        );
      })}
    </div>
  );
}

"use client";

import { motion } from "motion/react";
import type { CSSProperties } from "react";
import { PLAYER_COLOR_HEX } from "@/features/game/domain/config";
import type { Player } from "@/features/game/domain/types";

interface PlayerScoreProps {
  player: Player;
  active?: boolean;
  /** Hide the name when six players share a 375px strip. */
  compact?: boolean;
}

/** One compact score chip. Shrinks to fit — never forces horizontal scroll. */
export function PlayerScore({ player, active = false, compact = false }: PlayerScoreProps) {
  const color = PLAYER_COLOR_HEX[player.color];

  return (
    <motion.div
      layout
      animate={{ scale: active ? 1 : 0.96, opacity: active ? 1 : 0.72 }}
      transition={{ type: "spring", stiffness: 320, damping: 26 }}
      style={
        {
          "--pc": color,
          borderColor: active
            ? `color-mix(in oklab, ${color} 85%, transparent)`
            : "color-mix(in oklab, var(--line) 60%, transparent)",
          backgroundColor: active
            ? `color-mix(in oklab, ${color} 20%, var(--surface))`
            : "color-mix(in oklab, var(--surface) 78%, transparent)",
          boxShadow: active ? `0 0 22px -8px ${color}` : undefined,
        } as CSSProperties
      }
      className="flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-g2 border px-1 py-1.5 text-center"
    >
      <span aria-hidden className="text-base leading-none sm:text-lg">
        {player.avatar}
      </span>

      {!compact && (
        <span className="w-full truncate text-[10px] font-semibold text-ink-2 sm:text-xs">
          {player.name}
        </span>
      )}

      <span
        className="font-display text-base font-black leading-none tabular-nums sm:text-lg"
        style={{ color: active ? color : "var(--ink)" }}
      >
        {player.score}
      </span>
    </motion.div>
  );
}

interface PlayerStripProps {
  players: Player[];
  activeId?: string;
  className?: string;
}

export function PlayerStrip({ players, activeId, className = "" }: PlayerStripProps) {
  const compact = players.length >= 5;

  return (
    <ul
      className={["flex w-full items-stretch gap-1.5 sm:gap-2", className].join(" ")}
      aria-label="Тоглогчдын оноо"
    >
      {players.map((p) => (
        <li key={p.id} className="flex min-w-0 flex-1">
          <PlayerScore player={p} active={p.id === activeId} compact={compact} />
          <span className="sr-only">
            {p.name}: {p.score} оноо
          </span>
        </li>
      ))}
    </ul>
  );
}

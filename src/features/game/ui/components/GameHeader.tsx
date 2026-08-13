"use client";

import type { ReactNode } from "react";
import { PlayerStrip } from "./PlayerStrip";
import { GameProgress, RoundBadge } from "./RoundBadge";
import type { Difficulty, Player } from "@/features/game/domain/types";

interface GameHeaderProps {
  round: number;
  difficulty: Difficulty;
  players: Player[];
  activeId?: string;
  right?: ReactNode;
  /** Camera screens need an opaque-ish plate for legibility. */
  floating?: boolean;
}

/** Round badge + live score strip. Answers "who's up and where am I?". */
export function GameHeader({
  round,
  difficulty,
  players,
  activeId,
  right,
  floating = false,
}: GameHeaderProps) {
  return (
    <header
      className={[
        "flex w-full shrink-0 flex-col gap-2",
        floating
          ? "rounded-g3 border border-white/10 bg-black/55 p-2.5 backdrop-blur-[3px]"
          : "",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-2">
        <RoundBadge round={round} difficulty={difficulty} />
        <div className="flex items-center gap-2">
          <GameProgress round={round} />
          {right}
        </div>
      </div>

      <PlayerStrip players={players} activeId={activeId} />
    </header>
  );
}

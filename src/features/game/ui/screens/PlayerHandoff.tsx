"use client";

import { Hand } from "lucide-react";
import { motion } from "motion/react";
import { GameButton } from "@/features/game/ui/components/GameButton";
import { PlayerAvatar } from "@/features/game/ui/components/PlayerAvatar";
import { RoundBadge } from "@/features/game/ui/components/RoundBadge";
import { Screen, ScreenFooter } from "@/features/game/ui/components/Screen";
import { mn } from "@/content/mn";
import { useGame } from "@/features/game/application/useGame";
import { PLAYER_COLOR_HEX } from "@/features/game/domain/config";
import { handoffErrorMessage } from "@/features/game/domain/errorMessages";

export function PlayerHandoff() {
  const player = useGame((state) => state.currentPlayer());
  const round = useGame((state) => state.currentRound());
  const roundIndex = useGame((state) => state.roundIndex);
  const ready = useGame((state) => state.readyForTurn);
  const errorCode = useGame((state) => state.errorCode);
  if (!player) return null;
  const color = PLAYER_COLOR_HEX[player.color];

  return (
    <Screen className="items-center justify-center text-center">
      <div className="absolute inset-x-0 top-0 flex justify-center pt-safe">
        <RoundBadge round={roundIndex + 1} difficulty={round.difficulty} />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.88 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-5"
      >
        <PlayerAvatar player={player} size="xl" active />
        <h1
          className="max-w-[18ch] font-display text-[clamp(1.9rem,9.5vw,3.5rem)] font-black leading-[1.05] tracking-tight"
          style={{ color, overflowWrap: "anywhere" }}
        >
          {mn.turn.whoseTurn(player.name)}
        </h1>
        <p className="text-base text-ink-3 sm:text-lg">{mn.turn.handOver}</p>
        {errorCode && (
          <p role="alert" className="max-w-sm rounded-full bg-warn/15 px-4 py-2 text-sm font-bold text-warn">
            {handoffErrorMessage(errorCode)}
          </p>
        )}
      </motion.div>

      <ScreenFooter>
        <GameButton onClick={ready} icon={<Hand className="size-6" strokeWidth={2.6} />}>
          {mn.turn.start}
        </GameButton>
      </ScreenFooter>
    </Screen>
  );
}

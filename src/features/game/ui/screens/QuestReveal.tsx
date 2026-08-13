"use client";

import { motion } from "motion/react";
import { useEffect } from "react";
import { ChallengeCard } from "@/features/game/ui/components/ChallengeCard";
import { RoundBadge } from "@/features/game/ui/components/RoundBadge";
import { Screen } from "@/features/game/ui/components/Screen";
import { mn } from "@/content/mn";
import { useGame } from "@/features/game/application/useGame";
import { TIMING } from "@/features/game/domain/config";

export function QuestReveal() {
  const challenge = useGame((state) => state.challenge);
  const round = useGame((state) => state.currentRound());
  const roundIndex = useGame((state) => state.roundIndex);
  const done = useGame((state) => state.revealDone);

  useEffect(() => {
    const timeout = window.setTimeout(done, TIMING.questRevealHold);
    return () => window.clearTimeout(timeout);
  }, [done]);

  if (!challenge) return null;
  return (
    <Screen className="items-center justify-center text-center">
      <div className="absolute inset-x-0 top-0 flex justify-center pt-safe">
        <RoundBadge round={roundIndex + 1} difficulty={round.difficulty} />
      </div>
      <motion.div
        initial={{ opacity: 0, scale: 0.8, rotateX: -20 }}
        animate={{ opacity: 1, scale: 1, rotateX: 0 }}
        className="flex w-full flex-col items-center gap-5 px-5"
      >
        <p className="font-display text-sm font-bold uppercase tracking-[0.3em] text-ink-3">
          {mn.turn.reveal}
        </p>
        <ChallengeCard challenge={challenge} variant="hero" />
      </motion.div>
    </Screen>
  );
}

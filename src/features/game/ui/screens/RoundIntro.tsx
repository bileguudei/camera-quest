"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { Countdown } from "@/features/game/ui/components/Countdown";
import { GameProgress } from "@/features/game/ui/components/RoundBadge";
import { Screen } from "@/features/game/ui/components/Screen";
import { mn } from "@/content/mn";
import { DIFFICULTY_ACCENT, TIMING, TOTAL_ROUNDS } from "@/features/game/domain/config";
import { useGame } from "@/features/game/application/useGame";

type Stage = "title" | "count";

/** Fullscreen round card, then a 3-2-1 into the first turn. */
export function RoundIntro() {
  const roundIndex = useGame((s) => s.roundIndex);
  const round = useGame((s) => s.currentRound());
  const beginRound = useGame((s) => s.beginRound);

  const [stage, setStage] = useState<Stage>("title");
  const color = DIFFICULTY_ACCENT[round.difficulty];

  useEffect(() => {
    const id = window.setTimeout(() => setStage("count"), TIMING.roundIntroHold);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <Screen className="items-center justify-center text-center">
      <GameProgress round={roundIndex + 1} className="absolute inset-x-0 top-6 justify-center" />

      <AnimatePresence mode="wait">
        {stage === "title" ? (
          <motion.div
            key="title"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.08 }}
            transition={{ type: "spring", stiffness: 250, damping: 20 }}
            className="flex w-full max-w-lg flex-col items-center gap-4"
          >
            <motion.p
              initial={{ letterSpacing: "0.5em", opacity: 0 }}
              animate={{ letterSpacing: "0.12em", opacity: 1 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="font-display text-[clamp(2.25rem,12vw,4.5rem)] font-black leading-none text-ink"
            >
              {mn.round.badge(roundIndex + 1)}
            </motion.p>

            <span
              className="rounded-full border px-6 py-2 font-display text-[clamp(1.5rem,7vw,2.5rem)] font-black leading-none"
              style={{
                color,
                borderColor: `color-mix(in oklab, ${color} 55%, transparent)`,
                backgroundColor: `color-mix(in oklab, ${color} 15%, transparent)`,
                boxShadow: `0 0 44px -10px ${color}`,
              }}
            >
              {mn.round.difficulty[round.difficulty]}
            </span>

            <p className="max-w-[24rem] text-balance text-base leading-relaxed text-ink-2 sm:text-lg">
              {mn.round.blurb[round.difficulty]}
            </p>

            <p className="pt-2 font-display text-sm font-bold uppercase tracking-widest text-ink-3">
              {round.seconds} сек · {mn.round.of(roundIndex + 1, TOTAL_ROUNDS)}
            </p>
          </motion.div>
        ) : (
          <Countdown key="count" onDone={beginRound} goLabel={mn.round.go} color={color} />
        )}
      </AnimatePresence>
    </Screen>
  );
}

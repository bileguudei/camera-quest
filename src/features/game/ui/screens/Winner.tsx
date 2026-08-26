"use client";

import { RotateCcw, Trophy, Users } from "lucide-react";
import { motion } from "motion/react";
import { Confetti } from "@/features/game/ui/components/Confetti";
import { GameButton } from "@/features/game/ui/components/GameButton";
import { PlayerAvatar } from "@/features/game/ui/components/PlayerAvatar";
import { CountUp } from "@/features/game/ui/components/ScorePopup";
import {
  Screen,
  ScreenBody,
  ScreenFooter,
} from "@/features/game/ui/components/Screen";
import { mn } from "@/content/mn";
import { PLAYER_COLOR_HEX } from "@/features/game/domain/config";
import { rankWithMovement, winners } from "@/features/game/domain/scoring";
import { useGame } from "@/features/game/application/useGame";
import { LeaderRow } from "./RoundResult";

export function Winner() {
  const players = useGame((s) => s.players);
  const snapshot = useGame((s) => s.roundSnapshot);
  const playAgain = useGame((s) => s.playAgain);
  const newGame = useGame((s) => s.newGame);
  const busy = useGame((s) => s.busy);
  const errorCode = useGame((s) => s.errorCode);
  const lobby = useGame((s) => s.lobby);

  const rows = rankWithMovement(players, snapshot);
  const champs = winners(players);
  const champ = champs[0];
  const color = PLAYER_COLOR_HEX[champ.color];

  const title =
    players.length === 1
      ? mn.winner.soloDone
      : champs.length > 1
        ? mn.winner.tie
        : mn.winner.title(champ.name);
  const rematchStatus =
    lobby?.status === "completed"
      ? mn.winner.rematchStatus(lobby.rematchReadyCount, lobby.rematchPlayerCount)
      : null;

  return (
    <Screen className="justify-between">
      <Confetti intensity="celebrate" />

      <ScreenBody className="flex flex-col justify-center lg:overflow-visible">
        {/* From `lg` the celebration and the board stop stacking into a lonely
            phone column and share a stage card instead. */}
        <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 py-3 lg:grid lg:max-w-[1120px] lg:grid-cols-[1.12fr_0.88fr] lg:items-stretch lg:gap-0 lg:stage-card lg:overflow-hidden lg:py-0">
          <div className="flex w-full flex-col items-center gap-4 lg:justify-center lg:px-10 lg:py-10">
            {/* Trophy + crowned avatar */}
            <motion.div
              initial={{ scale: 0.4, opacity: 0, y: 24 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 240, damping: 15 }}
              className="relative"
            >
              <span
                aria-hidden
                className="absolute -top-9 left-1/2 -translate-x-1/2 text-gold anim-float"
              >
                <Trophy className="size-12 sm:size-14" strokeWidth={2.2} />
              </span>
              <PlayerAvatar player={champ} size="xl" active className="mt-4" />
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 -z-10 rounded-full blur-2xl"
                style={{ background: color, opacity: 0.35 }}
              />
            </motion.div>

            <motion.h1
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{
                type: "spring",
                stiffness: 280,
                damping: 18,
                delay: 0.15,
              }}
              className="max-w-full text-balance text-center font-display text-[clamp(1.9rem,10vw,3.5rem)] font-black leading-[1.02] tracking-tight"
              style={{ color, overflowWrap: "anywhere" }}
            >
              {title}
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="font-display text-[clamp(2rem,11vw,3.5rem)] font-black leading-none text-primary"
              style={{
                textShadow:
                  "0 0 44px color-mix(in oklab, var(--primary) 45%, transparent)",
              }}
            >
              <CountUp to={champ.score} duration={900} /> {mn.common.points}
            </motion.p>
          </div>

          <div className="flex w-full min-h-0 flex-col pt-2 lg:stage-divide lg:bg-bg-2/40 lg:px-9 lg:py-10 lg:pt-10">
            <p className="mb-2 text-center text-sm font-bold uppercase tracking-widest text-ink-3 lg:eyebrow-rule lg:mb-3 lg:text-xs">
              {mn.winner.board}
            </p>
            <ol className="flex flex-col gap-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:no-scrollbar">
              {rows.map((row, i) => (
                <LeaderRow key={row.player.id} row={row} index={i} final />
              ))}
            </ol>

            <div className="mt-5 hidden shrink-0 flex-col gap-2.5 border-t border-line/45 pt-5 lg:flex">
              {rematchStatus && (
                <p role="status" className="text-center text-sm font-semibold text-ink-3">
                  {rematchStatus}
                </p>
              )}
              <GameButton
                onClick={() => void playAgain()}
                disabled={busy || lobby?.selfRematchReady}
                icon={<RotateCcw className="size-6" strokeWidth={2.8} />}
              >
                {mn.winner.again}
              </GameButton>
              <GameButton
                variant="ghost"
                size="md"
                onClick={() => void newGame()}
                disabled={busy}
                icon={<Users className="size-5" strokeWidth={2.6} />}
              >
                {mn.winner.newGame}
              </GameButton>
            </div>
          </div>
        </div>
      </ScreenBody>

      <ScreenFooter className="lg:hidden">
        <div className="flex flex-col gap-2.5">
          {errorCode && (
            <p
              role="alert"
              className="text-center text-sm font-bold text-danger"
            >
              Шинэ тоглолт үүсгэж чадсангүй. Дахин оролдоно уу.
            </p>
          )}
          {rematchStatus && (
            <p role="status" className="text-center text-sm font-semibold text-ink-3">
              {rematchStatus}
            </p>
          )}
          <GameButton
            onClick={() => void playAgain()}
            disabled={busy || lobby?.selfRematchReady}
            icon={<RotateCcw className="size-6" strokeWidth={2.8} />}
          >
            {mn.winner.again}
          </GameButton>
          <GameButton
            variant="ghost"
            size="md"
            onClick={() => void newGame()}
            disabled={busy}
            icon={<Users className="size-5" strokeWidth={2.6} />}
          >
            {mn.winner.newGame}
          </GameButton>
        </div>
      </ScreenFooter>
    </Screen>
  );
}

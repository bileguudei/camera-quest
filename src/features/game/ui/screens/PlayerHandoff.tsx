"use client";

import { Hand } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { GameButton } from "@/features/game/ui/components/GameButton";
import { GameHeader } from "@/features/game/ui/components/GameHeader";
import { PlayerAvatar } from "@/features/game/ui/components/PlayerAvatar";
import { RoundBadge } from "@/features/game/ui/components/RoundBadge";
import { Screen, ScreenFooter } from "@/features/game/ui/components/Screen";
import { SpectatorStage } from "@/features/game/ui/components/SpectatorStage";
import { mn } from "@/content/mn";
import { useGame } from "@/features/game/application/useGame";
import { PLAYER_COLOR_HEX } from "@/features/game/domain/config";
import { formatSeconds } from "@/features/game/domain/scoring";
import { handoffErrorMessage } from "@/features/game/domain/errorMessages";
import { useExpiredTurnRecovery } from "@/features/game/application/useExpiredTurnRecovery";

/** The shared deadline ticks for watchers too, so the tension is the same. */
function useDeadlineLabel(deadlineAt: string | null): string | null {
  // The clock is derived from a ticking `now`, not stored: that keeps the first
  // paint correct and leaves no state to synchronize when the turn changes.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!deadlineAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [deadlineAt]);

  if (!deadlineAt) return null;
  return formatSeconds(Math.max(0, Date.parse(deadlineAt) - now));
}

export function PlayerHandoff() {
  const players = useGame((state) => state.players);
  const player = useGame((state) => state.currentPlayer());
  const round = useGame((state) => state.currentRound());
  const roundIndex = useGame((state) => state.roundIndex);
  const ready = useGame((state) => state.readyForTurn);
  const errorCode = useGame((state) => state.errorCode);
  const isMyTurn = useGame((state) => state.isMyTurn);
  const lobby = useGame((state) => state.lobby);
  const recoverExpiredTurn = useGame((state) => state.recoverExpiredTurn);

  const turnInFlight =
    lobby?.lastTurn?.status === "active" && lobby.lastTurn.seat === lobby.currentSeat;
  const remaining = useDeadlineLabel(turnInFlight ? (lobby?.lastTurn?.deadlineAt ?? null) : null);
  const spectating = !isMyTurn;

  useExpiredTurnRecovery({
    enabled: spectating && turnInFlight,
    turnId: turnInFlight ? (lobby?.lastTurn?.turnId ?? null) : null,
    deadlineAt: turnInFlight ? (lobby?.lastTurn?.deadlineAt ?? null) : null,
    recover: recoverExpiredTurn,
  });

  if (!player) return null;
  // At an online table only the seat the server points at opens a camera; the
  // other phones watch this screen until the pointer moves.
  const activePrompt = turnInFlight ? (lobby?.lastTurn?.prompt ?? null) : null;
  const color = PLAYER_COLOR_HEX[player.color];

  if (spectating && lobby) {
    return (
      <Screen className="gap-2.5 sm:gap-3">
        <GameHeader
          round={roundIndex + 1}
          difficulty={round.difficulty}
          players={players}
          activeId={player.id}
        />

        {/* One column on a phone, stage plus side panel from large screens up. */}
        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-5">
          <SpectatorStage
            lobby={lobby}
            player={player}
            prompt={activePrompt}
            remainingLabel={remaining}
            className="h-full"
          />

          <aside className="hidden min-h-0 flex-col gap-3 overflow-y-auto no-scrollbar lg:flex">
            <div className="flex items-center gap-3 rounded-g3 border border-line bg-surface/70 p-3">
              <PlayerAvatar player={player} size="md" active />
              <div className="min-w-0">
                <p className="truncate font-display text-xl font-black" style={{ color }}>
                  {player.name}
                </p>
                <p className="text-sm text-ink-3">{mn.online.searching}</p>
              </div>
            </div>

            {activePrompt && (
              <div className="rounded-g3 border border-line bg-surface/70 p-4">
                <p className="text-xs font-bold uppercase tracking-widest text-ink-3">
                  {mn.play.target}
                </p>
                <p className="mt-1 font-display text-2xl font-black leading-tight text-ink">
                  {activePrompt}
                </p>
              </div>
            )}

            {remaining && (
              <div className="rounded-g3 border border-line bg-surface/70 p-4 text-center">
                <p className="text-xs font-bold uppercase tracking-widest text-ink-3">
                  {mn.online.timeLeft}
                </p>
                <p className="font-display text-4xl font-black tabular-nums text-ink">
                  {remaining}
                </p>
              </div>
            )}

            <p className="mt-auto text-sm leading-relaxed text-ink-3">
              {mn.online.spectatingHint}
            </p>
          </aside>
        </div>

        <p className="shrink-0 text-center text-sm text-ink-3 lg:hidden">
          {mn.online.spectatingHint}
        </p>

        {errorCode && (
          <p
            role="alert"
            className="shrink-0 rounded-full bg-warn/15 px-4 py-2 text-center text-sm font-bold text-warn"
          >
            {handoffErrorMessage(errorCode)}
          </p>
        )}
      </Screen>
    );
  }

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
        <p className="text-base text-ink-3 sm:text-lg">
          {lobby ? mn.online.yourTurn : mn.turn.handOver}
        </p>
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

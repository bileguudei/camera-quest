"use client";

import { ArrowRight, Check, Clock, Flame, Trophy } from "lucide-react";
import type { ReactNode } from "react";
import { motion } from "motion/react";
import { useState } from "react";
import { GameButton } from "@/features/game/ui/components/GameButton";
import { GameCard } from "@/features/game/ui/components/GameCard";
import { PlayerAvatar } from "@/features/game/ui/components/PlayerAvatar";
import { PlayerStrip } from "@/features/game/ui/components/PlayerStrip";
import { RoundBadge } from "@/features/game/ui/components/RoundBadge";
import { CountUp } from "@/features/game/ui/components/ScorePopup";
import {
  Screen,
  ScreenBody,
  ScreenFooter,
} from "@/features/game/ui/components/Screen";
import { mn } from "@/content/mn";
import { PLAYER_COLOR_HEX } from "@/features/game/domain/config";
import { formatSeconds } from "@/features/game/domain/scoring";
import { useGame } from "@/features/game/application/useGame";
import { achievementName } from "@/features/progression/achievementPresentation";

export function TurnResult() {
  const outcome = useGame((s) => s.lastOutcome);
  const players = useGame((s) => s.players);
  const round = useGame((s) => s.currentRound());
  const roundIndex = useGame((s) => s.roundIndex);
  const isLastTurn = useGame((s) => s.isLastTurnOfRound());
  const isLastRound = useGame((s) => s.isLastRound());
  const advanceTurn = useGame((s) => s.advanceTurn);
  const submitTurnFeedback = useGame((s) => s.submitTurnFeedback);
  const [feedbackState, setFeedbackState] = useState<
    "idle" | "pending" | "sent" | "error"
  >("idle");

  if (!outcome) return null;

  const success = outcome.success;
  const color = PLAYER_COLOR_HEX[outcome.playerColor];
  const accent = success ? "var(--primary)" : "var(--warn)";
  const player = players.find((p) => p.id === outcome.playerId);

  const ctaLabel = !isLastTurn
    ? mn.success.next
    : isLastRound
      ? mn.success.finish
      : mn.success.nextRound;

  return (
    <Screen className="justify-between">
      <header className="flex shrink-0 justify-center pb-3">
        <RoundBadge round={roundIndex + 1} difficulty={round.difficulty} />
      </header>

      <ScreenBody className="flex flex-col justify-center lg:overflow-visible">
        {/* One vertical narrative, so it stays a single column — it just stops
            being a 448px sliver adrift on a 1440px screen. */}
        <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 py-2 lg:max-h-full lg:max-w-[640px] lg:stage-card lg:gap-4 lg:overflow-y-auto lg:no-scrollbar lg:px-12 lg:py-8">
          {/* Verdict */}
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 17 }}
            className="flex flex-col items-center gap-2"
          >
            <span
              className="grid size-16 place-items-center rounded-full sm:size-20"
              style={{
                backgroundColor: `color-mix(in oklab, ${accent} 22%, var(--surface))`,
                color: accent,
                boxShadow: `0 0 44px -10px ${accent}`,
              }}
            >
              {success ? (
                <Check className="size-9 sm:size-11" strokeWidth={4} />
              ) : (
                <Clock className="size-9 sm:size-11" strokeWidth={3} />
              )}
            </span>

            <h1
              className="font-display text-[clamp(1.6rem,8vw,2.75rem)] font-black leading-none tracking-tight"
              style={{ color: accent }}
            >
              {success ? mn.success.label : mn.fail.label}
            </h1>
          </motion.div>

          {/* Who / what */}
          <GameCard glow={color} className="w-full p-4 sm:p-5">
            <div className="flex items-center gap-3">
              {player && <PlayerAvatar player={player} size="md" active />}
              <div className="min-w-0 flex-1">
                <p
                  className="font-display text-xl font-black leading-tight text-clip-1 sm:text-2xl"
                  style={{ color }}
                >
                  {outcome.playerName}
                </p>
                <p className="text-sm text-ink-3 text-clip-1">
                  {outcome.challengePrompt}
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <Stat
                label={
                  success
                    ? mn.success.seconds(formatSeconds(outcome.timeMs))
                    : "—"
                }
                value={success ? formatSeconds(outcome.timeMs) : "—"}
                unit={success ? "сек" : ""}
              />
              <Stat
                label={mn.common.points}
                value={success ? `+${outcome.points}` : "+0"}
                unit={mn.common.points}
                highlight={success}
              />
            </div>

            <div className="mt-3 flex items-baseline justify-between rounded-g2 bg-surface-2/60 px-3.5 py-2.5">
              <span className="text-sm font-semibold text-ink-3">
                {mn.success.total}
              </span>
              <span className="font-display text-2xl font-black text-ink sm:text-3xl">
                <CountUp to={outcome.totalAfter} />
              </span>
            </div>

            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <ProgressStat
                label="XP"
                value={success ? `+${outcome.xp}` : "+0"}
              />
              <ProgressStat label="Түвшин" value={String(outcome.level)} />
              <ProgressStat
                label="Streak"
                value={String(outcome.streak)}
                icon={<Flame className="size-4 text-warn" strokeWidth={2.6} />}
              />
            </div>

            {outcome.unlockedAchievementIds.length > 0 && (
              <div className="mt-3 rounded-g2 border border-primary/25 bg-primary/8 p-3">
                <p className="text-xs font-black uppercase tracking-wider text-primary">
                  Achievement нээгдлээ
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {outcome.unlockedAchievementIds.map((id) => (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-bold text-primary"
                    >
                      <Trophy className="size-3.5" strokeWidth={2.6} />
                      {achievementName(id)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </GameCard>

          {!success && (
            <p className="text-center text-sm text-ink-3">
              {mn.fail.encourage}
            </p>
          )}

          <button
            type="button"
            disabled={feedbackState === "pending" || feedbackState === "sent"}
            onClick={() => {
              setFeedbackState("pending");
              void submitTurnFeedback(
                outcome.turnId,
                success ? "false_positive" : "missed_target",
              )
                .then(() => setFeedbackState("sent"))
                .catch(() => setFeedbackState("error"));
            }}
            className="text-xs font-semibold text-ink-3 underline decoration-line underline-offset-4 disabled:no-underline"
          >
            {feedbackState === "sent"
              ? "Баярлалаа — зөвхөн feedback хадгаллаа"
              : feedbackState === "error"
                ? "Feedback илгээж чадсангүй — дахин оролдох"
                : "AI буруу танив уу?"}
          </button>

          <PlayerStrip
            players={players}
            activeId={outcome.playerId}
            className="mt-1"
          />

          {/* The action rides inside the card on desktop; a floating footer
              button landed on top of the card's own bottom edge. */}
          <div className="mt-1 hidden w-full lg:block">
            <GameButton
              onClick={advanceTurn}
              iconRight={<ArrowRight className="size-6" strokeWidth={2.8} />}
            >
              {ctaLabel}
            </GameButton>
          </div>
        </div>
      </ScreenBody>

      <ScreenFooter className="lg:hidden">
        <GameButton
          onClick={advanceTurn}
          iconRight={<ArrowRight className="size-6" strokeWidth={2.8} />}
        >
          {ctaLabel}
        </GameButton>
      </ScreenFooter>
    </Screen>
  );
}

function ProgressStat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-g2 bg-surface-2/50 px-1 py-2">
      <p className="flex items-center justify-center gap-1 font-display text-base font-black text-ink sm:text-lg">
        {icon}
        {value}
      </p>
      <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-ink-3">
        {label}
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  highlight = false,
}: {
  label: string;
  value: string;
  unit: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={[
        "flex flex-col items-center gap-0.5 rounded-g2 px-2 py-3",
        highlight ? "bg-primary/12" : "bg-surface-2/50",
      ].join(" ")}
    >
      <span
        className={[
          "font-display text-2xl font-black leading-none tabular-nums sm:text-3xl",
          highlight ? "text-primary" : "text-ink",
        ].join(" ")}
      >
        {value}
      </span>
      <span className="truncate text-xs font-semibold text-ink-3">
        {unit || label}
      </span>
    </div>
  );
}

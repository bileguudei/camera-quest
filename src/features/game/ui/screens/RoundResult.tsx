"use client";

import { ArrowRight, ChevronDown, ChevronUp, Minus } from "lucide-react";
import { motion } from "motion/react";
import { GameButton } from "@/features/game/ui/components/GameButton";
import { PlayerAvatar } from "@/features/game/ui/components/PlayerAvatar";
import { GameProgress } from "@/features/game/ui/components/RoundBadge";
import { Screen, ScreenBody, ScreenFooter } from "@/features/game/ui/components/Screen";
import { mn } from "@/content/mn";
import { PLAYER_COLOR_HEX } from "@/features/game/domain/config";
import { rankWithMovement } from "@/features/game/domain/scoring";
import { useGame } from "@/features/game/application/useGame";
import type { RankRow } from "@/features/game/domain/types";

export function RoundResult() {
  const players = useGame((s) => s.players);
  const snapshot = useGame((s) => s.roundSnapshot);
  const roundIndex = useGame((s) => s.roundIndex);
  const isLastRound = useGame((s) => s.isLastRound());
  const nextRound = useGame((s) => s.nextRound);
  const busy = useGame((s) => s.busy);
  const errorCode = useGame((s) => s.errorCode);

  const rows = rankWithMovement(players, snapshot);

  return (
    <Screen className="justify-between">
      <header className="flex shrink-0 flex-col items-center gap-2 pb-4">
        <GameProgress round={roundIndex + 1} />
        <h1 className="text-center font-display text-[clamp(1.6rem,8vw,2.5rem)] font-black leading-none tracking-tight text-ink">
          {mn.roundResult.title(roundIndex + 1)}
        </h1>
        <p className="text-sm font-semibold uppercase tracking-widest text-ink-3">
          {mn.roundResult.sub}
        </p>
      </header>

      <ScreenBody className="flex flex-col">
        <ol className="m-auto flex w-full max-w-md flex-col gap-2 py-2">
          {rows.map((row, i) => (
            <LeaderRow key={row.player.id} row={row} index={i} />
          ))}
        </ol>
      </ScreenBody>

      <ScreenFooter>
        {errorCode && (
          <p role="alert" className="mb-2 text-center text-sm font-bold text-danger">
            Тоглолтын дүнг баталгаажуулж чадсангүй. Дахин оролдоно уу.
          </p>
        )}
        <GameButton
          onClick={nextRound}
          disabled={busy}
          iconRight={<ArrowRight className="size-6" strokeWidth={2.8} />}
        >
          {isLastRound ? mn.roundResult.finish : mn.roundResult.next}
        </GameButton>
      </ScreenFooter>
    </Screen>
  );
}

export function LeaderRow({
  row,
  index,
  final = false,
}: {
  row: RankRow;
  index: number;
  final?: boolean;
}) {
  const { player, rank, delta, gained } = row;
  const color = PLAYER_COLOR_HEX[player.color];
  const medals = ["🥇", "🥈", "🥉"];
  const leading = rank === 1;

  return (
    <motion.li
      layout
      initial={{ opacity: 0, x: -18 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.07, type: "spring", stiffness: 300, damping: 26 }}
      className={[
        "flex items-center gap-2.5 rounded-g3 border p-2.5",
        leading
          ? "border-gold/45 bg-gold/8"
          : "border-line/70 bg-surface/65",
      ].join(" ")}
    >
      <span className="grid w-8 shrink-0 place-items-center font-display text-lg font-black text-ink-2">
        {final && rank <= 3 ? (
          <span aria-hidden className="text-2xl">
            {medals[rank - 1]}
          </span>
        ) : (
          rank
        )}
      </span>

      <PlayerAvatar player={player} size="sm" active={leading} />

      <div className="min-w-0 flex-1">
        <p
          className="font-display text-base font-black leading-tight text-clip-1 sm:text-lg"
          style={{ color }}
        >
          {player.name}
        </p>
        {gained > 0 && !final && (
          <p className="text-xs font-bold text-primary">+{gained}</p>
        )}
      </div>

      <Movement delta={delta} hidden={final} />

      <span className="shrink-0 font-display text-xl font-black tabular-nums text-ink sm:text-2xl">
        {player.score}
      </span>
    </motion.li>
  );
}

function Movement({ delta, hidden }: { delta: number; hidden?: boolean }) {
  if (hidden) return null;

  if (delta === 0) {
    return (
      <span className="flex w-9 shrink-0 items-center justify-center text-ink-3" aria-label="байр өөрчлөгдөөгүй">
        <Minus className="size-4" strokeWidth={3} />
      </span>
    );
  }

  const up = delta > 0;
  return (
    <span
      className={[
        "flex w-9 shrink-0 items-center justify-center gap-0.5 text-xs font-black tabular-nums",
        up ? "text-success" : "text-danger",
      ].join(" ")}
      aria-label={up ? `${delta} байр дээшилсэн` : `${-delta} байр буурсан`}
    >
      {up ? (
        <ChevronUp className="size-4" strokeWidth={3.5} />
      ) : (
        <ChevronDown className="size-4" strokeWidth={3.5} />
      )}
      {Math.abs(delta)}
    </span>
  );
}

"use client";

import { Countdown } from "@/features/game/ui/components/Countdown";
import { Screen } from "@/features/game/ui/components/Screen";
import { useGame } from "@/features/game/application/useGame";
import { PLAYER_COLOR_HEX } from "@/features/game/domain/config";

export function CountdownStart() {
  const player = useGame((state) => state.currentPlayer());
  const challenge = useGame((state) => state.challenge);
  const startPlay = useGame((state) => state.startPlay);
  if (!player || !challenge) return null;

  return (
    <Screen className="items-center justify-center text-center">
      <p className="font-display text-xl font-extrabold text-ink-2 sm:text-2xl">Бэлэн үү?</p>
      <Countdown onDone={() => void startPlay()} color={PLAYER_COLOR_HEX[player.color]} />
      <p className="max-w-[26ch] text-sm text-ink-3">{challenge.prompt}</p>
    </Screen>
  );
}

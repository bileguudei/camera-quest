"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Countdown } from "@/features/game/ui/components/Countdown";
import { Screen } from "@/features/game/ui/components/Screen";
import { useGame } from "@/features/game/application/useGame";
import { getGameRepository } from "@/features/game/infrastructure/createGameRepository";
import { warmVisionService } from "@/features/vision/visionClient";
import { PLAYER_COLOR_HEX } from "@/features/game/domain/config";
import { mn } from "@/content/mn";

/** How long a silent wait may run before the cold start is explained. */
export const COLD_START_HINT_MS = 1_500;
/** A stalled warm-up must never strand the player on the countdown screen. */
export const WARMUP_WAIT_LIMIT_MS = 20_000;

const waitAtMost = (request: Promise<void>, limit: number) =>
  new Promise<void>((resolve) => {
    const timer = window.setTimeout(resolve, limit);
    void request.finally(() => {
      window.clearTimeout(timer);
      resolve();
    });
  });

export function CountdownStart() {
  const player = useGame((state) => state.currentPlayer());
  const challenge = useGame((state) => state.challenge);
  const startPlay = useGame((state) => state.startPlay);
  const backendMode = useGame((state) => state.backendMode);
  const demo = useGame((state) => state.cameraMode === "demo");
  const [waking, setWaking] = useState(false);
  const warmup = useRef<Promise<void> | null>(null);

  // Warming while 3–2–1 plays keeps a GPU cold start outside the turn: the
  // server deadline starts at activate-turn, so a container that boots after
  // it silently eats up to 15 seconds of this player's 30.
  useEffect(() => {
    if (demo || backendMode !== "supabase") return;
    warmup.current = getGameRepository()
      .getAccessToken()
      .then((token) => warmVisionService(token))
      // A failed warm-up must not block the turn; the stream retries on its own
      // and falls back to the HTTP validate endpoint.
      .catch(() => undefined);
    return () => {
      warmup.current = null;
    };
  }, [backendMode, demo]);

  const begin = useCallback(async () => {
    const pending = warmup.current;
    if (pending) {
      const hint = window.setTimeout(() => setWaking(true), COLD_START_HINT_MS);
      await waitAtMost(pending, WARMUP_WAIT_LIMIT_MS);
      window.clearTimeout(hint);
      setWaking(false);
    }
    await startPlay();
  }, [startPlay]);

  if (!player || !challenge) return null;

  return (
    <Screen className="items-center justify-center text-center">
      <p className="font-display text-xl font-extrabold text-ink-2 sm:text-2xl">Бэлэн үү?</p>
      <Countdown onDone={() => void begin()} color={PLAYER_COLOR_HEX[player.color]} />
      <p className="max-w-[26ch] text-sm text-ink-3">{challenge.prompt}</p>
      {waking ? (
        <p role="status" className="max-w-[30ch] text-sm font-bold text-warn">
          {mn.turn.waking}
        </p>
      ) : null}
    </Screen>
  );
}

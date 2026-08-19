"use client";

import { AnimatePresence } from "motion/react";
import { DevPanel } from "camera-quest-dev-panel";
import { Calibrating } from "@/features/game/ui/screens/Calibrating";
import { CameraCheck } from "@/features/game/ui/screens/CameraCheck";
import { CountdownStart } from "@/features/game/ui/screens/CountdownStart";
import { Landing } from "@/features/game/ui/screens/Landing";
import { Lobby } from "@/features/game/ui/screens/Lobby";
import { OnlineStart } from "@/features/game/ui/screens/OnlineStart";
import { Play } from "@/features/game/ui/screens/Play";
import { RoundIntro } from "@/features/game/ui/screens/RoundIntro";
import { RoundResult } from "@/features/game/ui/screens/RoundResult";
import { Setup } from "@/features/game/ui/screens/Setup";
import { PlayerHandoff } from "@/features/game/ui/screens/PlayerHandoff";
import { QuestReveal } from "@/features/game/ui/screens/QuestReveal";
import { TurnResult } from "@/features/game/ui/screens/TurnResult";
import { Winner } from "@/features/game/ui/screens/Winner";
import { useGame } from "@/features/game/application/useGame";
import type { Phase } from "@/features/game/domain/types";
import { CameraProvider } from "@/features/camera/CameraProvider";
import { GameProvider } from "@/features/game/application/GameProvider";
import { useLobbySync } from "@/features/game/application/useLobbySync";

const SCREENS: Record<Phase, () => React.JSX.Element | null> = {
  landing: Landing,
  onlineStart: OnlineStart,
  lobby: Lobby,
  setup: Setup,
  cameraCheck: CameraCheck,
  roundIntro: RoundIntro,
  playerHandoff: PlayerHandoff,
  calibrating: Calibrating,
  questReveal: QuestReveal,
  countdown: CountdownStart,
  playing: Play,
  turnResult: TurnResult,
  roundResult: RoundResult,
  winner: Winner,
};

/**
 * Feature-level mount point for the game. One screen is on stage at a time and
 * AnimatePresence handles the cross-fade between them.
 */
function GameRuntime() {
  const phase = useGame((s) => s.phase);
  useLobbySync();
  const Current = SCREENS[phase];

  return (
    <CameraProvider>
      <main className="relative h-[100dvh] w-full overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          {/* The key is what drives the screen transition. */}
          <Current key={phase} />
        </AnimatePresence>
      </main>

      {/* Play renders its own panel with success/timeout shortcuts. */}
      {phase !== "playing" && <DevPanel />}
    </CameraProvider>
  );
}

export function GameShell() {
  return (
    <GameProvider>
      <GameRuntime />
    </GameProvider>
  );
}

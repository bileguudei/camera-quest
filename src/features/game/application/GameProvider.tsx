"use client";

import { createActorContext } from "@xstate/react";
import type { ReactNode } from "react";
import { gameMachine } from "./gameMachine";
import { useGameSounds } from "./useGameSounds";

export const GameActorContext = createActorContext(gameMachine);

function GameSoundEffects() {
  useGameSounds();
  return null;
}

export function GameProvider({ children }: { children: ReactNode }) {
  return (
    <GameActorContext.Provider>
      <GameSoundEffects />
      {children}
    </GameActorContext.Provider>
  );
}
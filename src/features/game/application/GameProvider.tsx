"use client";

import { createActorContext } from "@xstate/react";
import type { ReactNode } from "react";
import { gameMachine } from "./gameMachine";

export const GameActorContext = createActorContext(gameMachine);

export function GameProvider({ children }: { children: ReactNode }) {
  return <GameActorContext.Provider>{children}</GameActorContext.Provider>;
}

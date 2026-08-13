"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useGame } from "@/features/game/application/useGame";
import type { Phase } from "@/features/game/domain/types";
import { useCamera, type CameraHandle } from "./useCamera";

const CAMERA_PHASES: Phase[] = [
  "cameraCheck",
  "roundIntro",
  "playerHandoff",
  "calibrating",
  "questReveal",
  "countdown",
  "playing",
  "turnResult",
  "roundResult",
];

const CameraContext = createContext<CameraHandle | null>(null);

export function CameraProvider({ children }: { children: ReactNode }) {
  const phase = useGame((state) => state.phase);
  const facing = useGame((state) => state.cameraFacing);
  const camera = useCamera(CAMERA_PHASES.includes(phase), facing);
  return <CameraContext.Provider value={camera}>{children}</CameraContext.Provider>;
}

export function useCameraContext(): CameraHandle {
  const context = useContext(CameraContext);
  if (!context) throw new Error("useCameraContext must be inside CameraProvider");
  return context;
}

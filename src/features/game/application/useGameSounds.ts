"use client";

import { useEffect, useRef } from "react";
import { GameActorContext } from "./GameProvider";

const files = {
  success: "/sounds/success.mp3",
  fail: "/sounds/fail.mp3",
  menu: "/sounds/menu.mp3",
} as const;

type SoundKey = keyof typeof files;
const cache: Partial<Record<SoundKey, HTMLAudioElement>> = {};

export function playSound(key: SoundKey) {
  if (typeof window === "undefined") return;
  let audio = cache[key];
  if (!audio) {
    audio = new Audio(files[key]);
    cache[key] = audio;
  }
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

export function useGameSounds() {
  const lastOutcome = GameActorContext.useSelector((s) => s.context.lastOutcome);

  const playedTurnId = useRef<string | null>(null);

  useEffect(() => {
    if (lastOutcome && lastOutcome.turnId !== playedTurnId.current) {
      playedTurnId.current = lastOutcome.turnId;
      playSound(lastOutcome.success ? "success" : "fail");
    }
  }, [lastOutcome]);
}
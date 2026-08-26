"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type MimicAudioCue = "success" | "combo" | "miss" | "victory";

const STORAGE_KEY = "camera-quest:mimic-audio-muted:v1";

const storedMuted = () => {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

type WebkitWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

const audioContextConstructor = () => {
  if (typeof window === "undefined") return null;
  return window.AudioContext ?? (window as WebkitWindow).webkitAudioContext ?? null;
};

const CUES: Record<
  MimicAudioCue,
  readonly { frequency: number; offset: number; duration: number; type: OscillatorType }[]
> = {
  success: [
    { frequency: 523.25, offset: 0, duration: 0.16, type: "sine" },
    { frequency: 659.25, offset: 0.055, duration: 0.18, type: "sine" },
    { frequency: 783.99, offset: 0.11, duration: 0.22, type: "triangle" },
  ],
  combo: [
    { frequency: 523.25, offset: 0, duration: 0.14, type: "triangle" },
    { frequency: 659.25, offset: 0.05, duration: 0.16, type: "triangle" },
    { frequency: 783.99, offset: 0.1, duration: 0.18, type: "triangle" },
    { frequency: 1046.5, offset: 0.17, duration: 0.3, type: "sine" },
  ],
  miss: [
    { frequency: 196, offset: 0, duration: 0.15, type: "triangle" },
    { frequency: 146.83, offset: 0.09, duration: 0.18, type: "sine" },
  ],
  victory: [
    { frequency: 392, offset: 0, duration: 0.18, type: "triangle" },
    { frequency: 523.25, offset: 0.09, duration: 0.18, type: "triangle" },
    { frequency: 659.25, offset: 0.18, duration: 0.2, type: "triangle" },
    { frequency: 783.99, offset: 0.28, duration: 0.22, type: "sine" },
    { frequency: 1046.5, offset: 0.42, duration: 0.5, type: "sine" },
  ],
};

export function useMimicAudio() {
  const contextRef = useRef<AudioContext | null>(null);
  const [muted, setMutedState] = useState(storedMuted);
  const mutedRef = useRef(muted);

  useEffect(() => {
    return () => {
      const context = contextRef.current;
      contextRef.current = null;
      if (context && context.state !== "closed") void context.close();
    };
  }, []);

  const getContext = useCallback(() => {
    if (contextRef.current) return contextRef.current;
    const Context = audioContextConstructor();
    if (!Context) return null;
    try {
      const context = new Context();
      contextRef.current = context;
      return context;
    } catch {
      return null;
    }
  }, []);

  const prepare = useCallback(() => {
    if (mutedRef.current) return;
    const context = getContext();
    if (context?.state === "suspended") void context.resume();
  }, [getContext]);

  const play = useCallback(
    (cue: MimicAudioCue) => {
      if (mutedRef.current) return;
      const context = getContext();
      if (!context) return;
      if (context.state === "suspended") void context.resume();

      try {
        const start = context.currentTime + 0.01;
        for (const tone of CUES[cue]) {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          const toneStart = start + tone.offset;
          const toneEnd = toneStart + tone.duration;
          oscillator.type = tone.type;
          oscillator.frequency.setValueAtTime(tone.frequency, toneStart);
          gain.gain.setValueAtTime(0.0001, toneStart);
          gain.gain.exponentialRampToValueAtTime(
            cue === "miss" ? 0.08 : 0.12,
            toneStart + 0.02,
          );
          gain.gain.exponentialRampToValueAtTime(0.0001, toneEnd);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start(toneStart);
          oscillator.stop(toneEnd + 0.02);
        }
      } catch {
        // Audio is a progressive enhancement; scoring must never depend on it.
      }
    },
    [getContext],
  );

  const setMuted = useCallback((nextMuted: boolean) => {
    mutedRef.current = nextMuted;
    setMutedState(nextMuted);
    try {
      window.localStorage.setItem(STORAGE_KEY, nextMuted ? "1" : "0");
    } catch {
      // Private browsing can disable storage. Keep the in-memory preference.
    }
    if (!nextMuted && contextRef.current?.state === "suspended") {
      void contextRef.current.resume();
    }
  }, []);

  return { muted, setMuted, prepare, play };
}

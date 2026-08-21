"use client";

import { mn } from "@/content/mn";
import { useGame } from "@/features/game/application/useGame";
import type { GameEnvironment } from "@/features/game/domain/types";
import { EnvironmentIcon } from "./SeatMark";

const ORDER: GameEnvironment[] = ["school", "home", "outdoor"];

/**
 * The host picks the room before the game exists, because the server draws
 * every quest of that game from it — a kitchen object must never be asked for
 * in a schoolyard.
 */
export function EnvironmentPicker({ className = "" }: { className?: string }) {
  const environment = useGame((state) => state.environment);
  const setEnvironment = useGame((state) => state.setEnvironment);

  return (
    <div className={className}>
      <p className="mb-2 text-sm font-bold uppercase tracking-wider text-ink-3">
        {mn.environment.label}
      </p>

      <div role="radiogroup" aria-label={mn.environment.label} className="grid grid-cols-3 gap-2">
        {ORDER.map((key) => {
          const option = mn.environment.options[key];
          const selected = key === environment;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setEnvironment(key)}
              className={[
                "flex flex-col items-center gap-1 rounded-g3 border px-2 py-3 text-center transition",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                selected
                  ? "border-primary bg-primary/12 text-ink"
                  : "border-line bg-surface/60 text-ink-2 hover:border-line/80",
              ].join(" ")}
            >
              <EnvironmentIcon environment={key} className="size-6" />
              <span className="font-display text-sm font-black leading-tight">{option.label}</span>
              <span className="text-[0.7rem] leading-tight text-ink-3">{option.hint}</span>
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-xs leading-relaxed text-ink-3">{mn.environment.hint}</p>
    </div>
  );
}

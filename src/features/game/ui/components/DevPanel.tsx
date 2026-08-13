"use client";

import { FlaskConical, SkipForward, Timer, Trophy, X } from "lucide-react";
import { useState } from "react";
import { useGame } from "@/features/game/application/useGame";
import { publicEnv } from "@/shared/env/publicEnv";

interface DevPanelProps {
  onSuccess?: () => void;
  onTimeout?: () => void;
}

const isDev =
  process.env.NODE_ENV === "development" && publicEnv.devControlsEnabled;

/**
 * Development-only shortcuts so the whole flow can be exercised without a real
 * detector. Tree-shaken out of production builds by the `isDev` guard.
 */
export function DevPanel({ onSuccess, onTimeout }: DevPanelProps) {
  const [open, setOpen] = useState(false);
  const advanceTurn = useGame((s) => s.advanceTurn);
  const players = useGame((s) => s.players);
  const goTo = useGame((s) => s.goTo);

  if (!isDev) return null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Dev tools"
        className="fixed left-0 top-1/2 z-[100] grid size-8 -translate-y-1/2 place-items-center rounded-r-full border border-l-0 border-white/15 bg-black/70 text-white/50 backdrop-blur"
      >
        <FlaskConical className="size-4" strokeWidth={2.4} />
      </button>
    );
  }

  return (
    <div className="fixed left-0 top-1/2 z-[100] flex w-24 -translate-y-1/2 flex-col items-stretch gap-1.5 rounded-r-g2 border border-l-0 border-white/15 bg-black/80 p-1.5 backdrop-blur">
      <span className="px-1 font-mono text-[10px] uppercase tracking-widest text-white/40">
        dev
      </span>

      {onSuccess && (
        <DevBtn onClick={onSuccess} icon={<Trophy className="size-3.5" />}>
          Success
        </DevBtn>
      )}
      {onTimeout && (
        <DevBtn onClick={onTimeout} icon={<Timer className="size-3.5" />}>
          Timeout
        </DevBtn>
      )}
      <DevBtn onClick={advanceTurn} icon={<SkipForward className="size-3.5" />}>
        Next ({players.length})
      </DevBtn>
      <DevBtn onClick={() => goTo("winner")}>Winner</DevBtn>

      <button
        onClick={() => setOpen(false)}
        aria-label="Close dev tools"
        className="grid size-6 place-items-center rounded text-white/50 hover:text-white"
      >
        <X className="size-3.5" strokeWidth={3} />
      </button>
    </div>
  );
}

function DevBtn({
  onClick,
  icon,
  children,
}: {
  onClick: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex min-h-7 items-center gap-1 rounded-md bg-white/10 px-2 font-mono text-[11px] text-white/85 transition hover:bg-white/20"
    >
      {icon}
      {children}
    </button>
  );
}

"use client";

type FrameState = "idle" | "locking" | "found" | "wrong";

const TONE: Record<FrameState, string> = {
  idle: "rgba(255,255,255,0.42)",
  locking: "var(--primary)",
  found: "var(--primary)",
  wrong: "var(--danger)",
};

/**
 * The edge-to-edge recognition frame makes the detector's full-camera scope
 * visible without obscuring the live playfield.
 */
export function TargetFrame({
  state = "idle",
  lock = 0,
  hint,
  /** Changing this replays the reject animation for a repeated mistake. */
  shakeKey,
}: {
  state?: FrameState;
  lock?: number;
  hint?: string;
  shakeKey?: number;
}) {
  const color = TONE[state];
  const hot = state !== "idle";
  const wrong = state === "wrong";

  return (
    // Centring lives on the outer layer; the shake owns the inner transform, so
    // the two never fight over `transform`.
    <div
      aria-hidden
      className="pointer-events-none absolute inset-3 z-10 sm:inset-4"
    >
      <div
        key={shakeKey}
        className={["relative size-full", wrong ? "anim-shake" : ""].join(" ")}
      >
      <div
        className="absolute inset-0 rounded-g4 transition-[box-shadow,background-color] duration-200"
        style={{
          boxShadow: hot
            ? `inset 0 0 0 ${wrong ? 3 : 2}px ${color}, 0 0 ${wrong ? 44 : 20 + lock * 40}px -6px ${color}`
            : "inset 0 0 0 2px rgba(255,255,255,0.16)",
          backgroundColor: hot
            ? `color-mix(in oklab, ${color} ${wrong ? 12 : Math.round(lock * 10)}%, transparent)`
            : undefined,
        }}
      />

      <Corner className="left-0 top-0 rounded-tl-g4 border-l-4 border-t-4" color={color} />
      <Corner className="right-0 top-0 rounded-tr-g4 border-r-4 border-t-4" color={color} />
      <Corner className="bottom-0 left-0 rounded-bl-g4 border-b-4 border-l-4" color={color} />
      <Corner className="bottom-0 right-0 rounded-br-g4 border-b-4 border-r-4" color={color} />

      </div>

      {hint && (
        <span
          className="absolute inset-x-10 bottom-28 truncate text-center text-xs font-bold text-ink-3 sm:bottom-32 sm:text-sm"
          style={{ opacity: hot ? 0 : 1, transition: "opacity 180ms" }}
        >
          {hint}
        </span>
      )}
    </div>
  );
}

function Corner({ className, color }: { className: string; color: string }) {
  return (
    <span
      className={["absolute size-8 transition-colors duration-200 sm:size-10", className].join(" ")}
      style={{ borderColor: color }}
    />
  );
}

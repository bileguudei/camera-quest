import type { CSSProperties } from "react";
import type { GameEnvironment } from "@/features/game/domain/types";

/**
 * Seat identity, drawn rather than typed. Emoji render differently on every
 * phone, cannot take a stroke weight or a colour, and get read aloud by screen
 * readers — so each seat gets its own mark from one camera grammar instead:
 * aperture, focus frame, shutter, lens, flash, viewfinder.
 *
 * Shape carries the identity as much as colour does: six player colours are
 * hard to tell apart on a 34px strip, and impossible for a colour-blind player.
 */
const SEAT_MARKS = [
  // 1 — aperture
  <>
    <path d="M12 2.6 20.4 7.3v9.4L12 21.4 3.6 16.7V7.3z" />
    <path d="M12 12V2.6" />
    <path d="M12 12l8.4 4.7" />
    <path d="M12 12 3.6 16.7" />
  </>,
  // 2 — focus frame
  <>
    <path d="M4 9V6.5A2.5 2.5 0 0 1 6.5 4H9" />
    <path d="M15 4h2.5A2.5 2.5 0 0 1 20 6.5V9" />
    <path d="M20 15v2.5a2.5 2.5 0 0 1-2.5 2.5H15" />
    <path d="M9 20H6.5A2.5 2.5 0 0 1 4 17.5V15" />
    <circle cx="12" cy="12" r="2.6" />
  </>,
  // 3 — shutter
  <>
    <circle cx="12" cy="12" r="8.6" />
    <path d="M12 3.4V12" />
    <path d="M19.4 16.3 12 12" />
    <path d="M4.6 16.3 12 12" />
  </>,
  // 4 — lens
  <>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="4.8" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
  </>,
  // 5 — flash
  <>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 2.8v3.4" />
    <path d="M12 17.8v3.4" />
    <path d="M2.8 12h3.4" />
    <path d="M17.8 12h3.4" />
    <path d="m5.5 5.5 2.4 2.4" />
    <path d="m16.1 16.1 2.4 2.4" />
    <path d="m18.5 5.5-2.4 2.4" />
    <path d="m7.9 16.1-2.4 2.4" />
  </>,
  // 6 — viewfinder
  <>
    <rect x="3.4" y="3.4" width="17.2" height="17.2" rx="5.2" />
    <path d="M12 7.2v2.6" />
    <path d="M12 14.2v2.6" />
    <path d="M7.2 12h2.6" />
    <path d="M14.2 12h2.6" />
  </>,
];

const FRAME = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.1,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** `seat` is 1-based and stable for the whole game. */
export function SeatMark({
  seat,
  className = "",
  style,
}: {
  seat: number;
  className?: string;
  style?: CSSProperties;
}) {
  const mark = SEAT_MARKS[(Math.max(1, seat) - 1) % SEAT_MARKS.length];
  return (
    <svg aria-hidden {...FRAME} className={className} style={style}>
      {mark}
    </svg>
  );
}

const ENVIRONMENT_MARKS: Record<GameEnvironment, React.JSX.Element> = {
  school: (
    <>
      <path d="M19 3H8a3 3 0 0 0-3 3v12" />
      <path d="M19 3v14H8a3 3 0 0 0-3 3" />
      <path d="M5 20a3 3 0 0 0 3 1h11" />
      <path d="M9 7h6" />
    </>
  ),
  home: (
    <>
      <path d="M3.2 10.6 12 3.2l8.8 7.4" />
      <path d="M5.4 9.4V19a1.6 1.6 0 0 0 1.6 1.6h10a1.6 1.6 0 0 0 1.6-1.6V9.4" />
      <path d="M9.6 20.6V15h4.8v5.6" />
    </>
  ),
  outdoor: (
    <>
      <path d="M12 2.8 7.4 10h2.8L6 16.6h12L13.8 10h2.8z" />
      <path d="M12 16.6v4.6" />
    </>
  ),
};

export function EnvironmentIcon({
  environment,
  className = "",
}: {
  environment: GameEnvironment;
  className?: string;
}) {
  return (
    <svg aria-hidden {...FRAME} className={className}>
      {ENVIRONMENT_MARKS[environment]}
    </svg>
  );
}

const PODIUM = ["var(--gold)", "var(--silver)", "var(--bronze)"];

/** Ranks 1–3 on the final board. Replaces 🥇🥈🥉 with the palette's own metals. */
export function RankMedal({
  rank,
  className = "",
}: {
  rank: number;
  className?: string;
}) {
  const color = PODIUM[rank - 1] ?? "var(--ink-3)";
  return (
    <span
      className={[
        "grid size-7 place-items-center rounded-full border font-display text-sm font-black tabular-nums",
        className,
      ].join(" ")}
      style={{
        color,
        borderColor: `color-mix(in oklab, ${color} 55%, transparent)`,
        backgroundColor: `color-mix(in oklab, ${color} 16%, transparent)`,
      }}
    >
      {rank}
    </span>
  );
}

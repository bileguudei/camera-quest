import type { CSSProperties } from "react";
import { PLAYER_COLOR_HEX } from "@/features/game/domain/config";
import type { Player } from "@/features/game/domain/types";
import { SeatMark } from "./SeatMark";

type Size = "xs" | "sm" | "md" | "lg" | "xl";

const SIZES: Record<Size, string> = {
  xs: "size-8 rounded-g1",
  sm: "size-11 rounded-g1",
  md: "size-14 rounded-g2",
  lg: "size-20 rounded-g3",
  xl: "size-28 rounded-g4 sm:size-32",
};

/** The mark sits at roughly half the tile, the way an app icon does. */
const MARK_SIZES: Record<Size, string> = {
  xs: "size-4",
  sm: "size-5",
  md: "size-7",
  lg: "size-10",
  xl: "size-14",
};

interface PlayerAvatarProps {
  player: Pick<Player, "seat" | "color" | "name">;
  size?: Size;
  active?: boolean;
  className?: string;
}

export function PlayerAvatar({
  player,
  size = "md",
  active = false,
  className = "",
}: PlayerAvatarProps) {
  const color = PLAYER_COLOR_HEX[player.color];

  return (
    <span
      aria-hidden
      style={
        {
          "--pc": color,
          color,
          backgroundColor: `color-mix(in oklab, ${color} 22%, var(--surface))`,
          borderColor: `color-mix(in oklab, ${color} 70%, transparent)`,
          boxShadow: active
            ? `0 0 0 3px color-mix(in oklab, ${color} 35%, transparent), 0 0 28px -4px ${color}`
            : undefined,
        } as CSSProperties
      }
      className={[
        "grid shrink-0 place-items-center border-2 leading-none",
        "transition-shadow duration-300",
        SIZES[size],
        className,
      ].join(" ")}
    >
      <SeatMark seat={player.seat} className={MARK_SIZES[size]} />
    </span>
  );
}

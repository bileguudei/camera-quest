import type { CSSProperties } from "react";
import { PLAYER_COLOR_HEX } from "@/features/game/domain/config";
import type { Player } from "@/features/game/domain/types";

type Size = "xs" | "sm" | "md" | "lg" | "xl";

const SIZES: Record<Size, string> = {
  xs: "size-8 text-base rounded-g1",
  sm: "size-11 text-xl rounded-g1",
  md: "size-14 text-2xl rounded-g2",
  lg: "size-20 text-4xl rounded-g3",
  xl: "size-28 text-6xl rounded-g4 sm:size-32",
};

interface PlayerAvatarProps {
  player: Pick<Player, "avatar" | "color" | "name">;
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
      {player.avatar}
    </span>
  );
}

import type { CSSProperties, ReactNode } from "react";

interface GameCardProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Colour used for the top hairline + glow. */
  glow?: string;
  as?: "div" | "section" | "li";
}

export function GameCard({
  children,
  className = "",
  style,
  glow,
  as: Tag = "div",
}: GameCardProps) {
  return (
    <Tag
      style={{ ...(glow ? ({ "--glow": glow } as CSSProperties) : null), ...style }}
      className={[
        "relative overflow-hidden rounded-g4 card-soft",
        glow ? "glow-ring" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {glow && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-6 top-0 h-px"
          style={{
            background: `linear-gradient(90deg, transparent, ${glow}, transparent)`,
          }}
        />
      )}
      {children}
    </Tag>
  );
}

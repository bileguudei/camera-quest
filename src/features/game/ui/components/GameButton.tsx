"use client";

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";

/**
 * Three variants, deliberately. `accent` duplicated primary's job and made it
 * unclear which action was the main one; `tint` painted a button in each
 * player's colour and turned a screen into a rainbow. Player colour now lives
 * on the seat mark, where it identifies someone instead of shouting.
 */
type Variant = "primary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface GameButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
}

const SIZES: Record<Size, string> = {
  // Every size clears the 44px touch minimum.
  sm: "min-h-11 px-4 text-base rounded-g2",
  md: "min-h-14 px-6 text-lg rounded-g3",
  lg: "min-h-16 px-7 text-xl sm:text-2xl rounded-g3",
};

const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary text-primary-ink btn-3d",
  danger: "bg-danger text-[#2b0710] btn-3d",
  ghost:
    "bg-surface-2/70 text-ink border border-line/80 hover:bg-surface-3/80 active:translate-y-[2px] transition",
};

const EDGES: Partial<Record<Variant, string>> = {
  primary: "var(--primary-deep)",
  danger: "var(--danger-deep)",
};

export function GameButton({
  variant = "primary",
  size = "lg",
  block = true,
  icon,
  iconRight,
  className = "",
  style,
  children,
  ...rest
}: GameButtonProps) {
  const custom: CSSProperties = {
    ...(EDGES[variant]
      ? ({ "--btn-edge": EDGES[variant] } as CSSProperties)
      : null),
    ...style,
  };

  return (
    <button
      {...rest}
      style={custom}
      className={[
        "relative inline-flex items-center justify-center gap-2.5",
        "font-display font-extrabold tracking-tight",
        "disabled:opacity-40 disabled:saturate-50 disabled:pointer-events-none",
        "select-none",
        SIZES[size],
        VARIANTS[variant],
        block ? "w-full" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {icon}
      <span className="text-clip-1 leading-tight">{children}</span>
      {iconRight}
    </button>
  );
}

/** Square icon-only button — used for camera switch, back, close. */
export function IconButton({
  label,
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      className={[
        "grid size-11 shrink-0 place-items-center rounded-g2",
        "bg-surface-2/80 text-ink-2 border border-line/70",
        "backdrop-blur-[2px] transition active:scale-95 hover:text-ink",
        className,
      ].join(" ")}
    >
      {children}
    </button>
  );
}

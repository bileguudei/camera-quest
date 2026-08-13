"use client";

import { Check, Loader2 } from "lucide-react";
import { motion } from "motion/react";

export type StatusState = "pending" | "active" | "done";

interface StatusBadgeProps {
  state: StatusState;
  pendingLabel: string;
  doneLabel: string;
}

/** One line of the camera-check checklist. */
export function StatusBadge({ state, pendingLabel, doneLabel }: StatusBadgeProps) {
  const done = state === "done";

  return (
    <motion.li
      layout
      className={[
        "flex items-center gap-3 rounded-g2 border px-3.5 py-3 transition-colors",
        done
          ? "border-success/45 bg-success/10"
          : state === "active"
            ? "border-line bg-surface-2/70"
            : "border-line/50 bg-surface/50",
      ].join(" ")}
    >
      <span
        className={[
          "grid size-8 shrink-0 place-items-center rounded-full",
          done ? "bg-success text-[#04220f]" : "bg-surface-3 text-ink-3",
        ].join(" ")}
      >
        {done ? (
          <Check className="size-5" strokeWidth={3.5} />
        ) : state === "active" ? (
          <Loader2 className="size-4 anim-spin" strokeWidth={3} />
        ) : (
          <span className="size-2 rounded-full bg-current" />
        )}
      </span>

      <span
        className={[
          "text-sm font-semibold text-clip-2 sm:text-base",
          done ? "text-ink" : state === "active" ? "text-ink-2" : "text-ink-3",
        ].join(" ")}
      >
        {done ? doneLabel : pendingLabel}
      </span>
    </motion.li>
  );
}

/** Small rounded chip used on the landing screen and headers. */
export function Chip({
  icon,
  children,
  className = "",
}: {
  icon?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full border border-line/70",
        "bg-surface/70 px-3 py-1.5 text-xs font-semibold text-ink-2 sm:text-sm",
        className,
      ].join(" ")}
    >
      {icon && <span aria-hidden>{icon}</span>}
      {children}
    </span>
  );
}

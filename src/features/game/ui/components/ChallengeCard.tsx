"use client";

import { Target } from "lucide-react";
import { motion } from "motion/react";
import type { Challenge } from "@/features/game/domain/types";

interface ChallengeCardProps {
  challenge: Challenge;
  /** `pill` floats over the camera; `hero` fills a reveal screen. */
  variant?: "pill" | "hero";
  className?: string;
}

function Marker({ challenge, big }: { challenge: Challenge; big?: boolean }) {
  if (challenge.kind === "color") {
    return (
      <span
        aria-hidden
        className={[
          "shrink-0 rounded-full ring-2 ring-white/70",
          big ? "size-9 sm:size-11" : "size-6",
        ].join(" ")}
        style={{
          backgroundColor: challenge.hex,
          boxShadow: `0 0 18px -2px ${challenge.hex}`,
        }}
      />
    );
  }
  return (
    <Target
      aria-hidden
      className={["shrink-0 text-primary", big ? "size-9 sm:size-11" : "size-6"].join(
        " ",
      )}
      strokeWidth={2.6}
    />
  );
}

export function ChallengeCard({
  challenge,
  variant = "pill",
  className = "",
}: ChallengeCardProps) {
  if (variant === "hero") {
    return (
      <motion.div
        initial={{ scale: 0.7, opacity: 0, rotate: -3 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 18 }}
        className={[
          "flex w-full max-w-[34rem] flex-col items-center gap-4",
          "rounded-g5 border border-white/12 bg-surface/85 px-5 py-8 text-center",
          "shadow-[0_28px_70px_-28px_rgba(0,0,0,0.95)]",
          className,
        ].join(" ")}
      >
        <Marker challenge={challenge} big />
        <h2 className="font-display text-[clamp(2rem,10.5vw,3.75rem)] font-black leading-[0.95] tracking-tight text-ink">
          {challenge.prompt}
        </h2>
      </motion.div>
    );
  }

  return (
    <div
      className={[
        "flex w-full items-center justify-center gap-3 rounded-g3",
        "border border-white/14 bg-black/62 px-4 py-3",
        "shadow-[0_14px_36px_-16px_rgba(0,0,0,0.95)]",
        className,
      ].join(" ")}
    >
      <Marker challenge={challenge} />
      <p className="font-display text-[clamp(1.15rem,5.6vw,1.9rem)] font-black uppercase leading-tight tracking-tight text-ink text-clip-2">
        {challenge.prompt}
      </p>
    </div>
  );
}

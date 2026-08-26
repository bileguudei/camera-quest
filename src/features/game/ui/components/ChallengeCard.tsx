"use client";

import { Check, CircleDashed, Layers, Target } from "lucide-react";
import { motion } from "motion/react";
import {
  questConditions,
  type QuestCondition,
} from "@/features/game/domain/questConditions";
import type { Challenge } from "@/features/game/domain/types";

interface ChallengeCardProps {
  challenge: Challenge;
  /** `pill` floats over the camera; `hero` fills a reveal screen. */
  variant?: "pill" | "hero";
  /** Classes the running scan has confirmed, so each one can be ticked off. */
  confirmed?: readonly string[];
  className?: string;
}

function Marker({
  challenge,
  conditions,
  big,
}: {
  challenge: Challenge;
  conditions: QuestCondition[];
  big?: boolean;
}) {
  const size = big ? "size-9 sm:size-11" : "size-6";
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
  // More than one thing at once is the whole point of the harder rounds, so the
  // marker says so before the prompt is even read.
  const Glyph = conditions.length > 0 ? Layers : Target;
  return (
    <Glyph
      aria-hidden
      className={["shrink-0 text-primary", size].join(" ")}
      strokeWidth={2.6}
    />
  );
}

function ConditionList({
  conditions,
  confirmed,
  big,
}: {
  conditions: QuestCondition[];
  confirmed: readonly string[];
  big?: boolean;
}) {
  return (
    <ul className="flex flex-wrap items-center justify-center gap-1.5">
      {conditions.map((condition) => {
        const met = confirmed.includes(condition.targetClass);
        const Icon = met ? Check : CircleDashed;
        return (
          <li
            key={condition.targetClass}
            className={[
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1",
              "font-black uppercase leading-none tracking-tight transition-colors",
              big ? "text-sm sm:text-base" : "text-[0.7rem] sm:text-xs",
              met
                ? "border-primary/70 bg-primary/20 text-primary"
                : "border-white/16 bg-black/45 text-ink-2",
            ].join(" ")}
          >
            <Icon
              aria-hidden
              className={big ? "size-4" : "size-3.5"}
              strokeWidth={3}
            />
            <span className="truncate">
              {condition.label}
              {condition.count > 1 ? ` ×${condition.count}` : ""}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function ChallengeCard({
  challenge,
  variant = "pill",
  confirmed = [],
  className = "",
}: ChallengeCardProps) {
  const conditions = questConditions(challenge);

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
        <Marker challenge={challenge} conditions={conditions} big />
        <h2 className="font-display text-[clamp(2rem,10.5vw,3.75rem)] font-black leading-[0.95] tracking-tight text-ink">
          {challenge.prompt}
        </h2>
        {conditions.length > 0 && (
          <ConditionList conditions={conditions} confirmed={confirmed} big />
        )}
      </motion.div>
    );
  }

  return (
    <div
      className={[
        "flex w-full flex-col items-center gap-2 rounded-g3",
        "border border-white/14 bg-black/62 px-4 py-3",
        "shadow-[0_14px_36px_-16px_rgba(0,0,0,0.95)]",
        className,
      ].join(" ")}
    >
      <div className="flex w-full items-center justify-center gap-3">
        <Marker challenge={challenge} conditions={conditions} />
        <p className="font-display text-[clamp(1.15rem,5.6vw,1.9rem)] font-black uppercase leading-tight tracking-tight text-ink text-clip-2">
          {challenge.prompt}
        </p>
      </div>
      {conditions.length > 0 && (
        <ConditionList conditions={conditions} confirmed={confirmed} />
      )}
    </div>
  );
}

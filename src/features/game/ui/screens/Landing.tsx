"use client";

import { motion } from "motion/react";
import { Play, Users } from "lucide-react";
import { GameButton } from "@/features/game/ui/components/GameButton";
import { Screen, ScreenFooter } from "@/features/game/ui/components/Screen";
import { Chip } from "@/features/game/ui/components/StatusBadge";
import { mn } from "@/content/mn";
import { useGame } from "@/features/game/application/useGame";

const fadeUp = {
  hidden: { opacity: 0, y: 22 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.08 * i, type: "spring" as const, stiffness: 260, damping: 22 },
  }),
};

export function Landing() {
  const openSetup = useGame((s) => s.openSetup);
  const openOnline = useGame((s) => s.openOnline);

  return (
    <Screen className="justify-between">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-7 py-6">
        {/* Viewfinder-framed wordmark */}
        <motion.div
          custom={0}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="relative px-7 py-6"
        >
          <Bracket className="left-0 top-0 border-l-4 border-t-4 rounded-tl-g2" />
          <Bracket className="right-0 top-0 border-r-4 border-t-4 rounded-tr-g2" />
          <Bracket className="bottom-0 left-0 border-b-4 border-l-4 rounded-bl-g2" />
          <Bracket className="bottom-0 right-0 border-b-4 border-r-4 rounded-br-g2" />

          <h1 className="text-center font-display font-black leading-[0.86] tracking-tighter">
            <span className="block text-[clamp(2.75rem,15vw,6rem)] text-ink">CAMERA</span>
            <span
              className="block text-[clamp(2.75rem,15vw,6rem)] text-primary"
              style={{
                textShadow: "0 0 48px color-mix(in oklab, var(--primary) 45%, transparent)",
              }}
            >
              QUEST
            </span>
          </h1>

          <span
            aria-hidden
            className="absolute -right-5 -top-6 grid size-11 place-items-center rounded-full bg-accent text-xl anim-float"
            style={{ boxShadow: "0 0 30px -4px var(--accent)" }}
          >
            📷
          </span>
        </motion.div>

        <motion.p
          custom={1}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="text-center font-display text-[clamp(1.35rem,6.5vw,2.25rem)] font-extrabold leading-tight tracking-tight text-ink"
        >
          {mn.brand.tagline}
        </motion.p>

        <motion.p
          custom={2}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="max-w-[22rem] text-balance text-center text-base leading-relaxed text-ink-2 sm:text-lg"
        >
          {mn.brand.sub}
        </motion.p>

        <motion.div
          custom={3}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="flex flex-wrap items-center justify-center gap-2"
        >
          {mn.landing.chips.map((c) => (
            <Chip key={c.text} icon={c.icon}>
              {c.text}
            </Chip>
          ))}
        </motion.div>
      </div>

      <ScreenFooter>
        <motion.div custom={4} variants={fadeUp} initial="hidden" animate="show">
          <GameButton
            onClick={openSetup}
            icon={<Play className="size-6 fill-current" strokeWidth={0} />}
          >
            {mn.landing.cta}
          </GameButton>
          <GameButton
            className="mt-2.5"
            variant="ghost"
            size="md"
            onClick={openOnline}
            icon={<Users className="size-5" strokeWidth={2.6} />}
          >
            {mn.landing.onlineCta}
          </GameButton>
          <p className="mt-3 text-center text-sm text-ink-3">{mn.landing.how}</p>
        </motion.div>
      </ScreenFooter>
    </Screen>
  );
}

function Bracket({ className }: { className: string }) {
  return (
    <span
      aria-hidden
      className={["absolute size-8 border-primary/70", className].join(" ")}
    />
  );
}

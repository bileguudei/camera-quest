"use client";

import Image from "next/image";
import { motion } from "motion/react";
import { Play, Trophy, Camera, Users, Zap, Flame, Sparkles } from "lucide-react";
import { GameButton } from "@/features/game/ui/components/GameButton";
import { Screen, ScreenFooter } from "@/features/game/ui/components/Screen";
import { mn } from "@/content/mn";
import { useGame } from "@/features/game/application/useGame";

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.06 * i, type: "spring" as const, stiffness: 260, damping: 22 },
  }),
};

const FEATURE_CARDS = [
  { icon: Camera, color: "purple" as const, title: "Камертай тоглоно", desc: "Камераа ашиглан даалгавар хайж биелүүл." },
  { icon: Users, color: "purple" as const, title: "1-6 тоглогч", desc: "Найзуудтайгаа хамтдаа өрсөлдөөрэй." },
  { icon: Zap, color: "primary" as const, title: "Шууд тоглоно", desc: "Санамсаргүй тоглогчидтой шууд тоглоорой." },
];

export function Landing() {
  const openSetup = useGame((s) => s.openSetup);

  return (
    <Screen className="justify-between">
      {/* Top nav */}
      <div className="flex items-center justify-between px-1 pt-1">
        <div className="flex items-center gap-1.5">
          <span className="grid size-7 place-items-center rounded-lg bg-primary/15 text-primary">
            <Camera className="size-4" strokeWidth={2} />
          </span>
          <span className="font-display text-sm font-black tracking-tight text-ink">
            CAMERA <span className="text-primary">QUEST</span>
          </span>
        </div>
        <button className="flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-ink shadow-[0_2px_0_rgba(0,0,0,0.25)]">
          <Trophy className="size-3.5" strokeWidth={2.5} />
          Шилдэг сорил
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-2 overflow-hidden py-1">
        {/* Background image */}
        <div className="pointer-events-none absolute inset-0 z-0">
          <Image
            src="/images/background2.png"
            alt=""
            fill
            className="object-cover opacity-15 scale-125"
            style={{
              maskImage: "radial-gradient(ellipse at center, black 30%, transparent 70%)",
              WebkitMaskImage: "radial-gradient(ellipse at center, black 30%, transparent 70%)",
            }}
            priority
          />
        </div>

        {/* Ambient glow */}
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[38%] z-0 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 blur-3xl"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[38%] z-0 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full bg-purple-500/20 blur-3xl"
        />

        {/* Mascot */}
        <motion.div
          custom={0}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="relative z-10"
        >
          <Sparkles className="absolute -left-6 top-6 size-5 text-primary/70 animate-pulse" strokeWidth={2} />
          <Sparkles className="absolute -right-5 bottom-8 size-4 text-purple-300/70 animate-pulse [animation-delay:400ms]" strokeWidth={2} />
          <Image
            src="/images/camera-mascot.png"
            alt="Camera Quest mascot"
            width={260}
            height={260}
            priority
            className="anim-float drop-shadow-[0_0_50px_rgba(163,255,92,0.35)]"
          />
        </motion.div>

        <motion.h1
          custom={1}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="relative z-10 text-center font-display font-black leading-[0.86] tracking-tighter"
        >
          <span className="block text-[clamp(2.25rem,11vw,4rem)] text-ink">CAMERA</span>
          <span
            className="block text-[clamp(2.25rem,11vw,4rem)] text-primary"
            style={{ textShadow: "0 0 40px color-mix(in oklab, var(--primary) 50%, transparent)" }}
          >
            QUEST
          </span>
        </motion.h1>

        <motion.p
          custom={2}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="relative z-10 text-center text-base font-bold text-ink"
        >
          {mn.brand.tagline}
        </motion.p>

        <motion.p
          custom={3}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="relative z-10 max-w-[19rem] text-balance text-center text-xs leading-relaxed text-ink sm:text-sm"
        >
          {mn.brand.sub}
        </motion.p>

        <motion.div
          custom={4}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="relative z-10 mt-1 flex items-center gap-1 text-xs font-bold text-ink"
        >
          <Sparkles className="size-3.5 text-primary" strokeWidth={2} />
          Тоглоомын горим
          <Sparkles className="size-3.5 text-purple-300" strokeWidth={2} />
        </motion.div>

        <motion.div
          custom={5}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="relative z-10 grid w-full max-w-sm grid-cols-3 gap-2 px-2"
        >
          {FEATURE_CARDS.map((f) => {
            const Icon = f.icon;
            const isPurple = f.color === "purple";
            const ring = isPurple ? "border-purple-400/40 text-purple-300" : "border-primary/40 text-primary";
            const cardBorder = isPurple ? "border-purple-400/20" : "border-primary/20";
            const titleColor = isPurple ? "text-purple-300" : "text-primary";
            return (
              <div
                key={f.title}
                className={`flex flex-col items-center gap-1.5 rounded-xl border bg-ink/40 px-2 py-3 text-center ${cardBorder}`}
              >
                <span className={`grid size-9 place-items-center rounded-full border ${ring}`}>
                  <Icon className="size-4" strokeWidth={2} />
                </span>
                <p className={`text-[11px] font-bold ${titleColor}`}>{f.title}</p>
                <p className="text-[9px] leading-tight text-ink">{f.desc}</p>
              </div>
            );
          })}
        </motion.div>
      </div>

      <ScreenFooter>
        <motion.div custom={6} variants={fadeUp} initial="hidden" animate="show" className="flex flex-col items-center gap-3">
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <GameButton
              onClick={openSetup}
              icon={<Play className="size-6 fill-current" strokeWidth={0} />}
            >
              {mn.landing.cta}
            </GameButton>
          </motion.div>

          <div className="flex items-center gap-2 text-xs text-ink">
            <span className="flex items-center gap-1 font-semibold text-ink">
              <Flame className="size-3.5 text-primary" strokeWidth={2.5} />
              Өнөөдрийн сорил
            </span>
            <span className="text-ink/50">|</span>
            <span className="font-medium text-primary">3 шинэ даалгавар</span>
          </div>
        </motion.div>
      </ScreenFooter>
    </Screen>
  );
}
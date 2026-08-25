"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "motion/react";
import { Play, Camera, Users, Zap, Sparkles, ScanFace } from "lucide-react";
import { GameButton } from "@/features/game/ui/components/GameButton";
import { Screen, ScreenFooter } from "@/features/game/ui/components/Screen";
import { mn } from "@/content/mn";
import { useGame } from "@/features/game/application/useGame";

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: 0.06 * i,
      type: "spring" as const,
      stiffness: 260,
      damping: 22,
    },
  }),
};

const FEATURE_CARDS = [
  {
    icon: Camera,
    color: "purple" as const,
    title: "Камертай тоглоно",
    desc: "Камераа ашиглан даалгавар хайж биелүүл.",
  },
  {
    icon: Users,
    color: "purple" as const,
    title: "1-6 тоглогч",
    desc: "Найзуудтайгаа хамтдаа өрсөлдөөрэй.",
  },
  {
    icon: Zap,
    color: "primary" as const,
    title: "Шууд тоглоно",
    desc: "Найзуудаа кодоор урьж, шууд өрсөлдөөрэй.",
  },
];

/**
 * One stage, never a scroll. Every block is sized against the viewport height
 * so a 667px phone and a 900px laptop both fit without clipping a word.
 */
export function Landing() {
  const openSetup = useGame((s) => s.openSetup);
  const openOnline = useGame((s) => s.openOnline);

  return (
    <Screen className="justify-between">
      {/* Top nav */}
      <div className="flex shrink-0 items-center px-1 pt-1">
        <div className="flex items-center gap-1.5">
          <span className="grid size-7 place-items-center rounded-lg bg-primary/15 text-primary">
            <Camera className="size-4" strokeWidth={2} />
          </span>
          <span className="font-display text-sm font-black tracking-tight text-ink">
            CAMERA <span className="text-primary">QUEST</span>
          </span>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-[clamp(0.25rem,1.4vh,0.875rem)] overflow-hidden">
        {/* Background image */}
        <div className="pointer-events-none absolute inset-0 z-0">
          <Image
            src="/images/background2.png"
            alt=""
            fill
            sizes="100vw"
            priority
            className="scale-125 object-cover opacity-[0.09]"
            style={{
              maskImage:
                "radial-gradient(ellipse at center, black 14%, transparent 52%)",
              WebkitMaskImage:
                "radial-gradient(ellipse at center, black 14%, transparent 52%)",
            }}
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
          className="relative z-10 shrink-0"
        >
          <Sparkles
            className="absolute -left-6 top-6 size-5 text-primary/70 animate-pulse"
            strokeWidth={2}
          />
          <Sparkles
            className="absolute -right-5 bottom-8 size-4 text-purple-300/70 animate-pulse [animation-delay:400ms]"
            strokeWidth={2}
          />
          {/* 612×408 is the file's own ratio — declaring a square one made Next
              warn and stretched the mascot. Height drives the size so the
              artwork shrinks with the viewport instead of being cut off. */}
          <Image
            src="/images/camera-mascot.png"
            alt="Camera Quest mascot"
            width={612}
            height={408}
            priority
            sizes="(min-width: 768px) 24rem, 70vw"
            className="anim-float h-[clamp(5rem,23vh,15rem)] w-auto drop-shadow-[0_0_50px_rgba(163,255,92,0.35)]"
          />
        </motion.div>

        <motion.h1
          custom={1}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="relative z-10 shrink-0 text-center font-display font-black leading-[0.86] tracking-tighter"
        >
          <span className="block text-[clamp(2rem,min(12vw,8.5vh),4.5rem)] text-ink">
            CAMERA
          </span>
          <span
            className="block text-[clamp(2rem,min(12vw,8.5vh),4.5rem)] text-primary"
            style={{
              textShadow:
                "0 0 40px color-mix(in oklab, var(--primary) 50%, transparent)",
            }}
          >
            QUEST
          </span>
        </motion.h1>

        <motion.p
          custom={2}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="relative z-10 shrink-0 text-center text-[clamp(0.9375rem,2vh,1.375rem)] font-bold text-ink"
        >
          {mn.brand.tagline}
        </motion.p>

        <motion.p
          custom={3}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="relative z-10 hidden max-w-[19rem] shrink-0 text-balance text-center text-[clamp(0.75rem,1.6vh,1rem)] leading-relaxed text-ink-2 [@media(min-height:760px)]:block md:max-w-md"
        >
          {mn.brand.sub}
        </motion.p>

        <motion.div
          custom={4}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="relative z-10 hidden shrink-0 items-center gap-1 text-xs font-bold text-ink-2 [@media(min-height:800px)]:flex"
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
          className="relative z-10 grid w-full max-w-sm shrink-0 grid-cols-3 gap-2 px-2 md:max-w-xl md:gap-3"
        >
          {FEATURE_CARDS.map((f) => {
            const Icon = f.icon;
            const isPurple = f.color === "purple";
            const ring = isPurple
              ? "border-purple-400/40 text-purple-300"
              : "border-primary/40 text-primary";
            const cardBorder = isPurple
              ? "border-purple-400/25"
              : "border-primary/25";
            const titleColor = isPurple ? "text-purple-300" : "text-primary";
            return (
              <div
                key={f.title}
                /* An opaque surface: `bg-ink/40` let the photo behind show
                   through, so the three cards read as three different colours. */
                className={`flex flex-col items-center gap-1.5 rounded-xl border bg-surface-2/90 px-2 py-2.5 text-center md:gap-2 md:px-3 md:py-4 ${cardBorder}`}
              >
                <span
                  className={`grid size-8 shrink-0 place-items-center rounded-full border md:size-11 ${ring}`}
                >
                  <Icon className="size-4 md:size-5" strokeWidth={2} />
                </span>
                <p
                  /* A fixed two-line box keeps the three descriptions on one baseline
                     however the titles wrap. */
                  className={`grid min-h-[2.2em] place-items-center text-[11px] font-bold leading-tight md:text-sm ${titleColor}`}
                >
                  {f.title}
                </p>
                <p className="hidden text-[10px] leading-snug text-ink-2 [@media(min-height:620px)]:block md:text-xs">
                  {f.desc}
                </p>
              </div>
            );
          })}
        </motion.div>
      </div>

      <ScreenFooter>
        <motion.div
          custom={6}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="flex flex-col gap-2.5"
        >
          {/* The primary Camera Quest door remains full-width. The two other
              real game doors share the next row, keeping Mimic Rush in the
              main action area instead of hiding it in the header. */}
          <motion.div
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="w-full"
          >
            <GameButton
              onClick={openSetup}
              icon={<Play className="size-6 fill-current" strokeWidth={0} />}
            >
              {mn.landing.cta}
            </GameButton>
          </motion.div>

          <div className="grid grid-cols-2 gap-2.5">
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Link
                href="/pose-party"
                className="btn-3d relative inline-flex min-h-14 w-full select-none items-center justify-center gap-2 rounded-g3 border border-line/80 bg-surface-2 px-3 font-display text-base font-extrabold tracking-tight text-ink [--btn-edge:var(--surface-deep)] hover:bg-surface-3"
              >
                <ScanFace className="size-5 shrink-0 text-accent-2" strokeWidth={2.4} />
                <span className="text-clip-1 leading-tight">Mimic Rush</span>
              </Link>
            </motion.div>

            {/* The only way into an online table; a landing redesign that drops
                this makes the whole multiplayer flow unreachable. */}
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <GameButton
                variant="ghost"
                size="md"
                onClick={openOnline}
                icon={<Users className="size-5" strokeWidth={2.6} />}
                className="px-3 text-base"
              >
                Онлайн тоглох
              </GameButton>
            </motion.div>
          </div>
        </motion.div>
      </ScreenFooter>
    </Screen>
  );
}

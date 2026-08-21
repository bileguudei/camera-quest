"use client";

import { ArrowLeft, Camera } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { CSSProperties } from "react";
import {
  GameButton,
  IconButton,
} from "@/features/game/ui/components/GameButton";
import { EnvironmentPicker } from "@/features/game/ui/components/EnvironmentPicker";
import { PlayerAvatar } from "@/features/game/ui/components/PlayerAvatar";
import {
  Screen,
  ScreenBody,
  ScreenFooter,
} from "@/features/game/ui/components/Screen";
import { mn } from "@/content/mn";
import { MAX_PLAYERS, PLAYER_COLOR_HEX } from "@/features/game/domain/config";
import { useGame } from "@/features/game/application/useGame";

export function Setup() {
  const players = useGame((s) => s.players);
  const playerCount = useGame((s) => s.playerCount);
  const setPlayerCount = useGame((s) => s.setPlayerCount);
  const setPlayerName = useGame((s) => s.setPlayerName);
  const confirmPlayers = useGame((s) => s.confirmPlayers);
  const goTo = useGame((s) => s.goTo);

  return (
    <Screen>
      <header className="mx-auto flex w-full shrink-0 items-center gap-3 pb-4 lg:max-w-[1120px]">
        <IconButton label={mn.setup.back} onClick={() => goTo("landing")}>
          <ArrowLeft className="size-5" strokeWidth={2.6} />
        </IconButton>
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-black leading-tight tracking-tight text-ink sm:text-3xl">
            {mn.setup.title}
          </h1>
          <p className="truncate text-sm text-ink-3">{mn.setup.sub}</p>
        </div>
      </header>

      <ScreenBody className="flex flex-col pb-6 lg:overflow-visible">
        <div className="m-auto w-full max-w-md lg:grid lg:max-w-[1120px] lg:grid-cols-[0.86fr_1.14fr] lg:gap-0 lg:stage-card lg:overflow-hidden">
          <div className="lg:flex lg:flex-col lg:justify-center lg:px-9 lg:py-10">
            <p className="mb-2.5 text-sm font-bold uppercase tracking-wider text-ink-3 lg:eyebrow-rule lg:text-xs">
              {mn.setup.countLabel}
            </p>

            <div
              role="radiogroup"
              aria-label={mn.setup.countLabel}
              className="flex gap-1.5 sm:gap-2"
            >
              {Array.from({ length: MAX_PLAYERS }, (_, i) => i + 1).map((n) => {
                const selected = n === playerCount;
                return (
                  <button
                    key={n}
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setPlayerCount(n)}
                    style={
                      {
                        "--btn-edge": selected
                          ? "var(--accent-deep)"
                          : "transparent",
                      } as CSSProperties
                    }
                    className={[
                      "min-h-14 flex-1 rounded-g2 font-display text-xl font-black transition sm:text-2xl",
                      selected
                        ? "bg-accent text-white btn-3d"
                        : "border border-line bg-surface/70 text-ink-2 active:scale-95",
                    ].join(" ")}
                  >
                    {n}
                  </button>
                );
              })}
            </div>

            <EnvironmentPicker className="mt-6" />

            {/* On the card the action belongs to the column it completes; the
                sticky footer stays for phones. */}
            <div className="mt-8 hidden lg:block">
              <GameButton
                onClick={confirmPlayers}
                icon={<Camera className="size-6" strokeWidth={2.6} />}
              >
                {mn.setup.cta}
              </GameButton>
            </div>
          </div>

          <div className="lg:stage-divide lg:flex lg:min-h-0 lg:flex-col lg:px-9 lg:py-10">
            <p className="mb-3 hidden text-xs font-bold uppercase tracking-widest text-ink-3 lg:eyebrow-rule">
              {mn.setup.rosterLabel}
            </p>
            {/* Six rows down one side of a 1120px card is the void the phone
              layout leaves behind; on the card they run in two columns. */}
            <ul className="mt-6 flex flex-col gap-2.5 lg:mt-0 lg:grid lg:min-h-0 lg:grid-cols-2 lg:content-start lg:gap-2.5 lg:overflow-y-auto lg:no-scrollbar">
              <AnimatePresence initial={false}>
                {players.map((player) => {
                  const color = PLAYER_COLOR_HEX[player.color];
                  return (
                    <motion.li
                      key={player.id}
                      layout
                      initial={{ opacity: 0, y: -8, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                      transition={{
                        type: "spring",
                        stiffness: 380,
                        damping: 30,
                      }}
                    >
                      <label
                        className="flex items-center gap-3 rounded-g3 border bg-surface/70 p-2.5 transition-colors focus-within:bg-surface-2/80"
                        style={{
                          borderColor: `color-mix(in oklab, ${color} 45%, transparent)`,
                        }}
                      >
                        <PlayerAvatar player={player} size="md" />

                        <span className="flex min-w-0 flex-1 flex-col">
                          <span
                            className="text-xs font-bold uppercase tracking-wider"
                            style={{ color }}
                          >
                            {mn.setup.playerLabel(player.seat)}
                          </span>
                          <input
                            value={player.name}
                            onChange={(e) =>
                              setPlayerName(player.id, e.target.value)
                            }
                            placeholder={mn.setup.namePlaceholder(player.seat)}
                            maxLength={24}
                            autoComplete="off"
                            spellCheck={false}
                            aria-label={mn.setup.playerLabel(player.seat)}
                            className="w-full min-w-0 bg-transparent font-display text-lg font-extrabold text-ink outline-none placeholder:font-semibold placeholder:text-ink-3 sm:text-xl"
                          />
                        </span>
                      </label>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>

            <p className="mt-3 text-center text-xs text-ink-3 lg:text-left">
              {mn.setup.hint}
            </p>
          </div>
        </div>
      </ScreenBody>

      <ScreenFooter className="lg:hidden">
        <GameButton
          onClick={confirmPlayers}
          icon={<Camera className="size-6" strokeWidth={2.6} />}
        >
          {mn.setup.cta}
        </GameButton>
      </ScreenFooter>
    </Screen>
  );
}

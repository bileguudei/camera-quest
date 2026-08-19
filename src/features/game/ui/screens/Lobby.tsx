"use client";

import { Check, LogOut, Play } from "lucide-react";
import { motion } from "motion/react";
import { GameButton } from "@/features/game/ui/components/GameButton";
import { PlayerAvatar } from "@/features/game/ui/components/PlayerAvatar";
import { Screen, ScreenFooter } from "@/features/game/ui/components/Screen";
import { mn } from "@/content/mn";
import { useGame } from "@/features/game/application/useGame";
import { handoffErrorMessage } from "@/features/game/domain/errorMessages";

/** The waiting room. Every phone renders the same server state. */
export function Lobby() {
  const lobby = useGame((state) => state.lobby);
  const setReady = useGame((state) => state.setLobbyReady);
  const start = useGame((state) => state.startOnlineGame);
  const quit = useGame((state) => state.quitGame);
  const busy = useGame((state) => state.busy);
  const errorCode = useGame((state) => state.errorCode);
  if (!lobby) return null;

  const seated = lobby.players.filter((player) => !player.left);
  const self = seated.find((player) => player.isSelf);
  const everyoneReady = seated.length >= 2 && seated.every((player) => player.ready);

  return (
    <Screen className="justify-between">
      {/* A phone stacks these; from `md` the code and the roster sit side by side. */}
      <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col items-center gap-6 overflow-y-auto no-scrollbar py-6 md:flex-row md:items-center md:justify-center md:gap-10 md:py-0">
        <div className="text-center md:flex-1">
          <p className="text-sm font-bold uppercase tracking-widest text-ink-3">
            {mn.online.codeLabel}
          </p>
          <p className="font-display text-[clamp(2.5rem,13vw,5.5rem)] font-black leading-none tracking-[0.18em] text-primary">
            {lobby.joinCode}
          </p>
          <p className="mx-auto mt-2 max-w-[26ch] text-sm text-ink-3">{mn.online.shareHint}</p>
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface/60 px-3 py-1 text-sm font-bold text-ink-2">
            <span aria-hidden>{mn.environment.options[lobby.environment].icon}</span>
            {mn.environment.options[lobby.environment].label}
          </p>
          <p className="mt-3 hidden text-sm text-ink-3 md:block">
            {mn.online.seatCount(seated.length)}
          </p>
        </div>

        <ul className="flex w-full max-w-sm flex-col gap-2 md:flex-1">
          {seated.map((player) => (
            <motion.li
              key={player.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 rounded-g3 border border-line bg-surface/60 px-3 py-2.5"
            >
              <PlayerAvatar player={player} size="sm" active={player.ready} />
              <span className="min-w-0 flex-1 truncate font-display text-lg font-extrabold text-ink">
                {player.name}
                {player.isSelf ? ` ${mn.online.you}` : ""}
              </span>
              {player.ready ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-bold text-primary">
                  <Check className="size-3.5" strokeWidth={3} />
                  {mn.online.ready}
                </span>
              ) : (
                <span className="text-xs font-bold text-ink-3">{mn.online.waiting}</span>
              )}
            </motion.li>
          ))}
        </ul>

        <p className="text-sm text-ink-3 md:hidden">{mn.online.seatCount(seated.length)}</p>

        {errorCode && (
          <p role="alert" className="text-center text-sm font-bold text-danger">
            {handoffErrorMessage(errorCode)}
          </p>
        )}
      </div>

      <ScreenFooter>
        <div className="flex flex-col gap-2.5">
          <GameButton
            variant={self?.ready ? "ghost" : "primary"}
            onClick={() => void setReady(!self?.ready)}
            icon={<Check className="size-6" strokeWidth={2.8} />}
          >
            {self?.ready ? mn.online.notReadyCta : mn.online.readyCta}
          </GameButton>

          {lobby.isHost && (
            <GameButton
              onClick={() => void start()}
              disabled={!everyoneReady || busy}
              icon={<Play className="size-6 fill-current" strokeWidth={0} />}
            >
              {seated.length < 2 ? mn.online.needPlayers : mn.online.startCta}
            </GameButton>
          )}

          <GameButton size="sm" variant="ghost" onClick={() => void quit()} icon={<LogOut className="size-5" />}>
            {mn.online.leave}
          </GameButton>
        </div>
      </ScreenFooter>
    </Screen>
  );
}

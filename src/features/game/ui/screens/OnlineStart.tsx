"use client";

import { ArrowLeft, KeyRound, ScanFace, Search, Users } from "lucide-react";
import { useState } from "react";
import { EnvironmentPicker } from "@/features/game/ui/components/EnvironmentPicker";
import { GameButton } from "@/features/game/ui/components/GameButton";
import { Screen, ScreenFooter } from "@/features/game/ui/components/Screen";
import { mn } from "@/content/mn";
import { useGame } from "@/features/game/application/useGame";
import { handoffErrorMessage } from "@/features/game/domain/errorMessages";
import { takePendingInviteCode } from "@/features/game/application/inviteLink";
import type { GameKind } from "@/features/game/domain/types";

/** Host a table or join one with a six-character code. */
export function OnlineStart() {
  const host = useGame((state) => state.hostOnlineGame);
  const join = useGame((state) => state.joinOnlineGame);
  const goTo = useGame((state) => state.goTo);
  const busy = useGame((state) => state.busy);
  const errorCode = useGame((state) => state.errorCode);
  const backendMode = useGame((state) => state.backendMode);

  const [name, setName] = useState("");
  const [gameKind, setGameKind] = useState<GameKind>("mimic_rush");
  // Arriving on an invite link, the code is already known — the friend only
  // has to say who they are.
  const [code, setCode] = useState(takePendingInviteCode);
  const [invited] = useState(() => code.length === 6);

  const trimmedName = name.trim();
  const canHost = trimmedName.length > 0 && !busy;
  const canJoin = canHost && code.trim().length === 6;
  const unsupported = backendMode !== "supabase";

  return (
    <Screen className="justify-center lg:px-8">
      <button
        type="button"
        onClick={() => goTo("landing")}
        className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm font-bold text-ink-2 lg:hidden"
      >
        <ArrowLeft className="size-4" strokeWidth={2.6} />
        {mn.online.back}
      </button>

      {/* One form, two panels. A phone stacks them with a divider; from `lg`
          the stage card splits hosting from joining side by side. */}
      <div className="mx-auto flex w-full max-w-sm flex-col gap-5 lg:max-w-[1120px] lg:stage-card lg:grid lg:grid-cols-2 lg:gap-0 lg:overflow-hidden">
        <div className="flex flex-col gap-5 lg:justify-center lg:px-10 lg:py-12">
          <div className="text-center lg:text-left">
            {/* Inside the card on desktop: a control pinned to the window
                corner reads as browser chrome, not as part of the game. */}
            <button
              type="button"
              onClick={() => goTo("landing")}
              className="mb-5 hidden items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm font-bold text-ink-2 lg:inline-flex"
            >
              <ArrowLeft className="size-4" strokeWidth={2.6} />
              {mn.online.back}
            </button>
            <h1 className="font-display text-3xl font-black tracking-tight text-ink lg:text-[2.5rem] lg:leading-none">
              {mn.online.title}
            </h1>
            <p className="mt-1 text-sm text-ink-3 lg:mt-3 lg:max-w-[38ch] lg:text-base lg:leading-relaxed lg:text-ink-2">
              {invited ? mn.online.invited : mn.online.sub}
            </p>
          </div>

          <label className="flex flex-col gap-1.5 text-left">
            <span className="text-sm font-bold text-ink-2">
              {mn.online.nameLabel}
            </span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value.slice(0, 24))}
              maxLength={24}
              autoComplete="nickname"
              placeholder={mn.online.namePlaceholder}
              className="rounded-g3 border border-line bg-surface px-4 py-3 text-base text-ink outline-none focus-visible:border-primary"
            />
          </label>

          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Тоглоомын төрөл">
            {([
              {
                value: "mimic_rush" as const,
                title: "Mimic Rush",
                hint: "Face Bomb · 3 life",
                Icon: ScanFace,
              },
              {
                value: "camera_quest" as const,
                title: "Camera Quest",
                hint: "Зүйл хайх · 5 раунд",
                Icon: Search,
              },
            ]).map(({ value, title, hint, Icon }) => {
              const selected = gameKind === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setGameKind(value)}
                  className={[
                    "rounded-g3 border p-3 text-left transition-colors",
                    selected
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-line bg-surface text-ink-2",
                  ].join(" ")}
                >
                  <Icon className="size-5" strokeWidth={2.3} />
                  <span className="mt-2 block font-display text-sm font-black text-ink">
                    {title}
                  </span>
                  <span className="mt-0.5 block text-[10px] font-bold text-ink-3">
                    {hint}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Only Camera Quest needs an object-pool environment. */}
          {gameKind === "camera_quest" && <EnvironmentPicker />}

          <GameButton
            onClick={() => void host(trimmedName, gameKind)}
            disabled={!canHost || unsupported}
            icon={<Users className="size-6" strokeWidth={2.6} />}
          >
            {mn.online.hostCta}
          </GameButton>
        </div>

        <div className="flex flex-col gap-5 lg:stage-divide lg:justify-center lg:bg-bg-2/40 lg:px-10 lg:py-12">
          <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-widest text-ink-3 lg:hidden">
            <span className="h-px flex-1 bg-line" />
            {mn.online.or}
            <span className="h-px flex-1 bg-line" />
          </div>

          <h2 className="hidden font-display text-2xl font-black tracking-tight text-ink lg:block">
            {mn.online.joinCta}
          </h2>

          <label className="flex flex-col gap-1.5 text-left">
            <span className="text-sm font-bold text-ink-2">
              {mn.online.codeLabel}
            </span>
            <input
              value={code}
              onChange={(event) =>
                // The code is read out loud, so accept any case and normalize it.
                setCode(
                  event.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, "")
                    .slice(0, 6),
                )
              }
              inputMode="text"
              autoCapitalize="characters"
              placeholder="KX7M2P"
              className="rounded-g3 border border-line bg-surface px-4 py-3 text-center font-display text-2xl font-black tracking-[0.35em] text-ink outline-none focus-visible:border-primary"
            />
          </label>

          <GameButton
            variant="ghost"
            onClick={() => void join(code, trimmedName)}
            disabled={!canJoin || unsupported}
            icon={<KeyRound className="size-6" strokeWidth={2.6} />}
          >
            {mn.online.joinCta}
          </GameButton>

          {unsupported && (
            <p role="alert" className="text-center text-sm font-bold text-warn">
              {mn.online.unsupported}
            </p>
          )}
          {errorCode && (
            <p
              role="alert"
              className="text-center text-sm font-bold text-danger"
            >
              {handoffErrorMessage(errorCode)}
            </p>
          )}

          <p className="hidden text-xs leading-relaxed text-ink-3 lg:block">
            {mn.online.inheritHint}
          </p>
        </div>
      </div>

      <ScreenFooter>
        <p className="text-center text-sm text-ink-3">{mn.online.hint}</p>
      </ScreenFooter>
    </Screen>
  );
}

"use client";

import { ArrowLeft, KeyRound, Users } from "lucide-react";
import { useState } from "react";
import { EnvironmentPicker } from "@/features/game/ui/components/EnvironmentPicker";
import { GameButton } from "@/features/game/ui/components/GameButton";
import { Screen, ScreenFooter } from "@/features/game/ui/components/Screen";
import { mn } from "@/content/mn";
import { useGame } from "@/features/game/application/useGame";
import { handoffErrorMessage } from "@/features/game/domain/errorMessages";

/** Host a table or join one with a six-character code. */
export function OnlineStart() {
  const host = useGame((state) => state.hostOnlineGame);
  const join = useGame((state) => state.joinOnlineGame);
  const goTo = useGame((state) => state.goTo);
  const busy = useGame((state) => state.busy);
  const errorCode = useGame((state) => state.errorCode);
  const backendMode = useGame((state) => state.backendMode);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  const trimmedName = name.trim();
  const canHost = trimmedName.length > 0 && !busy;
  const canJoin = canHost && code.trim().length === 6;
  const unsupported = backendMode !== "supabase";

  return (
    <Screen className="justify-center">
      <button
        type="button"
        onClick={() => goTo("landing")}
        className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm font-bold text-ink-2"
      >
        <ArrowLeft className="size-4" strokeWidth={2.6} />
        {mn.online.back}
      </button>

      <div className="mx-auto flex w-full max-w-sm flex-col gap-5">
        <div className="text-center">
          <h1 className="font-display text-3xl font-black tracking-tight text-ink">
            {mn.online.title}
          </h1>
          <p className="mt-1 text-sm text-ink-3">{mn.online.sub}</p>
        </div>

        <label className="flex flex-col gap-1.5 text-left">
          <span className="text-sm font-bold text-ink-2">{mn.online.nameLabel}</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value.slice(0, 24))}
            maxLength={24}
            autoComplete="nickname"
            placeholder={mn.online.namePlaceholder}
            className="rounded-g3 border border-line bg-surface px-4 py-3 text-base text-ink outline-none focus-visible:border-primary"
          />
        </label>

        {/* Only the host chooses; a joining phone inherits the table's room. */}
        <EnvironmentPicker />

        <GameButton
          onClick={() => void host(trimmedName)}
          disabled={!canHost || unsupported}
          icon={<Users className="size-6" strokeWidth={2.6} />}
        >
          {mn.online.hostCta}
        </GameButton>

        <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-widest text-ink-3">
          <span className="h-px flex-1 bg-line" />
          {mn.online.or}
          <span className="h-px flex-1 bg-line" />
        </div>

        <label className="flex flex-col gap-1.5 text-left">
          <span className="text-sm font-bold text-ink-2">{mn.online.codeLabel}</span>
          <input
            value={code}
            onChange={(event) =>
              // The code is read out loud, so accept any case and normalize it.
              setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))
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
          <p role="alert" className="text-center text-sm font-bold text-danger">
            {handoffErrorMessage(errorCode)}
          </p>
        )}
      </div>

      <ScreenFooter>
        <p className="text-center text-sm text-ink-3">{mn.online.hint}</p>
      </ScreenFooter>
    </Screen>
  );
}

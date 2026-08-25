"use client";

import { Camera, Check, Copy, HeartPulse, Play, ScanFace, Share2, Target, Users } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  GameButton,
  IconButton,
} from "@/features/game/ui/components/GameButton";
import { PlayerAvatar } from "@/features/game/ui/components/PlayerAvatar";
import { EnvironmentIcon } from "@/features/game/ui/components/SeatMark";
import { Screen, ScreenFooter } from "@/features/game/ui/components/Screen";
import { mn } from "@/content/mn";
import { MAX_PLAYERS } from "@/features/game/domain/config";
import { useGame } from "@/features/game/application/useGame";
import { handoffErrorMessage } from "@/features/game/domain/errorMessages";
import {
  buildInviteUrl,
  copyText,
  shareInvite,
} from "@/features/game/application/inviteLink";
import { CameraFrame } from "@/features/game/ui/components/CameraFrame";
import { useCameraContext } from "@/features/camera/CameraProvider";
import { useCameraPreflight } from "@/features/camera/cameraPreflight";
import { getGameRepository } from "@/features/game/infrastructure/createGameRepository";
import { warmVisionService } from "@/features/vision/visionClient";
import { useMimicTracker } from "@/features/pose-party/application/useMimicTracker";

/** The waiting room. Every phone renders the same server state. */
export function Lobby() {
  const lobby = useGame((state) => state.lobby);
  const setReady = useGame((state) => state.setLobbyReady);
  const start = useGame((state) => state.startOnlineGame);
  const quit = useGame((state) => state.quitGame);
  const busy = useGame((state) => state.busy);
  const errorCode = useGame((state) => state.errorCode);
  const facing = useGame((state) => state.cameraFacing);
  const { stream, status, retry } = useCameraContext();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const preflight = useCameraPreflight(videoRef, status, false);
  const [visionReady, setVisionReady] = useState(false);
  const [visionFailed, setVisionFailed] = useState(false);
  const [visionAttempt, setVisionAttempt] = useState(0);
  const [mimicAttempt, setMimicAttempt] = useState(0);
  const syncingReady = useRef<boolean | null>(null);
  const [notice, setNotice] = useState<"shared" | "copied" | "failed" | null>(
    null,
  );
  const [manualValue, setManualValue] = useState("");
  const isMimicLobby = lobby?.gameKind === "mimic_rush";
  const ignoreMimicObservation = useCallback(() => undefined, []);
  const mimicTracker = useMimicTracker({
    active: isMimicLobby,
    videoRef,
    onObservation: ignoreMimicObservation,
    retryKey: mimicAttempt,
  });

  useEffect(() => {
    if (isMimicLobby) return;
    const controller = new AbortController();
    void getGameRepository()
      .getAccessToken()
      .then((token) => warmVisionService(token, controller.signal))
      .then(() => {
        setVisionReady(true);
        setVisionFailed(false);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setVisionFailed(true);
        setVisionReady(false);
      });
    return () => controller.abort();
  }, [isMimicLobby, visionAttempt]);
  const seated = lobby?.players.filter((player) => !player.left) ?? [];
  const self = seated.find((player) => player.isSelf);
  const recognitionReady = isMimicLobby ? mimicTracker.status === "ready" : visionReady;
  const recognitionFailed = isMimicLobby ? mimicTracker.status === "error" : visionFailed;
  const thisDeviceReady = preflight.deviceReady && recognitionReady;
  const readinessSettled =
    thisDeviceReady ||
    recognitionFailed ||
    !preflight.online ||
    preflight.lighting === "dark" ||
    status === "denied" ||
    status === "unavailable";

  useEffect(() => {
    if (!readinessSettled) return;
    if (!self || self.ready === thisDeviceReady) {
      syncingReady.current = null;
      return;
    }
    if (syncingReady.current === thisDeviceReady) return;
    syncingReady.current = thisDeviceReady;
    void setReady(thisDeviceReady).finally(() => {
      syncingReady.current = null;
    });
  }, [readinessSettled, self, setReady, thisDeviceReady]);

  if (!lobby) return null;

  const flash = (value: "shared" | "copied") => {
    setManualValue("");
    setNotice(value);
    window.setTimeout(() => setNotice(null), 2500);
  };

  /** The share sheet is what actually gets the room into Messenger. */
  const invite = async (code: string) => {
    const url = buildInviteUrl(window.location.origin, code);
    const outcome = await shareInvite(url, mn.online.inviteText(code));
    if (outcome === "unavailable") {
      // No clipboard and no share sheet — plain http. Show it to copy by hand.
      setManualValue(url);
      setNotice("failed");
      return;
    }
    flash(outcome === "shared" ? "shared" : "copied");
  };

  const copyCode = async (code: string) => {
    if (await copyText(code)) {
      flash("copied");
      return;
    }
    setManualValue(code);
    setNotice("failed");
  };

  const joinCode = lobby.joinCode;
  const everyoneReady =
    seated.length >= 2 && seated.every((player) => player.ready);

  const seatLabel = mn.online.seatCount(seated.length);
  const emptySeats = Math.max(0, MAX_PLAYERS - seated.length);

  const invitePanel = (
    <>
      <div className="relative">
        {/* An aperture ring behind the code: it is the one thing everyone in
            the room reads out, so it gets the screen's single moment. */}
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-9 hidden size-[186px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/20 anim-pulse-soft sm:block lg:left-0 lg:top-1/2 lg:size-[210px] lg:-translate-x-14"
          style={{
            boxShadow:
              "0 0 0 18px color-mix(in oklab, var(--primary) 5%, transparent), 0 0 80px -28px var(--primary)",
          }}
        />
        <p className="relative text-sm font-bold uppercase tracking-widest text-ink-3 lg:eyebrow-rule lg:text-xs">
          {mn.online.codeLabel}
        </p>
        <p
          className="relative font-display text-[clamp(2.5rem,13vw,5.5rem)] font-black leading-none tracking-[0.16em] text-transparent lg:text-[5rem]"
          style={{
            background:
              "linear-gradient(178deg,#f2ffd8 6%,var(--primary) 46%,#8fc22c 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            filter:
              "drop-shadow(0 0 30px color-mix(in oklab, var(--primary) 32%, transparent))",
          }}
        >
          {lobby.joinCode}
        </p>
        <p className="relative mx-auto mt-3 max-w-[26ch] text-sm leading-relaxed text-ink-2 lg:mx-0 lg:max-w-[34ch]">
          {mn.online.shareHint}
        </p>
      </div>

      {/* A lobby without a code cannot be shared — the local game has none. */}
      {joinCode && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 lg:justify-start">
          {/* Secondary: the room's one green action belongs to the footer. */}
          <GameButton
            size="sm"
            variant="ghost"
            block={false}
            onClick={() => void invite(joinCode)}
            icon={<Share2 className="size-4" strokeWidth={2.6} />}
          >
            {mn.online.inviteCta}
          </GameButton>
          {/* Icon-only: two labelled buttons side by side read as a choice the
              player has to make, when one is just a shortcut. */}
          <IconButton
            label={mn.online.copyCodeCta}
            onClick={() => void copyCode(joinCode)}
          >
            <Copy className="size-5" strokeWidth={2.4} />
          </IconButton>
        </div>
      )}

      {notice === "shared" || notice === "copied" ? (
        <p role="status" className="mt-2 text-sm font-bold text-primary">
          {notice === "shared" ? mn.online.shared : mn.online.copied}
        </p>
      ) : null}
      {notice === "failed" && (
        <p className="mx-auto mt-2 max-w-[30ch] text-xs text-ink-3 lg:mx-0">
          {mn.online.copyFailed}{" "}
          <span className="select-all break-all font-bold text-ink-2">
            {manualValue}
          </span>
        </p>
      )}

      <p className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface/60 px-3 py-1 text-sm font-bold text-ink-2 lg:hidden">
        {isMimicLobby ? (
          <ScanFace className="size-4" />
        ) : (
          <EnvironmentIcon environment={lobby.environment} className="size-4" />
        )}
        {isMimicLobby ? "Mimic Rush · Face Bomb" : mn.environment.options[lobby.environment].label}
      </p>

      {/* Desktop only: the column is tall enough that the invite alone leaves a
          hole, and waiting players have nothing else to read. */}
      <div className="mt-6 hidden flex-col gap-2.5 border-t border-line/45 pt-5 lg:flex">
        <span className="flex items-center gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-g1 border border-primary/30 text-primary">
            {isMimicLobby ? (
              <HeartPulse className="size-4" strokeWidth={2.4} />
            ) : (
              <Target className="size-4" strokeWidth={2.4} />
            )}
          </span>
          <span className="text-sm text-ink-2">
            {isMimicLobby ? mn.online.mimicFactLives : mn.online.factRounds}
          </span>
        </span>
        <span className="flex items-center gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-g1 border border-primary/30 text-primary">
            <Camera className="size-4" strokeWidth={2.2} />
          </span>
          <span className="text-sm text-ink-2">
            {isMimicLobby ? mn.online.mimicFactTurns : mn.online.factWatch}
          </span>
        </span>
      </div>
    </>
  );

  const roster = (
    <ul className="flex w-full max-w-sm flex-col gap-2 lg:max-w-none">
      {seated.map((player) => (
        <motion.li
          key={player.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className={[
            "flex items-center gap-3 rounded-g3 border bg-surface/60 px-3 py-2.5",
            player.ready ? "border-primary/25" : "border-line",
          ].join(" ")}
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
            <span className="text-xs font-bold text-ink-3">
              {!player.connected ? mn.online.disconnected : mn.online.checkingDevice}
            </span>
          )}
        </motion.li>
      ))}

      {/* Empty chairs: one player alone in a room read as a broken screen. */}
      {Array.from({ length: emptySeats }, (_, index) => (
        <li
          key={`empty-${index}`}
          className={[
            // A phone showing five empty chairs pushed the code off the top of
            // the screen. Two survive on a tall phone, none on a short one,
            // and the roomier card shows them all.
            index >= 2
              ? "hidden lg:flex"
              : "hidden [@media(min-height:720px)]:flex lg:flex",
            "items-center gap-3 rounded-g3 border border-dashed border-line/60 px-3 py-2.5",
          ].join(" ")}
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-g1 border border-dashed border-line/70 text-ink-3">
            <Users className="size-5" strokeWidth={2} />
          </span>
          <span className="text-sm font-semibold text-ink-3">
            {mn.online.emptySeat}
          </span>
        </li>
      ))}
    </ul>
  );

  const actions = (
    <div className="flex flex-col gap-2.5">
      <p
        role="status"
        className={[
          "text-center text-sm font-bold",
          thisDeviceReady ? "text-primary" : recognitionFailed ? "text-danger" : "text-ink-3",
        ].join(" ")}
      >
        {thisDeviceReady
          ? isMimicLobby ? mn.online.mimicReady : mn.online.deviceReady
          : !preflight.online
            ? mn.camera.steps.network.pending
            : preflight.lighting === "dark"
              ? mn.camera.steps.light.dark
              : status === "denied" || status === "unavailable"
                ? mn.camera.error.title
                : recognitionFailed
                  ? isMimicLobby ? mn.online.mimicUnavailable : mn.online.visionUnavailable
                  : mn.online.checkingDevice}
      </p>

      {(status === "denied" || status === "unavailable" || recognitionFailed) && (
        <GameButton
          variant="ghost"
          size="sm"
          onClick={() => {
            if (isMimicLobby && mimicTracker.status === "error") {
              setMimicAttempt((attempt) => attempt + 1);
            }
            else if (visionFailed) {
              setVisionFailed(false);
              setVisionAttempt((attempt) => attempt + 1);
            }
            else retry();
          }}
        >
          {mn.camera.error.retry}
        </GameButton>
      )}

      {/* The start button appears only once it can be pressed, so the screen
          never shows two green buttons competing for the eye. */}
      {lobby.isHost && everyoneReady && (
        <GameButton
          onClick={() => void start()}
          disabled={busy}
          icon={<Play className="size-6 fill-current" strokeWidth={0} />}
        >
          {mn.online.startCta}
        </GameButton>
      )}

      {lobby.isHost && !everyoneReady && (
        <p className="text-center text-sm font-semibold text-ink-3">
          {seated.length < 2 ? mn.online.needPlayers : mn.online.waitingAll}
        </p>
      )}

      <button
        type="button"
        onClick={() => void quit()}
        className="mx-auto px-3 py-2 text-sm font-bold text-ink-3 underline underline-offset-4"
      >
        {mn.online.leave}
      </button>
    </div>
  );

  const alert = errorCode ? (
    <p role="alert" className="text-center text-sm font-bold text-danger">
      {handoffErrorMessage(errorCode)}
    </p>
  ) : null;

  return (
    <Screen className="justify-between lg:justify-center">
      <div aria-hidden className="pointer-events-none absolute size-px overflow-hidden opacity-0">
        <CameraFrame
          stream={stream}
          facing={isMimicLobby ? "user" : facing}
          videoRef={videoRef}
          className="size-px"
        />
      </div>
      {/* Phone: one centred stack. From `lg`: a stage card whose left column
          holds the room and whose right column holds the people and the one
          green action. */}
      <div className="flex min-h-0 flex-1 flex-col lg:hidden">
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-y-auto no-scrollbar py-4 text-center">
          {invitePanel}
          <p className="text-sm text-ink-3">{seatLabel}</p>
          {roster}
          {alert}
        </div>
      </div>

      <div className="hidden min-h-0 flex-1 lg:grid lg:place-items-center lg:py-4">
        <div className="stage-card flex h-[min(700px,calc(100dvh-6rem))] w-full max-w-[1120px] flex-col overflow-hidden">
          <div className="stage-rule flex shrink-0 items-center justify-between gap-4 px-6 py-4">
            <span className="inline-flex items-center gap-2 font-display text-sm font-black tracking-tight text-ink">
              <span className="grid size-7 place-items-center rounded-lg bg-primary/15 text-primary">
                <Camera className="size-4" strokeWidth={2} />
              </span>
              CAMERA <span className="text-primary">QUEST</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line/70 bg-surface/70 px-3 py-1.5 text-xs font-semibold text-ink-2">
                {isMimicLobby ? (
                  <ScanFace className="size-3.5" />
                ) : (
                  <EnvironmentIcon
                    environment={lobby.environment}
                    className="size-3.5"
                  />
                )}
                {isMimicLobby
                  ? "Mimic Rush · Face Bomb"
                  : mn.environment.options[lobby.environment].label}
              </span>
              <span className="rounded-full border border-line/70 bg-surface/70 px-3 py-1.5 text-xs font-semibold text-ink-2">
                {seatLabel}
              </span>
            </span>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-[0.92fr_1.08fr]">
            <div className="flex min-h-0 flex-col justify-center px-8 py-7 text-left">
              {invitePanel}
            </div>

            <div className="stage-divide flex min-h-0 flex-col px-8 py-7">
              <p className="eyebrow-rule mb-3 text-xs font-bold uppercase tracking-widest text-ink-3">
                {mn.online.players}
              </p>
              <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
                {roster}
              </div>
              {alert}
              <div className="mt-5 shrink-0 border-t border-line/45 pt-5">
                {actions}
              </div>
            </div>
          </div>
        </div>
      </div>

      <ScreenFooter className="lg:hidden">{actions}</ScreenFooter>
    </Screen>
  );
}

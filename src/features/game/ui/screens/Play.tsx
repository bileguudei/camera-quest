"use client";

import { Check, ScanLine, X, XCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { BoundingBox } from "@/features/game/ui/components/BoundingBox";
import { CameraFrame } from "@/features/game/ui/components/CameraFrame";
import { ChallengeCard } from "@/features/game/ui/components/ChallengeCard";
import { Confetti } from "@/features/game/ui/components/Confetti";
import { GameButton, IconButton } from "@/features/game/ui/components/GameButton";
import { GameHeader } from "@/features/game/ui/components/GameHeader";
import { GameTimer } from "@/features/game/ui/components/GameTimer";
import { ScorePopup } from "@/features/game/ui/components/ScorePopup";
import { Screen } from "@/features/game/ui/components/Screen";
import { TargetFrame } from "@/features/game/ui/components/TargetFrame";
import { mn } from "@/content/mn";
import { TIMING } from "@/features/game/domain/config";
import { formatSeconds, scoreTurn } from "@/features/game/domain/scoring";
import { useGame } from "@/features/game/application/useGame";
import { useCameraContext } from "@/features/camera/CameraProvider";
import { DevPanel } from "camera-quest-dev-panel";
import { getGameRepository } from "@/features/game/infrastructure/createGameRepository";
import type { TurnOutcome } from "@/features/game/domain/types";
import { useVisionSession } from "@/features/vision/useVisionSession";
import type { VisionOutcome } from "@/features/vision/visionTypes";
import { remainingFromDeadline } from "@/features/game/domain/turnClock";

type Ending = { kind: "success"; timeMs: number; points: number } | { kind: "timeout" } | null;

const TICK_MS = 100;

export function Play() {
  const players = useGame((s) => s.players);
  const player = useGame((s) => s.currentPlayer());
  const challenge = useGame((s) => s.challenge);
  const round = useGame((s) => s.currentRound());
  const roundIndex = useGame((s) => s.roundIndex);
  const facing = useGame((s) => s.cameraFacing);
  const demo = useGame((s) => s.cameraMode) === "demo";
  const localMode = useGame((s) => s.backendMode === "local");
  const turnId = useGame((s) => s.turnId);
  const calibrationToken = useGame((s) => s.calibrationToken);
  const deadlineAtMs = useGame((s) => s.deadlineAtMs);
  const serverClockOffsetMs = useGame((s) => s.serverClockOffsetMs);
  const acceptOutcome = useGame((s) => s.acceptOutcome);
  const resolveTurn = useGame((s) => s.resolveTurn);
  const expireTurn = useGame((s) => s.expireTurn);
  const reportSystemError = useGame((s) => s.reportSystemError);
  const quitGame = useGame((s) => s.quitGame);

  const { stream } = useCameraContext();

  const totalMs = round.seconds * 1000;
  const [remaining, setRemaining] = useState(totalMs);
  const [ending, setEnding] = useState<Ending>(null);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const endedRef = useRef(false);
  const outcomeRef = useRef<TurnOutcome | null>(null);
  const deadlineOverrideRef = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (localMode) return;
    let alive = true;
    void getGameRepository()
      .getAccessToken()
      .then((token) => {
        if (alive) setAccessToken(token);
      })
      .catch((error: unknown) => {
        if (!alive) return;
        if (process.env.NODE_ENV === "development") {
          const cause = error instanceof Error ? `${error.name} — ${error.message}` : typeof error;
          console.error(`Camera Quest play token failed: ${cause}`);
        }
        reportSystemError();
      });
    return () => {
      alive = false;
    };
  }, [localMode, reportSystemError]);

  const handleRemotePass = useCallback((result: VisionOutcome) => {
    if (endedRef.current) return;
    endedRef.current = true;
    if (!player || !challenge) return;
    outcomeRef.current = {
      turnId: result.turnId,
      playerId: player.id,
      playerName: player.name,
      playerColor: player.color,
      challengeId: challenge.id,
      challengePrompt: challenge.prompt,
      success: true,
      timeMs: result.elapsedMs,
      points: result.points,
      xp: result.xp,
      totalAfter: result.totalScore,
      totalXp: result.totalXp,
      level: result.level,
      streak: result.streak,
      unlockedAchievementIds: result.unlockedAchievementIds,
    };
    setEnding({ kind: "success", timeMs: result.elapsedMs, points: result.points });
  }, [challenge, player]);

  const handleLocalMatch = useCallback(() => {
    if (endedRef.current) return;
    const elapsedMs = Math.max(0, totalMs - remaining);
    endedRef.current = true;
    setEnding({
      kind: "success",
      timeMs: elapsedMs,
      points: scoreTurn(round.difficulty, elapsedMs),
    });
  }, [remaining, round.difficulty, totalMs]);

  const handleRemoteExpired = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    setRemaining(0);
    setEnding({ kind: "timeout" });
  }, []);

  const running = ending === null && !confirmQuit;
  const vision = useVisionSession({
    videoRef,
    active: running && (localMode || (!demo && stream !== null)),
    turnId,
    calibrationToken,
    accessToken,
    localMode,
    onPass: handleRemotePass,
    onSystemError: reportSystemError,
    onExpired: handleRemoteExpired,
    onLocalMatch: handleLocalMatch,
  });
  const wrong = useRejection(vision.rejectedAt ?? 0, vision.note ?? "", running);
  const scanning = vision.status === "ready" && running;

  // Server deadline is absolute, so background-tab throttling cannot pause a turn.
  useEffect(() => {
    if (!deadlineAtMs || ending) return;
    const tick = () => {
      const deadline = deadlineOverrideRef.current ?? deadlineAtMs;
      const offset = deadlineOverrideRef.current ? 0 : serverClockOffsetMs;
      const left = remainingFromDeadline(deadline, offset);
      setRemaining(left);
      if (left <= 0 && !endedRef.current) {
        endedRef.current = true;
        setEnding({ kind: "timeout" });
      }
    };
    tick();
    const id = window.setInterval(() => {
      tick();
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [deadlineAtMs, ending, serverClockOffsetMs]);

  useEffect(() => {
    if (!ending) return;
    const hold = ending.kind === "success" ? TIMING.successHold : TIMING.failHold;
    const id = window.setTimeout(() => {
      if (ending.kind === "success") {
        if (outcomeRef.current) acceptOutcome(outcomeRef.current);
        else void resolveTurn(true, ending.timeMs);
        return;
      }
      void expireTurn().then((remainingMs) => {
        if (!remainingMs) return;
        deadlineOverrideRef.current = Date.now() + remainingMs;
        endedRef.current = false;
        setRemaining(remainingMs);
        setEnding(null);
      });
    }, hold);
    return () => window.clearTimeout(id);
  }, [acceptOutcome, ending, expireTurn, resolveTurn]);

  if (!player || !challenge) return null;

  const locking = vision.lock > 0.08 && !ending;

  return (
    <Screen padding="none" backdrop={false}>
      <CameraFrame
        stream={stream}
        facing={facing}
        demo={demo}
        videoRef={videoRef}
        dim={ending !== null}
        className="absolute inset-0 size-full"
      >
        {/* ── Top: round, scores, challenge ─────────────────────────────── */}
        <div className="absolute inset-x-0 top-0 z-20 mx-auto flex w-full max-w-3xl flex-col gap-2 px-safe pt-safe">
          <GameHeader
            round={roundIndex + 1}
            difficulty={round.difficulty}
            players={players}
            activeId={player.id}
            floating
            right={
              <IconButton
                label={mn.play.quit}
                onClick={() => setConfirmQuit(true)}
                className="size-9 bg-black/40"
              >
                <X className="size-4" strokeWidth={3} />
              </IconButton>
            }
          />

          <ChallengeCard challenge={challenge} />
        </div>

        {/* ── Full-camera recognition frame + detection overlay ────────── */}
        {!ending && (
          <TargetFrame
            state={
              vision.lock >= 1
                ? "found"
                : wrong
                  ? "wrong"
                  : locking
                    ? "locking"
                    : "idle"
            }
            lock={vision.lock}
            shakeKey={wrong?.key}
            hint={scanning ? mn.play.aim : mn.play.loading}
          />
        )}

        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10"
        >
          {!ending &&
            vision.detections.map((d) => (
              <BoundingBox
                key={d.id}
                detection={d}
                lock={vision.lock}
                mirrored={facing === "user"}
              />
            ))}
        </div>

        {/* ── Bottom: timer + recognition status ────────────────────────── */}
        <div className="absolute inset-x-0 bottom-0 z-20 mx-auto flex w-full max-w-3xl items-end justify-between gap-3 px-safe pb-safe">
          <GameTimer
            remainingMs={remaining}
            totalMs={totalMs}
            size={92}
          />

          <div className="flex min-w-0 flex-1 flex-col items-end gap-2">
            {challenge.kind === "color" && !ending && vision.colorFill > 0 && (
              <ColorMeter hex={challenge.hex ?? "#fff"} fill={vision.colorFill} />
            )}

            <AnimatePresence mode="wait">
              {wrong ? (
                <motion.span
                  key={`wrong-${wrong.key}`}
                  initial={{ opacity: 0, scale: 0.85, y: 6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 420, damping: 22 }}
                  role="status"
                  className="flex max-w-full items-center gap-1.5 rounded-full border-2 border-danger bg-danger/25 px-3 py-1 text-xs font-black text-ink backdrop-blur-[3px] sm:text-sm"
                  style={{ boxShadow: "0 0 26px -6px var(--danger)" }}
                >
                  <XCircle className="size-4 shrink-0 text-danger" strokeWidth={3} />
                  <span className="truncate">
                    {wrong.label ? mn.play.wrongIs(wrong.label) : mn.play.wrong}
                  </span>
                </motion.span>
              ) : (
                vision.note &&
                !ending && (
                  <motion.span
                    key="sees"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="max-w-full truncate rounded-full border border-accent/45 bg-accent/15 px-3 py-1 text-xs font-bold text-ink backdrop-blur-[3px] sm:text-sm"
                  >
                    {mn.play.aiSees(vision.note)}
                  </motion.span>
                )
              )}
            </AnimatePresence>

            <span
              className={[
                "inline-flex max-w-full items-center gap-2 rounded-full border px-3.5 py-2",
                "text-sm font-bold backdrop-blur-[3px] transition-colors sm:text-base",
                locking
                  ? "border-primary/60 bg-primary/18 text-primary"
                  : "border-white/12 bg-black/55 text-ink-2",
              ].join(" ")}
            >
              <ScanLine
                className={["size-4 shrink-0", locking ? "anim-pulse-soft" : ""].join(" ")}
                strokeWidth={2.8}
              />
              <span className="truncate">
                {vision.status === "loading"
                  ? mn.play.loading
                  : locking
                    ? mn.play.locking
                    : mn.play.scanning}
              </span>
            </span>
          </div>
        </div>

        {/* ── End-of-turn overlays ──────────────────────────────────────── */}
        <AnimatePresence>
          {ending?.kind === "success" && (
            <SuccessOverlay timeMs={ending.timeMs} points={ending.points} />
          )}
          {ending?.kind === "timeout" && <TimeoutOverlay prompt={challenge.prompt} />}
        </AnimatePresence>

        <AnimatePresence>
          {confirmQuit && (
            <QuitConfirm
              onCancel={() => setConfirmQuit(false)}
              onConfirm={() => void quitGame()}
            />
          )}
        </AnimatePresence>
      </CameraFrame>

      <DevPanel
        onSuccess={vision.forceMatch}
        onTimeout={() => {
          if (endedRef.current) return;
          endedRef.current = true;
          setRemaining(0);
          setEnding({ kind: "timeout" });
        }}
      />
    </Screen>
  );
}

/**
 * How long a "wrong thing" warning stays up. Slightly shorter than the engines'
 * repeat interval, so holding the wrong object pulses instead of sitting solid.
 */
const WRONG_MS = 1700;

/**
 * Turns the engine's rejection stamp into a short-lived warning. Keyed by the
 * stamp so every fresh verdict replays the animation, even for the same object.
 */
function useRejection(stamp: number, label: string, running: boolean) {
  const [expired, setExpired] = useState(0);

  useEffect(() => {
    if (!stamp) return;
    const id = window.setTimeout(() => setExpired(stamp), WRONG_MS);
    return () => window.clearTimeout(id);
  }, [stamp]);

  const showing = running && stamp !== 0 && expired !== stamp;
  return showing ? { key: stamp, label } : null;
}

/** Share of the frame matching the target colour. */
function ColorMeter({ hex, fill }: { hex: string; fill: number }) {
  return (
    <span className="flex items-center gap-2 rounded-full border border-white/12 bg-black/55 px-3 py-1.5 backdrop-blur-[3px]">
      <span
        aria-hidden
        className="size-4 shrink-0 rounded-full ring-2 ring-white/60"
        style={{ backgroundColor: hex }}
      />
      <span className="h-2 w-20 overflow-hidden rounded-full bg-white/15">
        <span
          className="block h-full rounded-full"
          style={{
            width: `${Math.round(fill * 100)}%`,
            backgroundColor: hex,
            transition: "width 120ms linear",
          }}
        />
      </span>
    </span>
  );
}

function SuccessOverlay({ timeMs, points }: { timeMs: number; points: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 px-6 text-center"
    >
      <Confetti intensity="burst" />

      <motion.span
        initial={{ scale: 0.2, rotate: -25 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 14 }}
        className="grid size-24 place-items-center rounded-full bg-primary text-primary-ink sm:size-28"
        style={{ boxShadow: "0 0 60px -6px var(--primary)" }}
      >
        <Check className="size-14 sm:size-16" strokeWidth={4} />
      </motion.span>

      <motion.h2
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 18, delay: 0.06 }}
        className="font-display text-[clamp(2.5rem,13vw,4.5rem)] font-black leading-none tracking-tight text-ink"
      >
        {mn.success.title}
      </motion.h2>

      <ScorePopup points={points} />

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.28 }}
        className="font-display text-lg font-bold text-ink-2 sm:text-xl"
      >
        {mn.success.seconds(formatSeconds(timeMs))}
      </motion.p>
    </motion.div>
  );
}

function TimeoutOverlay({ prompt }: { prompt: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 px-6 text-center"
    >
      <motion.span
        initial={{ scale: 0.4 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 18 }}
        className="text-6xl"
        aria-hidden
      >
        ⏰
      </motion.span>
      <h2 className="font-display text-[clamp(1.75rem,9vw,3rem)] font-black leading-none tracking-tight text-warn">
        {mn.fail.title}
      </h2>
      <p className="text-base text-ink-2 sm:text-lg">{mn.fail.task(prompt)}</p>
    </motion.div>
  );
}

function QuitConfirm({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal
      aria-label={mn.play.quitConfirm}
      className="absolute inset-0 z-50 flex items-center justify-center bg-bg/85 px-6"
    >
      <motion.div
        initial={{ scale: 0.9, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        className="w-full max-w-sm rounded-g4 border border-line bg-surface p-5 text-center"
      >
        <h2 className="mb-4 font-display text-xl font-black text-ink">
          {mn.play.quitConfirm}
        </h2>
        <div className="flex flex-col gap-2.5">
          <GameButton size="md" onClick={onCancel}>
            {mn.play.quitNo}
          </GameButton>
          <GameButton size="sm" variant="ghost" onClick={onConfirm}>
            {mn.play.quitYes}
          </GameButton>
        </div>
      </motion.div>
    </motion.div>
  );
}

"use client";

import { CameraOff, Cloud, Play, RefreshCw, SwitchCamera } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { CameraFrame } from "@/features/game/ui/components/CameraFrame";
import { GameButton, IconButton } from "@/features/game/ui/components/GameButton";
import { Screen, ScreenFooter } from "@/features/game/ui/components/Screen";
import { StatusBadge, type StatusState } from "@/features/game/ui/components/StatusBadge";
import { mn } from "@/content/mn";
import { useGame } from "@/features/game/application/useGame";
import { useCameraContext } from "@/features/camera/CameraProvider";
import { getGameRepository } from "@/features/game/infrastructure/createGameRepository";
import { warmVisionService } from "@/features/vision/visionClient";
import { publicEnv } from "@/shared/env/publicEnv";
import { useCameraPreflight } from "@/features/camera/cameraPreflight";

const fastDevelopmentFlow =
  process.env.NODE_ENV === "development" && publicEnv.devControlsEnabled;
const MODEL_MS = fastDevelopmentFlow ? 30 : 950;
/** Breathing room after the model lands, so step 3 isn't a flash. */
const WARMUP_MS = fastDevelopmentFlow ? 30 : 700;
const WARMUP_RETRY_BASE_MS = fastDevelopmentFlow ? 50 : 1_500;
const WARMUP_RETRY_MAX_MS = fastDevelopmentFlow ? 100 : 6_000;

export const warmupRetryDelay = (attempt: number) =>
  Math.min(WARMUP_RETRY_BASE_MS * 2 ** Math.min(attempt, 3), WARMUP_RETRY_MAX_MS);

export function CameraCheck() {
  const facing = useGame((s) => s.cameraFacing);
  const toggleFacing = useGame((s) => s.toggleCameraFacing);
  const cameraMode = useGame((s) => s.cameraMode);
  const setCameraMode = useGame((s) => s.setCameraMode);
  const startGame = useGame((s) => s.startGame);
  const backendMode = useGame((s) => s.backendMode);
  const busy = useGame((s) => s.busy);
  const gameError = useGame((s) => s.errorCode);

  const { stream, status, retry } = useCameraContext();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const demo = cameraMode === "demo";
  const cameraOk = status === "ready" || demo;
  const failed = !demo && (status === "denied" || status === "unavailable");

  const [modelDone, setModelDone] = useState(false);
  const [readyDone, setReadyDone] = useState(false);
  const [warmupAttempt, setWarmupAttempt] = useState(0);
  const [warmupFailed, setWarmupFailed] = useState(false);
  const preflight = useCameraPreflight(videoRef, status, demo);

  // The checklist only ever counts while the camera is live.
  const modelOk = cameraOk && modelDone;
  const readyOk = cameraOk && readyDone;

  // Warm Modal during camera check; no inference model is downloaded by the browser.
  useEffect(() => {
    if (demo || backendMode === "local") {
      const t = window.setTimeout(() => setModelDone(true), MODEL_MS);
      return () => {
        window.clearTimeout(t);
        setModelDone(false);
      };
    }

    if (!publicEnv.visionEnabled) {
      return;
    }

    let alive = true;
    let retryTimer = 0;
    const controller = new AbortController();
    void getGameRepository()
      .getAccessToken()
      .then((token) => warmVisionService(token, controller.signal))
      .then(() => {
        if (alive) {
          setWarmupFailed(false);
          setModelDone(true);
        }
      })
      .catch((error: unknown) => {
        if (!alive || (error instanceof DOMException && error.name === "AbortError")) return;
        setWarmupFailed(true);
        setModelDone(false);
        retryTimer = window.setTimeout(
          () => setWarmupAttempt((attempt) => attempt + 1),
          warmupRetryDelay(warmupAttempt),
        );
      });
    return () => {
      alive = false;
      controller.abort();
      window.clearTimeout(retryTimer);
    };
  }, [backendMode, demo, warmupAttempt]);

  useEffect(() => {
    if (!cameraOk || !modelDone) return;
    const t = window.setTimeout(() => setReadyDone(true), WARMUP_MS);
    return () => {
      window.clearTimeout(t);
      setReadyDone(false);
    };
  }, [cameraOk, modelDone]);

  const connectivityOk = backendMode === "local" || preflight.online;
  const allReady =
    cameraOk && modelOk && readyOk && connectivityOk && preflight.lighting === "good";
  const backendUnavailable = backendMode === "unavailable";
  const showWarmupFailure = warmupFailed && backendMode === "supabase" && !demo;

  const stateOf = (done: boolean, unlocked: boolean): StatusState =>
    done ? "done" : unlocked ? "active" : "pending";

  return (
    <Screen>
      <header className="flex shrink-0 items-center justify-between gap-3 pb-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-black leading-tight tracking-tight text-ink sm:text-3xl">
            {mn.camera.title}
          </h1>
          <p className="text-sm text-ink-3 text-clip-1">{mn.camera.sub}</p>
        </div>

        <IconButton
          label={`${mn.camera.switch} (${facing === "user" ? mn.camera.front : mn.camera.rear})`}
          onClick={toggleFacing}
          disabled={demo}
          className="disabled:opacity-40"
        >
          <SwitchCamera className="size-5" strokeWidth={2.4} />
        </IconButton>
      </header>

      <div className="relative min-h-0 flex-1">
        <AnimatePresence mode="wait">
          {failed ? (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="flex h-full flex-col items-center justify-center gap-4 rounded-g4 border border-danger/35 bg-danger/8 p-6 text-center"
            >
              <span className="grid size-16 place-items-center rounded-full bg-danger/18 text-danger">
                <CameraOff className="size-8" strokeWidth={2.4} />
              </span>
              <h2 className="font-display text-xl font-black leading-tight text-ink sm:text-2xl">
                {mn.camera.error.title}
              </h2>
              <p className="max-w-sm text-sm leading-relaxed text-ink-2">
                {mn.camera.error.body}
              </p>
              <div className="flex w-full max-w-xs flex-col gap-2.5 pt-1">
                <GameButton
                  size="md"
                  onClick={retry}
                  icon={<RefreshCw className="size-5" strokeWidth={2.6} />}
                >
                  {mn.camera.error.retry}
                </GameButton>
                {process.env.NODE_ENV === "development" && publicEnv.devControlsEnabled && (
                  <GameButton size="sm" variant="ghost" onClick={() => setCameraMode("demo")}>
                    {mn.camera.error.demo}
                  </GameButton>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="preview"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="h-full"
            >
              <CameraFrame
                stream={stream}
                facing={facing}
                demo={demo}
                videoRef={videoRef}
                className="size-full rounded-g4 border border-line/70"
              >
                {demo && (
                  <span className="absolute left-3 top-3 rounded-full border border-warn/50 bg-black/60 px-2.5 py-1 text-xs font-bold text-warn backdrop-blur-[3px]">
                    {mn.camera.demoBadge}
                  </span>
                )}

                <div className="absolute inset-x-0 bottom-0 p-2.5">
                  <AnimatePresence>
                    {allReady && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ type: "spring", stiffness: 300, damping: 20 }}
                        className="mb-2 flex justify-center"
                      >
                        <span className="rounded-full bg-primary px-4 py-1.5 font-display text-sm font-black text-primary-ink shadow-[0_0_30px_-6px_var(--primary)]">
                          {mn.camera.allReady}
                        </span>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <ul className="flex flex-col gap-1.5 rounded-g3 border border-white/10 bg-black/62 p-2 backdrop-blur-[3px]">
                    <StatusBadge
                      state={stateOf(cameraOk, true)}
                      pendingLabel={mn.camera.steps.camera.pending}
                      doneLabel={mn.camera.steps.camera.done}
                    />
                    <StatusBadge
                      state={stateOf(connectivityOk, true)}
                      pendingLabel={mn.camera.steps.network.pending}
                      doneLabel={mn.camera.steps.network.done}
                    />
                    <StatusBadge
                      state={stateOf(preflight.lighting === "good", cameraOk)}
                      pendingLabel={
                        preflight.lighting === "dark"
                          ? mn.camera.steps.light.dark
                          : mn.camera.steps.light.pending
                      }
                      doneLabel={mn.camera.steps.light.done}
                    />
                    <StatusBadge
                      state={stateOf(modelOk, cameraOk)}
                      pendingLabel={mn.camera.steps.model.pending}
                      doneLabel={mn.camera.steps.model.done}
                    />
                    <StatusBadge
                      state={stateOf(readyOk, modelOk)}
                      pendingLabel={mn.camera.steps.ready.pending}
                      doneLabel={mn.camera.steps.ready.done}
                    />
                  </ul>
                </div>

              </CameraFrame>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mx-auto mt-3 flex w-full max-w-md items-center gap-2 rounded-g3 border border-line bg-surface/60 px-3 py-2.5 text-sm text-ink-2">
        <Cloud className="size-5 shrink-0 text-accent" strokeWidth={2.4} />
        <span className="min-w-0 flex-1">
          {backendMode === "supabase"
            ? "Cloud AI · frame хадгалахгүй"
            : backendMode === "local"
              ? "Local development adapter"
              : "Production backend тохируулагдаагүй"}
        </span>
        {showWarmupFailure ? (
          <button
            type="button"
            onClick={() => {
              setWarmupFailed(false);
              setWarmupAttempt((attempt) => attempt + 1);
            }}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-accent/40 px-2.5 py-1 text-xs font-bold text-accent transition hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Дахин
          </button>
        ) : null}
      </div>

      {showWarmupFailure ? (
        <p role="alert" className="mt-2 text-center text-sm font-bold text-warn">
          AI түр ачаалалтай байна. Автоматаар дахин оролдож байна.
        </p>
      ) : null}

      {(gameError || backendUnavailable) && (
        <p role="alert" className="mt-2 text-center text-sm font-bold text-danger">
          Тоглоомын backend-тэй холбогдож чадсангүй. Дахин оролдоно уу.
        </p>
      )}

      <ScreenFooter>
        <GameButton
          onClick={startGame}
          disabled={!allReady || busy || backendUnavailable}
          icon={<Play className="size-6 fill-current" strokeWidth={0} />}
        >
          {allReady && !busy ? mn.camera.cta : mn.camera.ctaWaiting}
        </GameButton>
      </ScreenFooter>
    </Screen>
  );
}

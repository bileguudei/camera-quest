"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowLeft,
  Camera,
  CircleCheckBig,
  FastForward,
  Gauge,
  LoaderCircle,
  LockKeyhole,
  RotateCcw,
  ScanFace,
  Sparkles,
  Timer,
  Trophy,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { publicEnv } from "@/shared/env/publicEnv";
import { useCamera } from "@/features/camera/useCamera";
import { CameraFrame } from "@/features/game/ui/components/CameraFrame";
import { GameButton } from "@/features/game/ui/components/GameButton";
import { Screen, ScreenFooter } from "@/features/game/ui/components/Screen";
import {
  HOLD_DURATION_MS,
  initialMimicGameState,
  mimicGameReducer,
  ROUND_DURATION_MS,
} from "../application/mimicGameReducer";
import { useMimicAudio } from "../application/useMimicAudio";
import { useMimicTracker } from "../application/useMimicTracker";
import {
  MIMIC_ROUNDS,
  PASS_SCORE,
  buildMimicBaseline,
  evaluateMimic,
  framingHint,
  isSelfieFramed,
  type MimicBaseline,
  type MimicObservation,
  type MimicRound,
  type MimicScoreComponent,
} from "../domain/mimicRules";
import { MimicProgressRing } from "./MimicProgressRing";

const FACE_FEATURES = [
  { Icon: Sparkles, label: "Expression Fusion" },
  { Icon: Gauge, label: "Танд тааруулна" },
  { Icon: Timer, label: "7 секунд" },
  { Icon: LockKeyhole, label: "Зураг хадгалахгүй" },
] as const;

const LOAD_LABELS = {
  runtime: "Нүүрний танилт бэлдэж байна",
  face: "Нүүрний model ачаалж байна",
} as const;

const CALIBRATION_DURATION_MS = 650;
const MIN_BASELINE_SAMPLES = 5;
const EMPTY_BASELINE: MimicBaseline = { blendshapes: {}, headPose: null };

const isPlayableStage = (stage: string) =>
  stage === "loading" ||
  stage === "framing" ||
  stage === "countdown" ||
  stage === "playing" ||
  stage === "roundResult";

export function MimicRush() {
  const [state, dispatch] = useReducer(mimicGameReducer, initialMimicGameState);
  const [countdown, setCountdown] = useState(3);
  const [frameHint, setFrameHint] = useState("Нүүрээ кадрын төвд оруулаарай");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const framedSinceRef = useRef<number | null>(null);
  const baselineSamplesRef = useRef<MimicObservation[]>([]);
  const baselineRef = useRef<MimicBaseline>(EMPTY_BASELINE);
  const stageRef = useRef(state.stage);
  const roundIndexRef = useRef(state.roundIndex);
  const soundedOutcomeCountRef = useRef(0);
  const victorySoundedRef = useRef(false);
  const reducedMotion = useReducedMotion();
  const { muted, setMuted, prepare: prepareAudio, play: playAudio } = useMimicAudio();
  const active = isPlayableStage(state.stage);
  const rounds = MIMIC_ROUNDS;
  const currentRound = rounds[state.roundIndex] ?? rounds[0];
  const demo =
    process.env.NODE_ENV !== "production" &&
    publicEnv.devControlsEnabled &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("demo") === "1";

  useEffect(() => {
    stageRef.current = state.stage;
    roundIndexRef.current = state.roundIndex;
  }, [state.roundIndex, state.stage]);

  const camera = useCamera(active && !demo, "user");

  const resetCalibration = useCallback(() => {
    framedSinceRef.current = null;
    baselineSamplesRef.current = [];
    baselineRef.current = EMPTY_BASELINE;
    soundedOutcomeCountRef.current = 0;
    victorySoundedRef.current = false;
  }, []);

  const handleObservation = useCallback((observation: MimicObservation, timestamp: number) => {
    if (stageRef.current === "framing") {
      const framed = isSelfieFramed(observation.faceLandmarks);
      if (!framed) {
        framedSinceRef.current = null;
        baselineSamplesRef.current = [];
        setFrameHint(framingHint(observation.faceLandmarks));
        return;
      }

      setFrameHint("Нүүрээ тайван байлгаарай — танилтаа танд тааруулж байна");
      if (framedSinceRef.current === null) framedSinceRef.current = timestamp;
      if (baselineSamplesRef.current.length < 12) {
        baselineSamplesRef.current.push(observation);
      }
      if (
        timestamp - framedSinceRef.current >= CALIBRATION_DURATION_MS &&
        baselineSamplesRef.current.length >= MIN_BASELINE_SAMPLES
      ) {
        baselineRef.current = buildMimicBaseline(baselineSamplesRef.current);
        framedSinceRef.current = null;
        dispatch({ type: "FRAMED" });
      }
      return;
    }

    if (stageRef.current === "playing") {
      const round = MIMIC_ROUNDS[roundIndexRef.current];
      if (round) {
        const evaluation = evaluateMimic(round.id, observation, baselineRef.current);
        dispatch({
          type: "SAMPLE",
          score: evaluation.score,
          feedback: evaluation.feedback,
          components: evaluation.components,
          at: timestamp,
        });
      }
    }
  }, []);

  const tracker = useMimicTracker({
    active: active && !demo,
    videoRef,
    onObservation: handleObservation,
    onError: (message) => dispatch({ type: "ERROR", message }),
  });

  useEffect(() => {
    if (state.stage !== "loading") return;
    if (demo || (camera.isReady && tracker.status === "ready")) dispatch({ type: "READY" });
  }, [camera.isReady, demo, state.stage, tracker.status]);

  useEffect(() => {
    if (!active || demo) return;
    if (camera.status === "denied") {
      dispatch({ type: "ERROR", message: "Камерын зөвшөөрөл хэрэгтэй байна" });
    } else if (camera.status === "unavailable") {
      dispatch({ type: "ERROR", message: "Энэ төхөөрөмж дээр камер олдсонгүй" });
    }
  }, [active, camera.status, demo]);

  useEffect(() => {
    if (!demo || state.stage !== "framing") return;
    baselineRef.current = EMPTY_BASELINE;
    const timer = window.setTimeout(() => dispatch({ type: "FRAMED" }), 350);
    return () => window.clearTimeout(timer);
  }, [demo, state.stage]);

  useEffect(() => {
    if (state.stage !== "countdown") return;
    const reset = window.setTimeout(() => setCountdown(3), 0);
    const two = window.setTimeout(() => setCountdown(2), 1_000);
    const one = window.setTimeout(() => setCountdown(1), 2_000);
    const go = window.setTimeout(
      () => dispatch({ type: "COUNTDOWN_COMPLETE", at: performance.now() }),
      3_000,
    );
    return () => {
      window.clearTimeout(reset);
      window.clearTimeout(two);
      window.clearTimeout(one);
      window.clearTimeout(go);
    };
  }, [state.stage]);

  useEffect(() => {
    if (state.stage !== "playing") return;
    const timer = window.setInterval(
      () => dispatch({ type: "TICK", at: performance.now() }),
      100,
    );
    return () => window.clearInterval(timer);
  }, [state.stage, state.roundIndex]);

  useEffect(() => {
    if (!demo || state.stage !== "playing") return;
    const demoComponent = {
      id: currentRound.id,
      label:
        currentRound.kind === "motion-fusion"
          ? "Face + head"
          : "Expression Fusion",
      score: 0.98,
    };
    const first = window.setTimeout(
      () =>
        dispatch({
          type: "SAMPLE",
          score: 0.96,
          feedback: "Яг зөв — бариарай!",
          components: [demoComponent],
          at: performance.now(),
        }),
      300,
    );
    const held = window.setTimeout(
      () =>
        dispatch({
          type: "SAMPLE",
          score: 0.98,
          feedback: "Яг зөв — бариарай!",
          components: [demoComponent],
          at: performance.now(),
        }),
      300 + HOLD_DURATION_MS + 140,
    );
    return () => {
      window.clearTimeout(first);
      window.clearTimeout(held);
    };
  }, [currentRound.id, currentRound.kind, demo, state.roundIndex, state.stage]);

  useEffect(() => {
    if (state.stage !== "roundResult") return;
    if (soundedOutcomeCountRef.current !== state.outcomes.length) {
      soundedOutcomeCountRef.current = state.outcomes.length;
      if (state.lastResult?.success) {
        navigator.vibrate?.(state.combo >= 5 ? [35, 30, 55, 30, 95] : [35, 35, 80]);
        playAudio(state.combo >= 5 ? "combo" : "success");
      } else {
        playAudio("miss");
      }
    }
    const timer = window.setTimeout(
      () => dispatch({ type: "NEXT", at: performance.now() }),
      1_050,
    );
    return () => window.clearTimeout(timer);
  }, [playAudio, state.combo, state.lastResult?.success, state.outcomes.length, state.stage]);

  useEffect(() => {
    if (state.stage !== "finished" || victorySoundedRef.current) return;
    victorySoundedRef.current = true;
    playAudio("victory");
    navigator.vibrate?.([50, 35, 70, 35, 120]);
  }, [playAudio, state.stage]);

  if (state.stage === "intro") {
    return (
      <MimicIntro
        onStart={() => {
          prepareAudio();
          resetCalibration();
          dispatch({ type: "START" });
        }}
      />
    );
  }
  if (state.stage === "finished") {
    return (
      <MimicFinished
        totalScore={state.totalScore}
        maxCombo={state.maxCombo}
        outcomes={state.outcomes}
        rounds={rounds}
        onPlayAgain={() => {
          resetCalibration();
          dispatch({ type: "PLAY_AGAIN" });
        }}
      />
    );
  }
  if (state.stage === "error") {
    return (
      <MimicError
        message={state.errorMessage ?? "Mimic Rush эхэлж чадсангүй"}
        onRetry={() => {
          resetCalibration();
          dispatch({ type: "PLAY_AGAIN" });
        }}
      />
    );
  }

  return (
    <section className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-bg">
      <CameraFrame
        stream={camera.stream}
        facing="user"
        demo={demo}
        videoRef={videoRef}
        className="size-full flex-1"
        dim={state.stage === "loading"}
      >
        <div className="absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-2 px-safe pt-safe">
          <Link
            href="/"
            aria-label="Нүүр хуудас руу буцах"
            className="grid size-11 shrink-0 place-items-center rounded-full border border-line/80 bg-bg/75 text-ink-2 backdrop-blur-md"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div className="flex items-center gap-2 rounded-full border border-line/70 bg-bg/75 px-3 py-2 font-display text-xs font-black backdrop-blur-md">
            <span>{state.roundIndex + 1}/{rounds.length}</span>
            <span className="text-primary">{state.totalScore.toLocaleString()} оноо</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setMuted(!muted)}
              aria-label={muted ? "Дуу асаах" : "Дуу хаах"}
              className="pointer-events-auto grid size-10 place-items-center rounded-full border border-line/70 bg-bg/75 text-ink-2 backdrop-blur-md"
            >
              {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
            </button>
            <motion.div
              animate={
                state.stage === "playing" && state.remainingMs <= 3_000 && !reducedMotion
                  ? { scale: [1, 1.1, 1] }
                  : { scale: 1 }
              }
              transition={{ repeat: Infinity, duration: 0.72, ease: "easeInOut" }}
              className="grid min-w-11 place-items-center rounded-full border border-line/70 bg-bg/75 px-2 py-2 font-display text-sm font-black text-warn backdrop-blur-md"
            >
              {Math.ceil(state.remainingMs / 1_000)}с
            </motion.div>
          </div>
        </div>

        {state.stage === "loading" ? (
          <CenteredPanel>
            <LoaderCircle className="mx-auto size-12 animate-spin text-primary" />
            <h1 className="mt-4 font-display text-2xl font-black">MIMIC RUSH</h1>
            <p className="mt-2 text-sm font-bold text-ink-2">
              {tracker.loadStage ? LOAD_LABELS[tracker.loadStage] : "Камер нээж байна"}
            </p>
            <div className="mx-auto mt-4 h-1.5 w-44 overflow-hidden rounded-full bg-line/70">
              <motion.div
                className="h-full w-1/2 rounded-full bg-primary"
                animate={{ x: ["-100%", "200%"] }}
                transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}
              />
            </div>
          </CenteredPanel>
        ) : null}

        {state.stage === "framing" ? (
          <div className="absolute inset-0 z-20 grid place-items-center px-6">
            <div className="relative grid h-[52vh] max-h-[32rem] w-[78vw] max-w-[22rem] place-items-center rounded-[46%] border-2 border-dashed border-primary/70 shadow-[0_0_50px_rgba(182,242,60,0.16)]">
              <ScanFace className="size-20 text-primary/80" strokeWidth={1.3} />
            </div>
            <div className="absolute inset-x-5 bottom-[max(env(safe-area-inset-bottom),1.25rem)] rounded-3xl border border-line/70 bg-bg/82 p-4 text-center backdrop-blur-xl">
              <p className="font-display text-lg font-black text-primary">Selfie хүрээнд ороорой</p>
              <p className="mt-1 text-sm font-bold text-ink-2">{demo ? "Гоё! Энэ selfie зай яг тохирно" : frameHint}</p>
              <p className="mt-2 text-xs text-ink-3">Нүүр + мөр байхад хангалттай, холдох хэрэггүй</p>
            </div>
          </div>
        ) : null}

        {state.stage === "countdown" ? (
          <div className="absolute inset-0 z-20 grid place-items-center bg-bg/38 backdrop-blur-[2px]">
            <motion.div
              key={countdown}
              initial={{ scale: 0.45, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-center"
            >
              <div className="mx-auto mb-4 grid size-20 place-items-center rounded-full border border-primary/45 bg-bg/70 text-primary">
                <ScanFace className="size-10" strokeWidth={1.6} />
              </div>
              <p className="font-display text-8xl font-black text-primary">{countdown}</p>
              <p className="mt-2 font-display text-xl font-black">{currentRound.title}</p>
            </motion.div>
          </div>
        ) : null}

        {state.stage === "playing" && state.remainingMs <= 3_000 ? (
          <div
            aria-hidden
            data-testid="time-pressure-pulse"
            className="pointer-events-none absolute inset-0 z-[17] rounded-[inherit] border-[clamp(4px,1.2vw,10px)] border-warn/70 cq-time-pressure"
          />
        ) : null}

        {state.stage === "playing" || state.stage === "roundResult" ? (
          <MimicHud
            round={currentRound}
            holdProgress={state.holdProgress}
            liveScore={state.liveScore}
            combo={state.combo}
            remainingMs={state.remainingMs}
            feedback={state.liveFeedback}
            components={state.liveComponents}
          />
        ) : null}

        {state.stage === "roundResult" ? (
          <div className="absolute inset-0 z-40 grid place-items-center bg-bg/42 backdrop-blur-[2px]">
            <AnimatePresence>
              {state.lastResult?.success ? (
                <motion.div
                  key="success-flash"
                  aria-hidden
                  initial={{ opacity: 0.72 }}
                  animate={{ opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reducedMotion ? 0.01 : 0.46, ease: "easeOut" }}
                  className="pointer-events-none absolute inset-0 bg-white"
                />
              ) : null}
            </AnimatePresence>
            {state.lastResult?.success ? (
              <motion.div
                aria-hidden
                initial={{ opacity: 0.9, scale: 0.78 }}
                animate={{ opacity: 0, scale: reducedMotion ? 1 : 1.08 }}
                transition={{ duration: reducedMotion ? 0.01 : 0.8, ease: "easeOut" }}
                className="pointer-events-none absolute inset-3 rounded-[2rem] border-4 border-primary shadow-[inset_0_0_72px_rgba(182,242,60,0.45),0_0_54px_rgba(36,211,224,0.5)]"
              />
            ) : null}
            <motion.div
              initial={{ scale: 0.62, rotate: -4 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 19 }}
              className="relative overflow-hidden rounded-[2rem] border border-line/80 bg-surface/92 px-8 py-7 text-center shadow-2xl"
            >
              {state.lastResult?.success ? (
                <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent" />
              ) : null}
              <div className={`mx-auto grid size-20 place-items-center rounded-full border ${state.lastResult?.success ? "border-success/45 bg-success/12 text-success" : "border-warn/45 bg-warn/12 text-warn"}`}>
                {state.lastResult?.success ? (
                  <CircleCheckBig className="size-10" strokeWidth={2.2} />
                ) : (
                  <FastForward className="size-10" strokeWidth={2.2} />
                )}
              </div>
              <p className={`mt-4 font-display text-3xl font-black ${state.lastResult?.success ? "text-success" : "text-warn"}`}>
                {state.lastResult?.success ? "АМЖИЛТТАЙ!" : "ДАРААГИЙНХ!"}
              </p>
              {state.lastResult?.success ? (
                <>
                  <p className="mt-2 text-xl font-black text-primary">+{state.lastResult.points} оноо</p>
                  <p className="mt-1 text-sm font-black text-accent-2">COMBO x{state.combo}</p>
                </>
              ) : (
                <p className="mt-2 text-sm font-bold text-ink-2">Combo дахин эхэлнэ</p>
              )}
            </motion.div>
          </div>
        ) : null}
      </CameraFrame>
    </section>
  );
}

function MimicIntro({ onStart }: { onStart: () => void }) {
  return (
    <Screen className="no-scrollbar justify-between overflow-y-auto">
      <div className="flex items-center justify-between">
        <Link
          href="/"
          aria-label="Нүүр хуудас руу буцах"
          className="grid size-11 place-items-center rounded-full border border-line bg-surface-2 text-ink-2"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <span className="font-display text-sm font-black">CAMERA <span className="text-primary">QUEST</span></span>
      </div>

      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-[clamp(0.65rem,1.7vh,1.15rem)] py-3 text-center">
        <motion.div
          initial={{ scale: 0.7, rotate: -8 }}
          animate={{ scale: 1, rotate: 0 }}
          className="relative grid size-[clamp(5.5rem,14vh,8.5rem)] place-items-center rounded-[1.8rem] border border-primary/40 bg-primary/10 shadow-[0_0_60px_rgba(182,242,60,0.18)]"
        >
          <ScanFace className="size-12 text-primary sm:size-14" strokeWidth={1.8} />
          <span className="absolute -bottom-3 rounded-full border border-accent-2/35 bg-bg px-3 py-1 text-[10px] font-black tracking-[0.18em] text-accent-2">
            FACE ONLY
          </span>
        </motion.div>

        <div>
          <div className="mx-auto mb-2 w-fit rounded-full border border-accent-2/35 bg-accent-2/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-accent-2">
            EXPRESSION FUSION · ON-DEVICE
          </div>
          <h1 className="font-display text-[clamp(2.35rem,10vw,4.6rem)] font-black leading-[0.85] tracking-tight">
            MIMIC <span className="text-primary">RUSH</span>
          </h1>
          <p className="mx-auto mt-4 max-w-sm text-balance text-sm font-bold leading-relaxed text-ink-2 sm:text-base">
            Утсаа ердийн selfie зайд барина. <span className="text-ink">Нүүр, мөр л хангалттай.</span>
          </p>
        </div>

        <div className="grid w-full grid-cols-4 gap-1.5">
          {FACE_FEATURES.map(({ Icon, label }) => (
            <div key={label} className="rounded-xl border border-line/70 bg-surface-2/70 px-1 py-2">
              <Icon className="mx-auto size-4.5 text-primary sm:size-5" strokeWidth={1.8} />
              <p className="mt-1 text-[8px] font-black leading-tight text-ink-2 sm:text-[10px]">{label}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs font-bold text-ink-3">
          <Zap className="size-4 text-warn" /> {MIMIC_ROUNDS.length} fusion challenge · combo оноо
        </div>
      </div>

      <ScreenFooter>
        <GameButton
          onClick={onStart}
          icon={<Camera className="size-6" strokeWidth={2.5} />}
        >
          Mimic Rush эхлүүлэх
        </GameButton>
        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[11px] text-ink-3">
          <LockKeyhole className="size-3.5" /> Зураг хадгалахгүй · энэ төхөөрөмж дээр танина
        </p>
      </ScreenFooter>
    </Screen>
  );
}

function MimicHud({
  round,
  holdProgress,
  liveScore,
  combo,
  remainingMs,
  feedback,
  components,
}: {
  round: MimicRound;
  holdProgress: number;
  liveScore: number;
  combo: number;
  remainingMs: number;
  feedback: string;
  components: readonly MimicScoreComponent[];
}) {
  const RoundIcon = round.kind === "motion-fusion" ? RotateCcw : Sparkles;
  const kindLabel =
    round.kind === "motion-fusion" ? "FACE + HEAD FUSION" : "EXPRESSION FUSION";
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <motion.div
        key={round.id}
        initial={{ y: -20, opacity: 0, scale: 0.9 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        className="absolute left-1/2 top-[calc(max(env(safe-area-inset-top),0.75rem)+3.6rem)] w-[min(88vw,26rem)] -translate-x-1/2 rounded-3xl border border-primary/35 bg-bg/78 px-4 py-3 text-center backdrop-blur-xl"
      >
        <div className="flex items-center justify-center gap-2">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
            <RoundIcon className="size-5" strokeWidth={1.8} />
          </div>
          <div className="text-left">
            <p className="mb-1 text-[8px] font-black tracking-[0.18em] text-accent-2">{kindLabel}</p>
            <h2 className="font-display text-lg font-black leading-none text-primary sm:text-xl">{round.title}</h2>
            <p className="mt-1 text-[11px] font-bold text-ink-2 sm:text-xs">{round.instruction}</p>
          </div>
        </div>
      </motion.div>

      {combo > 0 ? (
        <div className="absolute right-4 top-[8.6rem] rounded-full border border-accent-2/40 bg-accent-2/15 px-3 py-1 text-xs font-black text-accent-2">
          COMBO x{combo}
        </div>
      ) : null}

      <div className="absolute inset-x-3 bottom-[max(env(safe-area-inset-bottom),0.75rem)] mx-auto grid max-w-lg grid-cols-[5.6rem_1fr] items-center gap-3 rounded-[1.75rem] border border-line/70 bg-bg/82 p-3 shadow-[0_18px_50px_rgba(0,0,0,0.38)] backdrop-blur-xl">
        <MimicProgressRing score={liveScore} holdProgress={holdProgress} />
        <div className="min-w-0 text-left">
          <p className={`text-[10px] font-black tracking-[0.12em] ${liveScore >= PASS_SCORE ? "text-primary" : "text-ink-3"}`}>
            {liveScore >= PASS_SCORE ? "БАРИАРАЙ" : "LIVE COACH"}
          </p>
          <p aria-live="polite" className="mt-1 text-[11px] font-black leading-tight text-ink sm:text-xs">
            {feedback}
          </p>
          {components.length > 0 ? (
            <div className="mt-2 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(2, components.length)}, minmax(0, 1fr))` }}>
              {components.slice(0, 2).map((item) => (
                <div key={item.id} className="min-w-0">
                  <div className="flex items-center justify-between gap-1 text-[8px] font-black text-ink-3">
                    <span className="truncate">{item.label}</span>
                    <span>{Math.round(item.score * 100)}%</span>
                  </div>
                  <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-line/60">
                    <div
                      className={`h-full rounded-full transition-[width] duration-100 ${item.score >= PASS_SCORE ? "bg-primary" : "bg-accent-2"}`}
                      style={{ width: `${Math.max(0, Math.min(1, item.score)) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          <div className="mt-2 flex items-center gap-2 text-[8px] font-black text-ink-3">
            <span>БАРИЛТ {Math.round(holdProgress * 100)}%</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line/65">
              <motion.div
                className="h-full rounded-full bg-primary shadow-[0_0_14px_rgba(182,242,60,0.7)]"
                animate={{ width: `${holdProgress * 100}%` }}
                transition={{ duration: 0.08, ease: "linear" }}
              />
            </div>
          </div>
        </div>
        <div className="col-span-2 h-1 overflow-hidden rounded-full bg-line/40">
          <div
            className="h-full bg-warn transition-[width] duration-100 ease-linear"
            style={{ width: `${Math.max(0, remainingMs / ROUND_DURATION_MS) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function MimicFinished({
  totalScore,
  maxCombo,
  outcomes,
  rounds,
  onPlayAgain,
}: {
  totalScore: number;
  maxCombo: number;
  outcomes: typeof initialMimicGameState.outcomes;
  rounds: readonly MimicRound[];
  onPlayAgain: () => void;
}) {
  const successCount = outcomes.filter((outcome) => outcome.success).length;
  return (
    <Screen className="relative justify-between overflow-hidden text-center">
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_42%,rgba(36,211,224,0.14),transparent_38%)]" />

      <div className="relative z-10 flex items-center justify-between">
        <Link href="/" aria-label="Нүүр хуудас руу буцах" className="grid size-11 place-items-center rounded-full border border-line bg-surface-2 text-ink-2">
          <ArrowLeft className="size-5" />
        </Link>
        <span className="font-display text-sm font-black">CAMERA <span className="text-primary">QUEST</span></span>
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-3 py-5">
        <div className="grid size-20 place-items-center rounded-full border border-primary/45 bg-bg/72 shadow-[0_0_55px_rgba(182,242,60,0.3)] backdrop-blur-xl">
          <Trophy className="size-10 text-primary" />
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-accent-2">MIMIC RUSH ДУУСЛАА</p>
          <p className="mt-1 font-display text-4xl font-black text-primary drop-shadow-[0_0_22px_rgba(182,242,60,0.3)] sm:text-5xl">{totalScore.toLocaleString()}</p>
          <p className="font-display text-lg font-black">ОНОО</p>
        </div>

        <div className="grid w-full grid-cols-4 gap-1.5 rounded-[1.6rem] border border-line/60 bg-bg/64 p-2 backdrop-blur-xl">
          {rounds.map((round, index) => (
            <div
              key={round.id}
              className={`rounded-xl border px-1 py-2 ${outcomes[index]?.success ? "border-success/40 bg-success/10" : "border-line bg-surface-2/80"}`}
            >
              <p className="font-display text-[10px] font-black tracking-wide text-ink sm:text-xs">{round.shortTitle}</p>
              <p className={`mt-1 text-[9px] font-black ${outcomes[index]?.success ? "text-success" : "text-ink-3"}`}>
                {outcomes[index]?.success ? "ЗӨВ" : "АЛГАСАВ"}
              </p>
            </div>
          ))}
        </div>
        <div className="flex gap-2 text-xs font-bold text-ink-2">
          <span className="rounded-full border border-line bg-surface-2/88 px-3 py-1.5">{successCount}/{rounds.length} challenge</span>
          <span className="rounded-full border border-line bg-surface-2 px-3 py-1.5">Best combo x{maxCombo}</span>
        </div>
      </div>

      <ScreenFooter className="relative z-10">
        <GameButton onClick={onPlayAgain} icon={<RotateCcw className="size-6" />}>
          Дахин тоглох
        </GameButton>
      </ScreenFooter>
    </Screen>
  );
}

function MimicError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Screen className="justify-center text-center">
      <div className="mx-auto w-full max-w-md rounded-[2rem] border border-danger/35 bg-danger/10 p-6">
        <ScanFace className="mx-auto size-14 text-danger" />
        <h1 className="mt-4 font-display text-2xl font-black">Камер эхэлсэнгүй</h1>
        <p className="mt-2 text-sm font-bold text-ink-2">{message}</p>
        <div className="mt-6">
          <GameButton onClick={onRetry}>Дахин оролдох</GameButton>
        </div>
        <Link href="/" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-ink-2">
          <ArrowLeft className="size-4" /> Нүүр хуудас
        </Link>
      </div>
    </Screen>
  );
}

function CenteredPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-20 grid place-items-center px-6">
      <div className="w-full max-w-sm rounded-[2rem] border border-line/70 bg-bg/88 p-7 text-center backdrop-blur-xl">
        {children}
      </div>
    </div>
  );
}

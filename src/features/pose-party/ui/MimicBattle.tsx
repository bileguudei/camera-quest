"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Bomb,
  CircleCheckBig,
  Heart,
  LoaderCircle,
  RotateCcw,
  ScanFace,
  Trophy,
  WifiOff,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useGame } from "@/features/game/application/useGame";
import { remainingFromDeadline } from "@/features/game/domain/turnClock";
import { useTurnPreviewPublisher } from "@/features/game/application/useTurnPreview";
import { useTurnVideoPublisher } from "@/features/game/application/useTurnVideo";
import { useCameraContext } from "@/features/camera/CameraProvider";
import { CameraFrame } from "@/features/game/ui/components/CameraFrame";
import { GameButton } from "@/features/game/ui/components/GameButton";
import { Screen, ScreenFooter } from "@/features/game/ui/components/Screen";
import { SpectatorStage } from "@/features/game/ui/components/SpectatorStage";
import { PlayerAvatar } from "@/features/game/ui/components/PlayerAvatar";
import { handoffErrorMessage } from "@/features/game/domain/errorMessages";
import type { Detection } from "@/features/vision/visionTypes";
import type {
  LobbyPlayer,
  LobbyState,
  MimicBattleTurn,
} from "@/features/game/domain/types";
import { HOLD_DURATION_MS } from "../application/mimicGameReducer";
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

const CALIBRATION_DURATION_MS = 650;
const MIN_BASELINE_SAMPLES = 5;
const PREPARE_TIMEOUT_MS = 30_000;
const WATCHDOG_GRACE_MS = 250;
const EMPTY_BASELINE: MimicBaseline = { blendshapes: {}, headPose: null };
const NO_DETECTIONS: Detection[] = [];

const roundFor = (turn: MimicBattleTurn | null | undefined): MimicRound =>
  MIMIC_ROUNDS.find((round) => round.id === turn?.challengeId) ?? MIMIC_ROUNDS[0];

export function MimicBattle() {
  const lobby = useGame((state) => state.lobby);
  const activateTurn = useGame((state) => state.activateMimicTurn);
  const passTurn = useGame((state) => state.passMimicTurn);
  const expireTurn = useGame((state) => state.expireMimicTurn);
  const playAgain = useGame((state) => state.playAgain);
  const quit = useGame((state) => state.quitGame);
  const busy = useGame((state) => state.busy);
  const errorCode = useGame((state) => state.errorCode);
  const { stream, retry: retryCamera } = useCameraContext();

  const battle = lobby?.mimicBattle ?? null;
  const turn = battle?.turn ?? null;
  const activePlayer = lobby?.players.find((player) => player.seat === turn?.seat) ?? null;
  const isMyTurn = Boolean(
    lobby && turn && lobby.selfSeat === turn.seat && lobby.status === "active",
  );
  const completed = lobby?.status === "completed";
  const round = roundFor(turn);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const turnRef = useRef(turn);
  const isMyTurnRef = useRef(isMyTurn);
  const roundRef = useRef(round);
  const activateRef = useRef(activateTurn);
  const passRef = useRef(passTurn);
  const activationRequestedRef = useRef(false);
  const passRequestedRef = useRef(false);
  const expireRequestedRef = useRef(false);
  const framedSinceRef = useRef<number | null>(null);
  const baselineSamplesRef = useRef<MimicObservation[]>([]);
  const baselineRef = useRef<MimicBaseline>(EMPTY_BASELINE);
  const holdStartedAtRef = useRef<number | null>(null);

  const [frameHintText, setFrameHintText] = useState("Нүүрээ selfie хүрээнд оруулаарай");
  const [liveScore, setLiveScore] = useState(0);
  const [holdProgress, setHoldProgress] = useState(0);
  const [feedback, setFeedback] = useState("Хөдөлгөөнөө эхлүүлээрэй");
  const [components, setComponents] = useState<readonly MimicScoreComponent[]>([]);
  const [remainingMs, setRemainingMs] = useState(turn?.durationMs ?? 7_000);
  const [trackerError, setTrackerError] = useState<string | null>(null);
  const [trackerAttempt, setTrackerAttempt] = useState(0);

  useEffect(() => {
    turnRef.current = turn;
    isMyTurnRef.current = isMyTurn;
    roundRef.current = round;
    activateRef.current = activateTurn;
    passRef.current = passTurn;
  }, [activateTurn, isMyTurn, passTurn, round, turn]);

  useEffect(() => {
    activationRequestedRef.current = false;
    passRequestedRef.current = false;
    expireRequestedRef.current = false;
    framedSinceRef.current = null;
    baselineSamplesRef.current = [];
    baselineRef.current = EMPTY_BASELINE;
    holdStartedAtRef.current = null;
    const reset = window.setTimeout(() => {
      setLiveScore(0);
      setHoldProgress(0);
      setFeedback("Хөдөлгөөнөө эхлүүлээрэй");
      setComponents([]);
      setRemainingMs(turn?.durationMs ?? 7_000);
      setTrackerError(null);
    }, 0);
    return () => window.clearTimeout(reset);
  }, [turn?.turnId, turn?.durationMs]);

  const handleObservation = useCallback(
    (observation: MimicObservation, timestamp: number) => {
      const currentTurn = turnRef.current;
      if (!currentTurn || !isMyTurnRef.current) return;

      if (currentTurn.status === "prepared") {
        if (!isSelfieFramed(observation.faceLandmarks)) {
          framedSinceRef.current = null;
          baselineSamplesRef.current = [];
          setFrameHintText(framingHint(observation.faceLandmarks));
          return;
        }

        setFrameHintText("Тайван хараарай — нүүр танилтыг танд тааруулж байна");
        if (framedSinceRef.current === null) framedSinceRef.current = timestamp;
        if (baselineSamplesRef.current.length < 12) {
          baselineSamplesRef.current.push(observation);
        }
        if (
          !activationRequestedRef.current &&
          timestamp - framedSinceRef.current >= CALIBRATION_DURATION_MS &&
          baselineSamplesRef.current.length >= MIN_BASELINE_SAMPLES
        ) {
          baselineRef.current = buildMimicBaseline(baselineSamplesRef.current);
          activationRequestedRef.current = true;
          void activateRef.current(currentTurn.turnId);
        }
        return;
      }

      if (currentTurn.status !== "active" || passRequestedRef.current) return;
      const evaluation = evaluateMimic(
        roundRef.current.id,
        observation,
        baselineRef.current,
      );
      setLiveScore(evaluation.score);
      setFeedback(evaluation.feedback);
      setComponents(evaluation.components);

      if (evaluation.score < PASS_SCORE) {
        holdStartedAtRef.current = null;
        setHoldProgress(0);
        return;
      }

      const startedAt = holdStartedAtRef.current ?? timestamp;
      holdStartedAtRef.current = startedAt;
      const progress = Math.min(1, (timestamp - startedAt) / HOLD_DURATION_MS);
      setHoldProgress(progress);
      if (progress < 1) return;

      passRequestedRef.current = true;
      navigator.vibrate?.([30, 25, 70]);
      void passRef.current(currentTurn.turnId);
    },
    [],
  );

  const tracking = Boolean(isMyTurn && turn && !completed);
  const tracker = useMimicTracker({
    active: tracking,
    videoRef,
    onObservation: handleObservation,
    onError: setTrackerError,
    retryKey: trackerAttempt,
  });

  useEffect(() => {
    if (!battle || !turn || completed) return;
    const serverOffset = Date.parse(battle.serverNow) - Date.now();
    const deadline =
      turn.status === "active" && turn.deadlineAt
        ? Date.parse(turn.deadlineAt)
        : Date.parse(turn.preparedAt) + PREPARE_TIMEOUT_MS;

    const tick = () => {
      const left = remainingFromDeadline(deadline, serverOffset);
      setRemainingMs(turn.status === "active" ? left : turn.durationMs);
      if (left > WATCHDOG_GRACE_MS || expireRequestedRef.current) return;
      expireRequestedRef.current = true;
      void expireTurn(turn.turnId).finally(() => {
        window.setTimeout(() => {
          expireRequestedRef.current = false;
        }, 1_000);
      });
    };

    tick();
    const timer = window.setInterval(tick, 100);
    return () => window.clearInterval(timer);
  }, [battle, completed, expireTurn, turn]);

  const broadcasting = Boolean(isMyTurn && turn && !completed);
  const [framesNeeded, setFramesNeeded] = useState(true);
  const { channel, watchersOnVideo } = useTurnVideoPublisher({
    stream,
    gameId: broadcasting ? (lobby?.gameId ?? null) : null,
    enabled: broadcasting,
    onFrameNeeded: setFramesNeeded,
  });
  useTurnPreviewPublisher({
    videoRef,
    channel: broadcasting ? channel : null,
    seat: lobby?.selfSeat ?? null,
    turnId: turn?.turnId ?? null,
    enabled: broadcasting && framesNeeded,
    progress: liveScore,
    detections: NO_DETECTIONS,
  });

  if (!lobby || lobby.gameKind !== "mimic_rush") return null;
  if (completed) {
    const winner = lobby.players.find((player) => player.seat === battle?.winnerSeat) ?? null;
    return (
      <MimicBattleWinner
        lobby={lobby}
        winner={winner}
        busy={busy}
        onRematch={() => void playAgain()}
        onLeave={() => void quit()}
      />
    );
  }
  if (!turn || !activePlayer) return null;

  const remainingLabel =
    turn.status === "active" ? `${Math.ceil(remainingMs / 1_000)}с` : "БЭЛДЭЖ БАЙНА";

  return (
    <Screen padding="none" backdrop={false} className="bg-bg">
      <MimicBattleHeader
        lobby={lobby}
        turnNumber={turn.turnNumber}
        onLeave={() => void quit()}
      />

      {isMyTurn ? (
        <CameraFrame
          stream={stream}
          facing="user"
          videoRef={videoRef}
          dim={turn.status === "prepared" || Boolean(trackerError)}
          className="absolute inset-0 size-full"
        >
          <div className="absolute inset-x-3 top-[calc(max(env(safe-area-inset-top),0.75rem)+5.4rem)] z-20 mx-auto max-w-md rounded-3xl border border-primary/35 bg-bg/78 px-4 py-3 text-center backdrop-blur-xl">
            <div className="flex items-center justify-center gap-2">
              <Bomb className="size-5 text-warn" strokeWidth={2.3} />
              <p className="text-[9px] font-black tracking-[0.18em] text-warn">
                FACE BOMB · ТАНЫ ЭЭЛЖ
              </p>
            </div>
            <h1 className="mt-1 font-display text-xl font-black text-primary">
              {round.title}
            </h1>
            <p className="mt-1 text-xs font-bold text-ink-2">{round.instruction}</p>
          </div>

          {turn.status === "prepared" ? (
            <div className="absolute inset-0 z-20 grid place-items-center px-6">
              <div className="w-full max-w-sm rounded-[2rem] border border-line/70 bg-bg/88 p-6 text-center backdrop-blur-xl">
                {tracker.status === "loading" ? (
                  <LoaderCircle className="mx-auto size-11 animate-spin text-primary" />
                ) : (
                  <ScanFace className="mx-auto size-12 text-primary" strokeWidth={1.6} />
                )}
                <p className="mt-4 font-display text-lg font-black text-ink">
                  {tracker.status === "loading" ? "Нүүр танилт бэлдэж байна" : frameHintText}
                </p>
                <p className="mt-2 text-xs font-bold text-ink-3">
                  Нүүр + мөр харагдахад хангалттай
                </p>
              </div>
            </div>
          ) : null}

          {trackerError ? (
            <div className="absolute inset-0 z-40 grid place-items-center px-6">
              <div className="w-full max-w-sm rounded-[2rem] border border-danger/35 bg-bg/94 p-6 text-center">
                <WifiOff className="mx-auto size-12 text-danger" />
                <p className="mt-3 text-sm font-bold text-ink-2">{trackerError}</p>
                <div className="mt-5">
                  <GameButton
                    size="sm"
                    onClick={() => {
                      setTrackerError(null);
                      retryCamera();
                      setTrackerAttempt((attempt) => attempt + 1);
                    }}
                  >
                    Дахин оролдох
                  </GameButton>
                </div>
              </div>
            </div>
          ) : null}

          {turn.status === "active" ? (
            <div className="absolute inset-x-3 bottom-[max(env(safe-area-inset-bottom),0.75rem)] z-30 mx-auto grid max-w-lg grid-cols-[5.6rem_1fr] items-center gap-3 rounded-[1.75rem] border border-line/70 bg-bg/84 p-3 backdrop-blur-xl">
              <MimicProgressRing score={liveScore} holdProgress={holdProgress} />
              <div className="min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] font-black tracking-[0.12em] text-accent-2">
                    {liveScore >= PASS_SCORE ? "БАРИАРАЙ" : "LIVE COACH"}
                  </p>
                  <p className="font-display text-lg font-black tabular-nums text-warn">
                    {Math.ceil(remainingMs / 1_000)}с
                  </p>
                </div>
                <p aria-live="polite" className="mt-1 text-xs font-black text-ink">
                  {feedback}
                </p>
                <ComponentProgress components={components} />
                {watchersOnVideo > 0 ? (
                  <p className="mt-2 text-[9px] font-bold text-ink-3">
                    {watchersOnVideo} хүн LIVE харж байна
                  </p>
                ) : null}
              </div>
              <div className="col-span-2 h-1 overflow-hidden rounded-full bg-line/50">
                <div
                  className="h-full bg-warn transition-[width] duration-100 ease-linear"
                  style={{ width: `${Math.max(0, remainingMs / turn.durationMs) * 100}%` }}
                />
              </div>
            </div>
          ) : null}
        </CameraFrame>
      ) : (
        <div className="absolute inset-x-3 bottom-3 top-[5.6rem] flex flex-col gap-3 sm:inset-x-5 sm:bottom-5 lg:mx-auto lg:max-w-5xl lg:flex-row">
          <SpectatorStage
            lobby={lobby}
            player={activePlayer}
            prompt={round.instruction}
            remainingLabel={remainingLabel}
            className="min-h-0 flex-1"
          />
          <aside className="rounded-g4 border border-line/80 bg-surface/82 p-4 backdrop-blur-xl lg:w-72">
            <p className="text-[10px] font-black tracking-[0.18em] text-warn">
              FACE BOMB · ЭЭЛЖ {turn.turnNumber + 1}
            </p>
            <h1 className="mt-2 font-display text-2xl font-black text-primary">
              {round.title}
            </h1>
            <p className="mt-2 text-sm font-bold text-ink-2">{round.instruction}</p>
            <div className="mt-5 flex items-center gap-3 rounded-2xl border border-line/70 bg-bg/55 p-3">
              <PlayerAvatar player={activePlayer} size="sm" active />
              <div className="min-w-0">
                <p className="truncate font-display font-black text-ink">{activePlayer.name}</p>
                <p className="text-xs font-bold text-ink-3">
                  {turn.status === "prepared" ? "Нүүрээ тааруулж байна" : "Bomb-оо дамжуулах гэж байна"}
                </p>
              </div>
            </div>
          </aside>
        </div>
      )}

      {errorCode ? (
        <p className="absolute inset-x-4 bottom-4 z-50 rounded-xl bg-danger/90 p-3 text-center text-sm font-bold text-white">
          {handoffErrorMessage(errorCode)}
        </p>
      ) : null}
    </Screen>
  );
}

function MimicBattleHeader({
  lobby,
  turnNumber,
  onLeave,
}: {
  lobby: LobbyState;
  turnNumber: number;
  onLeave: () => void;
}) {
  const players = lobby.players.filter((player) => !player.left);
  return (
    <header className="absolute inset-x-0 top-0 z-50 flex items-start justify-between gap-2 px-safe pt-safe">
      <button
        type="button"
        onClick={onLeave}
        aria-label="Тоглоомоос гарах"
        className="grid size-10 shrink-0 place-items-center rounded-full border border-line/70 bg-bg/78 text-ink-2 backdrop-blur-xl"
      >
        <ArrowLeft className="size-4" />
      </button>

      <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
        <div className="inline-flex items-center gap-2 rounded-full border border-warn/35 bg-bg/78 px-3 py-1.5 backdrop-blur-xl">
          <Bomb className="size-4 text-warn" />
          <span className="font-display text-xs font-black text-ink">FACE BOMB</span>
          <span className="text-[10px] font-black text-warn">#{turnNumber + 1}</span>
        </div>
        <div className="flex max-w-full gap-1.5 overflow-x-auto no-scrollbar">
          {players.map((player) => (
            <div
              key={player.id}
              className={[
                "flex shrink-0 items-center gap-1.5 rounded-full border bg-bg/78 px-2 py-1 backdrop-blur-xl",
                player.seat === lobby.currentSeat ? "border-primary/55" : "border-line/60",
              ].join(" ")}
            >
              <span className="max-w-16 truncate text-[10px] font-black text-ink-2">
                {player.isSelf ? "ТА" : player.name}
              </span>
              <LifeMeter lives={player.mimicLives ?? 0} />
            </div>
          ))}
        </div>
      </div>

      <span className="size-10 shrink-0" aria-hidden />
    </header>
  );
}

function LifeMeter({ lives }: { lives: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${lives} life үлдсэн`}>
      {[0, 1, 2].map((index) => (
        <Heart
          key={index}
          className={`size-3 ${index < lives ? "fill-danger text-danger" : "text-line"}`}
          strokeWidth={2.2}
        />
      ))}
    </span>
  );
}

function ComponentProgress({ components }: { components: readonly MimicScoreComponent[] }) {
  if (components.length === 0) return null;
  return (
    <div className="mt-2 grid grid-cols-2 gap-1.5">
      {components.slice(0, 2).map((component) => (
        <div key={component.id} className="min-w-0">
          <div className="flex justify-between gap-1 text-[8px] font-black text-ink-3">
            <span className="truncate">{component.label}</span>
            <span>{Math.round(component.score * 100)}%</span>
          </div>
          <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-line/60">
            <div
              className={`h-full rounded-full ${
                component.score >= PASS_SCORE ? "bg-primary" : "bg-accent-2"
              }`}
              style={{ width: `${Math.max(0, Math.min(1, component.score)) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function MimicBattleWinner({
  lobby,
  winner,
  busy,
  onRematch,
  onLeave,
}: {
  lobby: LobbyState;
  winner: LobbyPlayer | null;
  busy: boolean;
  onRematch: () => void;
  onLeave: () => void;
}) {
  const rematchWaiting = lobby.selfRematchReady && lobby.rematchReadyCount < lobby.rematchPlayerCount;
  return (
    <Screen className="relative justify-between overflow-y-auto text-center">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onLeave}
          aria-label="Нүүр хуудас руу буцах"
          className="grid size-11 place-items-center rounded-full border border-line bg-surface-2 text-ink-2"
        >
          <ArrowLeft className="size-5" />
        </button>
        <span className="font-display text-sm font-black">
          CAMERA <span className="text-primary">QUEST</span>
        </span>
      </div>

      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center py-5">
        <div className="grid size-24 place-items-center rounded-full border border-primary/45 bg-primary/10 shadow-[0_0_70px_rgba(182,242,60,0.24)]">
          <Trophy className="size-12 text-primary" strokeWidth={1.7} />
        </div>
        <p className="mt-5 text-[10px] font-black tracking-[0.22em] text-warn">
          FACE BOMB WINNER
        </p>
        <h1 className="mt-1 font-display text-4xl font-black text-primary sm:text-5xl">
          {winner?.name ?? "Ялагч"}
        </h1>
        <div className="mt-5 grid w-full gap-2">
          {lobby.players
            .filter((player) => !player.left)
            .toSorted((left, right) => (right.mimicLives ?? 0) - (left.mimicLives ?? 0))
            .map((player) => (
              <div
                key={player.id}
                className={[
                  "flex items-center gap-3 rounded-2xl border bg-surface/70 px-3 py-2.5 text-left",
                  player.seat === winner?.seat ? "border-primary/45" : "border-line/70",
                ].join(" ")}
              >
                <PlayerAvatar player={player} size="sm" active={player.seat === winner?.seat} />
                <span className="min-w-0 flex-1 truncate font-display font-black text-ink">
                  {player.name}{player.isSelf ? " (та)" : ""}
                </span>
                {player.seat === winner?.seat ? (
                  <CircleCheckBig className="size-5 text-primary" />
                ) : (
                  <LifeMeter lives={player.mimicLives ?? 0} />
                )}
              </div>
            ))}
        </div>
      </div>

      <ScreenFooter>
        <GameButton
          onClick={onRematch}
          disabled={busy || rematchWaiting}
          icon={<RotateCcw className="size-5" />}
        >
          {rematchWaiting
            ? `${lobby.rematchReadyCount}/${lobby.rematchPlayerCount} дахин тоглохыг хүлээж байна`
            : "Дахин Face Bomb тоглох"}
        </GameButton>
        <Link
          href="/pose-party"
          onClick={onLeave}
          className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-ink-2 underline underline-offset-4"
        >
          <ScanFace className="size-4" /> Ганцаараа Mimic Rush тоглох
        </Link>
      </ScreenFooter>
    </Screen>
  );
}

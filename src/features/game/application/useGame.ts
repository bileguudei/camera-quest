"use client";

import { useMemo } from "react";
import { DEFAULT_NAMES } from "@/content/mn";
import { ROUNDS, TOTAL_ROUNDS } from "../domain/config";
import type {
  CameraFacing,
  CameraMode,
  Challenge,
  Phase,
  Player,
  RoundConfig,
  TurnOutcome,
} from "../domain/types";
import { getGameRepository } from "../infrastructure/createGameRepository";
import type { PrepareTurnInput } from "../infrastructure/gameRepository";
import type { TurnFeedbackReason } from "../infrastructure/gameRepository";
import { toAppError } from "@/shared/errors/appError";
import { GameActorContext } from "./GameProvider";

export interface CalibrationPayload {
  token: string;
  backgroundClasses: string[];
}

export interface GameView {
  phase: Phase;
  players: Player[];
  playerCount: number;
  roundIndex: number;
  turnIndex: number;
  challenge: Challenge | null;
  turnId: string | null;
  calibrationToken: string | null;
  deadlineAtMs: number | null;
  serverClockOffsetMs: number;
  roundSnapshot: Record<string, number>;
  lastOutcome: TurnOutcome | null;
  cameraFacing: CameraFacing;
  cameraMode: CameraMode;
  backendMode: "supabase" | "local" | "unavailable";
  busy: boolean;
  errorCode: string | null;
  goTo: (phase: Phase) => void;
  openSetup: () => void;
  setPlayerCount: (count: number) => void;
  setPlayerName: (id: string, name: string) => void;
  confirmPlayers: () => void;
  setCameraFacing: (facing: CameraFacing) => void;
  toggleCameraFacing: () => void;
  setCameraMode: (mode: CameraMode) => void;
  startGame: () => void;
  beginRound: () => void;
  readyForTurn: () => void;
  prepareTurn: (calibration: CalibrationPayload) => Promise<void>;
  preparationFailed: (code: string) => void;
  revealDone: () => void;
  startPlay: () => Promise<void>;
  acceptOutcome: (outcome: TurnOutcome) => void;
  resolveTurn: (success: boolean, elapsedMs: number) => Promise<void>;
  expireTurn: () => Promise<number | null>;
  reportSystemError: () => void;
  advanceTurn: () => void;
  nextRound: () => void;
  playAgain: () => void;
  newGame: () => void;
  quitGame: () => Promise<void>;
  submitTurnFeedback: (turnId: string, reason: TurnFeedbackReason) => Promise<void>;
  currentPlayer: () => Player | null;
  currentRound: () => RoundConfig;
  isLastRound: () => boolean;
  isLastTurnOfRound: () => boolean;
}

const resolveNames = (players: Player[]) =>
  players.map((player) => ({
    ...player,
    name: player.name.trim() || DEFAULT_NAMES[(player.seat - 1) % DEFAULT_NAMES.length],
  }));

/** Compatibility selector while the preserved visual screens move to XState. */
export function useGame<T>(selector: (state: GameView) => T): T {
  const actor = GameActorContext.useActorRef();
  const snapshot = GameActorContext.useSelector((next) => next);
  const repository = getGameRepository();

  const view = useMemo<GameView>(() => {
    const context = snapshot.context;
    const phase = String(snapshot.value) as Phase;
    const player = () => context.players[context.turnIndex] ?? null;
    const round = () => ROUNDS[context.roundIndex];

    return {
      phase,
      players: context.players,
      playerCount: context.playerCount,
      roundIndex: context.roundIndex,
      turnIndex: context.turnIndex,
      challenge: context.preparedTurn?.challenge ?? null,
      turnId: context.preparedTurn?.turnId ?? null,
      calibrationToken: context.calibrationToken,
      deadlineAtMs: context.deadlineAtMs,
      serverClockOffsetMs: context.serverClockOffsetMs,
      roundSnapshot: context.roundSnapshot,
      lastOutcome: context.lastOutcome,
      cameraFacing: context.cameraFacing,
      cameraMode: context.cameraMode,
      backendMode: repository.mode,
      busy: context.busy,
      errorCode: context.errorCode,
      goTo: (target) => {
        if (target === "landing") actor.send({ type: "GO_LANDING" });
        if (target === "winner") actor.send({ type: "GO_WINNER" });
      },
      openSetup: () => actor.send({ type: "OPEN_SETUP" }),
      setPlayerCount: (count) => actor.send({ type: "SET_PLAYER_COUNT", count }),
      setPlayerName: (id, name) => actor.send({ type: "SET_PLAYER_NAME", id, name }),
      confirmPlayers: () => actor.send({ type: "CONFIRM_PLAYERS" }),
      setCameraFacing: (facing) => actor.send({ type: "SET_CAMERA_FACING", facing }),
      toggleCameraFacing: () =>
        actor.send({
          type: "SET_CAMERA_FACING",
          facing: context.cameraFacing === "environment" ? "user" : "environment",
        }),
      setCameraMode: (mode) => actor.send({ type: "SET_CAMERA_MODE", mode }),
      startGame: () => {
        actor.send({ type: "START_GAME_PENDING" });
        void repository
          .createGame({ players: resolveNames(context.players) })
          .then((session) => actor.send({ type: "START_GAME", session }))
          .catch((error: unknown) =>
            actor.send({ type: "GAME_FAILED", code: toAppError(error).code }),
          );
      },
      beginRound: () => actor.send({ type: "BEGIN_ROUND" }),
      readyForTurn: () => actor.send({ type: "PLAYER_READY" }),
      prepareTurn: async (calibration) => {
        const current = player();
        if (!current || !context.gameId) return;
        const input: PrepareTurnInput = {
          gameId: context.gameId,
          playerId: current.id,
          round: context.roundIndex + 1,
          calibrationToken: calibration.token,
          backgroundClasses: calibration.backgroundClasses,
        };
        try {
          const turn = await repository.prepareTurn(input);
          actor.send({
            type: "TURN_PREPARED",
            turn,
            calibrationToken: calibration.token,
          });
        } catch (error) {
          actor.send({ type: "TURN_PREPARE_FAILED", code: toAppError(error).code });
        }
      },
      preparationFailed: (code) => actor.send({ type: "TURN_PREPARE_FAILED", code }),
      revealDone: () => actor.send({ type: "REVEAL_DONE" }),
      startPlay: async () => {
        if (!context.preparedTurn) return;
        try {
          const active = await repository.activateTurn(context.preparedTurn.turnId);
          actor.send({ type: "TURN_ACTIVATED", active });
        } catch (error) {
          actor.send({ type: "TURN_PREPARE_FAILED", code: toAppError(error).code });
        }
      },
      acceptOutcome: (outcome) => actor.send({ type: "TURN_RESOLVED", outcome }),
      resolveTurn: async (success, elapsedMs) => {
        if (!context.preparedTurn || !repository.resolveLocalTurn) return;
        const outcome = await repository.resolveLocalTurn(
          context.preparedTurn.turnId,
          success,
          elapsedMs,
        );
        actor.send({ type: "TURN_RESOLVED", outcome });
      },
      expireTurn: async () => {
        if (!context.preparedTurn) return null;
        const result = await repository.expireTurn(context.preparedTurn.turnId);
        if (result.outcome?.systemError) {
          actor.send({ type: "VISION_SYSTEM_ERROR" });
        } else if (result.outcome) {
          actor.send({ type: "TURN_RESOLVED", outcome: result.outcome });
        }
        return result.remainingMs ?? null;
      },
      reportSystemError: () => actor.send({ type: "VISION_SYSTEM_ERROR" }),
      advanceTurn: () => actor.send({ type: "ADVANCE_TURN" }),
      nextRound: () => {
        if (context.roundIndex < TOTAL_ROUNDS - 1 || !context.gameId) {
          actor.send({ type: "NEXT_ROUND" });
          return;
        }
        actor.send({ type: "COMPLETE_GAME_PENDING" });
        void repository
          .completeGame(context.gameId)
          .then(() => actor.send({ type: "NEXT_ROUND" }))
          .catch((error: unknown) =>
            actor.send({ type: "GAME_FAILED", code: toAppError(error).code }),
          );
      },
      playAgain: () => {
        actor.send({ type: "START_GAME_PENDING" });
        void repository
          .createGame({ players: resolveNames(context.players) })
          .then((session) => actor.send({ type: "START_GAME", session }))
          .catch((error: unknown) =>
            actor.send({ type: "GAME_FAILED", code: toAppError(error).code }),
          );
      },
      newGame: () => actor.send({ type: "NEW_GAME" }),
      quitGame: async () => {
        if (context.gameId) {
          try {
            await repository.abandonGame(context.gameId);
          } catch {
            // Leaving the camera must remain possible while offline.
          }
        }
        actor.send({ type: "GO_LANDING" });
      },
      submitTurnFeedback: (turnId, reason) => repository.submitTurnFeedback(turnId, reason),
      currentPlayer: player,
      currentRound: round,
      isLastRound: () => context.roundIndex >= TOTAL_ROUNDS - 1,
      isLastTurnOfRound: () => context.turnIndex >= context.players.length - 1,
    };
  }, [actor, repository, snapshot]);

  return selector(view);
}

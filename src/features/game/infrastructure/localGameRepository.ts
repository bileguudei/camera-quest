"use client";

import { AppError } from "@/shared/errors/appError";
import { ROUNDS } from "@/features/game/domain/config";
import { pickLocalQuest } from "@/features/game/domain/questCatalog";
import { levelForXp, scoreTurn } from "@/features/game/domain/scoring";
import type {
  GameEnvironment,
  Player,
  PreparedTurn,
  TurnOutcome,
} from "@/features/game/domain/types";
import type {
  CreateGameInput,
  GameRepository,
  PrepareTurnInput,
} from "./gameRepository";

interface LocalTurn extends PreparedTurn {
  playerId: string;
  round: number;
  startedAt?: number;
  resolved: boolean;
}

const id = () => crypto.randomUUID();

const onlineUnavailable = (): never => {
  throw new AppError("GAME_UNAVAILABLE", "Онлайн тоглоом зөвхөн Supabase backend дээр ажиллана.");
};

/** Development/E2E adapter. It is never selected when Supabase env exists. */
export class LocalGameRepository implements GameRepository {
  readonly mode = "local" as const;
  private players = new Map<string, Player>();
  private usedQuestIds = new Map<string, Set<string>>();
  private turns = new Map<string, LocalTurn>();
  private environment: GameEnvironment = "home";

  async createGame({ players, environment }: CreateGameInput) {
    this.players.clear();
    this.turns.clear();
    this.usedQuestIds.clear();
    this.environment = environment;
    const persisted = players.map((player) => ({ ...player, id: id(), profileId: id() }));
    persisted.forEach((player) => this.players.set(player.id, player));
    return { gameId: id(), environment, players: persisted };
  }

  async prepareTurn(input: PrepareTurnInput) {
    const used = this.usedQuestIds.get(input.playerId) ?? new Set<string>();
    const difficulty = ROUNDS[input.round - 1]?.difficulty;
    if (!difficulty) throw new Error("Invalid local round");
    const challenge = pickLocalQuest(difficulty, used, input.backgroundClasses, this.environment);
    used.add(challenge.id);
    this.usedQuestIds.set(input.playerId, used);
    const turn: LocalTurn = {
      turnId: id(),
      challenge,
      playerId: input.playerId,
      round: input.round,
      resolved: false,
    };
    this.turns.set(turn.turnId, turn);
    return { turnId: turn.turnId, challenge };
  }

  async activateTurn(turnId: string) {
    const turn = this.requireTurn(turnId);
    turn.startedAt = Date.now();
    const startedAt = new Date(turn.startedAt);
    return {
      turnId,
      startedAt: startedAt.toISOString(),
      deadlineAt: new Date(turn.startedAt + 30_000).toISOString(),
      serverNow: startedAt.toISOString(),
    };
  }

  async expireTurn(turnId: string) {
    const turn = this.requireTurn(turnId);
    const remainingMs = Math.max(0, (turn.startedAt ?? Date.now()) + 30_000 - Date.now());
    if (remainingMs > 0) return { remainingMs };
    return { outcome: await this.resolveLocalTurn(turnId, false, 30_000) };
  }

  async recoverDisconnectedTurn(): Promise<never> { return onlineUnavailable(); }

  async completeGame() {}

  async abandonGame() {}

  async submitTurnFeedback() {}

  async resolveLocalTurn(turnId: string, success: boolean, elapsedMs: number) {
    const turn = this.requireTurn(turnId);
    const player = this.players.get(turn.playerId);
    if (!player) throw new Error("Local player missing");

    if (turn.resolved) return this.toOutcome(turn, player, success, elapsedMs, 0);
    turn.resolved = true;
    const points = success ? scoreTurn(turn.challenge.difficulty, elapsedMs) : 0;
    player.score += points;
    player.totalXp += points;
    player.level = levelForXp(player.totalXp);
    player.streak = success ? player.streak + 1 : 0;
    return this.toOutcome(turn, player, success, elapsedMs, points);
  }

  async getAccessToken() {
    return "local-development-token";
  }

  // Online lobbies need the authoritative server; this adapter covers the
  // single-device flow for development and E2E only.
  async createOnlineGame(): Promise<never> { return onlineUnavailable(); }
  async joinGame(): Promise<never> { return onlineUnavailable(); }
  async readGameState(): Promise<never> { return onlineUnavailable(); }
  async setReady(): Promise<never> { return onlineUnavailable(); }
  async startOnlineGame(): Promise<never> { return onlineUnavailable(); }
  async activateMimicTurn(): Promise<never> { return onlineUnavailable(); }
  async passMimicTurn(): Promise<never> { return onlineUnavailable(); }
  async expireMimicTurn(): Promise<never> { return onlineUnavailable(); }
  async heartbeatGame(): Promise<never> { return onlineUnavailable(); }
  async requestRematch(): Promise<never> { return onlineUnavailable(); }
  async issueVisionTicket(): Promise<never> { return onlineUnavailable(); }
  async leaveGame(): Promise<void> {}
  async advanceTurn(): Promise<never> { return onlineUnavailable(); }
  subscribeToGame(): () => void { return () => {}; }
  joinTurnChannel() {
    return { publishFrame: () => {}, publishSignal: () => {}, close: () => {} };
  }

  private requireTurn(turnId: string) {
    const turn = this.turns.get(turnId);
    if (!turn) throw new Error("Local turn missing");
    return turn;
  }

  private toOutcome(
    turn: LocalTurn,
    player: Player,
    success: boolean,
    elapsedMs: number,
    points: number,
  ): TurnOutcome {
    return {
      turnId: turn.turnId,
      playerId: player.id,
      playerName: player.name,
      playerColor: player.color,
      challengeId: turn.challenge.id,
      challengePrompt: turn.challenge.prompt,
      success,
      timeMs: elapsedMs,
      points,
      xp: points,
      totalAfter: player.score,
      totalXp: player.totalXp,
      level: player.level,
      streak: player.streak,
      unlockedAchievementIds: [],
    };
  }
}

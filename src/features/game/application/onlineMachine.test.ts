import { createActor } from "xstate";
import { describe, expect, it } from "vitest";
import { gameMachine } from "./gameMachine";
import type { LobbyPlayer, LobbyState, LobbyTurn, TurnOutcome } from "../domain/types";

const seat = (n: number, overrides: Partial<LobbyPlayer> = {}): LobbyPlayer => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  profileId: `00000000-0000-4000-8000-00000000000${n}`,
  seat: n,
  name: `Player ${n}`,
  color: "violet",
  avatar: "aperture",
  score: 0,
  totalXp: 0,
  level: 1,
  streak: 0,
  ready: true,
  left: false,
  isSelf: n === 1,
  ...overrides,
});

const lobby = (overrides: Partial<LobbyState> = {}): LobbyState => ({
  gameId: "00000000-0000-4000-8000-0000000000aa",
  mode: "online",
  environment: "home",
  status: "active",
  joinCode: "KX7M2P",
  lobbyOpen: true,
  currentRound: 1,
  currentSeat: 1,
  isHost: true,
  selfSeat: 1,
  players: [seat(1), seat(2)],
  lastTurn: null,
  ...overrides,
});

const outcome = (turnId: string, playerId: string): TurnOutcome => ({
  turnId,
  playerId,
  playerName: "Player 2",
  playerColor: "blue",
  challengeId: "obj-cup",
  challengePrompt: "АЯГА ОЛ",
  success: true,
  timeMs: 4200,
  points: 20,
  xp: 20,
  totalAfter: 20,
  totalXp: 20,
  level: 1,
  streak: 1,
  unlockedAchievementIds: [],
});

const resolvedTurn = (seatNo: number): LobbyTurn => ({
  turnId: "00000000-0000-4000-8000-0000000000bb",
  seat: seatNo,
  round: 1,
  status: "passed",
  deadlineAt: null,
  prompt: "АЯГА ОЛ",
  outcome: outcome(
    "00000000-0000-4000-8000-0000000000bb",
    "00000000-0000-4000-8000-000000000002",
  ),
});

const openLobby = () => {
  const actor = createActor(gameMachine).start();
  actor.send({ type: "OPEN_ONLINE" });
  actor.send({ type: "LOBBY_UPDATED", lobby: lobby() });
  return actor;
};

describe("online table", () => {
  it("moves every phone from the lobby to its own camera check when the host starts", () => {
    const actor = openLobby();
    expect(actor.getSnapshot().value).toBe("lobby");

    actor.send({ type: "LOBBY_UPDATED", lobby: lobby({ lobbyOpen: false }) });

    expect(actor.getSnapshot().value).toBe("cameraCheck");
    expect(actor.getSnapshot().context.gameId).toBe("00000000-0000-4000-8000-0000000000aa");
  });

  it("takes the seat order from the server pointer instead of a local counter", () => {
    const actor = openLobby();

    actor.send({ type: "LOBBY_UPDATED", lobby: lobby({ lobbyOpen: false, currentSeat: 2 }) });

    expect(actor.getSnapshot().context.turnIndex).toBe(1);
    expect(actor.getSnapshot().context.players[1].seat).toBe(2);
  });

  it("waits for the server pointer instead of advancing the seat locally", () => {
    const actor = openLobby();
    actor.send({ type: "LOBBY_UPDATED", lobby: lobby({ lobbyOpen: false }) });
    actor.send({ type: "START_GAME", session: { gameId: "00000000-0000-4000-8000-0000000000aa", environment: "home", players: [] } });
    actor.send({ type: "BEGIN_ROUND" });
    actor.send({ type: "PLAYER_READY" });
    actor.send({
      type: "TURN_PREPARED",
      calibrationToken: "signed-calibration-token",
      turn: {
        turnId: "00000000-0000-4000-8000-0000000000cc",
        challenge: {
          id: "obj-cup",
          kind: "object",
          label: "Аяга",
          prompt: "АЯГА ОЛ",
          difficulty: "easy",
          validatorConfig: {},
        },
      },
    });
    actor.send({ type: "REVEAL_DONE" });
    actor.send({
      type: "TURN_ACTIVATED",
      active: {
        turnId: "00000000-0000-4000-8000-0000000000cc",
        startedAt: "2026-08-18T00:00:00.000Z",
        deadlineAt: "2026-08-18T00:00:30.000Z",
        serverNow: "2026-08-18T00:00:00.000Z",
      },
    });
    actor.send({
      type: "TURN_RESOLVED",
      outcome: outcome("00000000-0000-4000-8000-0000000000cc", "00000000-0000-4000-8000-000000000001"),
    });
    expect(actor.getSnapshot().value).toBe("turnResult");

    actor.send({ type: "ADVANCE_TURN" });

    // Two phones tapping "next" must not skip a player; only the server pointer moves.
    expect(actor.getSnapshot().value).toBe("turnResult");
    expect(actor.getSnapshot().context.turnIndex).toBe(0);

    actor.send({ type: "LOBBY_UPDATED", lobby: lobby({ lobbyOpen: false, currentSeat: 2 }) });

    expect(actor.getSnapshot().value).toBe("playerHandoff");
    expect(actor.getSnapshot().context.turnIndex).toBe(1);
  });

  it("shows a spectator the result of a turn it never streamed", () => {
    const actor = openLobby();
    actor.send({ type: "LOBBY_UPDATED", lobby: lobby({ lobbyOpen: false, currentSeat: 2 }) });
    actor.send({ type: "START_GAME", session: { gameId: "00000000-0000-4000-8000-0000000000aa", environment: "home", players: [] } });
    actor.send({ type: "BEGIN_ROUND" });
    expect(actor.getSnapshot().value).toBe("playerHandoff");

    actor.send({
      type: "LOBBY_UPDATED",
      lobby: lobby({ lobbyOpen: false, currentSeat: 2, lastTurn: resolvedTurn(2) }),
    });

    expect(actor.getSnapshot().value).toBe("turnResult");
    expect(actor.getSnapshot().context.lastOutcome?.points).toBe(20);
  });

  it("ends the match when the server closes the table", () => {
    const actor = openLobby();
    actor.send({ type: "LOBBY_UPDATED", lobby: lobby({ lobbyOpen: false }) });
    actor.send({ type: "START_GAME", session: { gameId: "00000000-0000-4000-8000-0000000000aa", environment: "home", players: [] } });
    actor.send({ type: "BEGIN_ROUND" });

    actor.send({
      type: "LOBBY_UPDATED",
      lobby: lobby({ lobbyOpen: false, status: "completed", currentRound: 5, currentSeat: 2 }),
    });

    expect(actor.getSnapshot().value).toBe("winner");
  });
});

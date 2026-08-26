import { describe, expect, it } from "vitest";
import { activeTurnSchema, lobbyStateSchema } from "./gameApiSchemas";

const turnId = "10000000-0000-4000-8000-000000000001";

describe("activeTurnSchema", () => {
  it("accepts the UTC offset format returned by Postgres jsonb", () => {
    expect(
      activeTurnSchema.parse({
        turnId,
        startedAt: "2026-08-14T02:18:39.010+00:00",
        deadlineAt: "2026-08-14T02:19:09.010+00:00",
        serverNow: "2026-08-14T02:18:39.010+00:00",
      }),
    ).toMatchObject({ turnId });
  });

  it("still requires an explicit timezone", () => {
    expect(() =>
      activeTurnSchema.parse({
        turnId,
        startedAt: "2026-08-14T02:18:39.010",
        deadlineAt: "2026-08-14T02:19:09.010",
        serverNow: "2026-08-14T02:18:39.010",
      }),
    ).toThrow();
  });
});

const mimicLobby = {
  gameId: "10000000-0000-4000-8000-000000000010",
  mode: "online",
  gameKind: "mimic_rush",
  environment: "home",
  status: "active",
  joinCode: "KX7M2P",
  lobbyOpen: false,
  currentRound: 1,
  currentSeat: 1,
  isHost: true,
  selfSeat: 1,
  players: [
    {
      id: "10000000-0000-4000-8000-000000000011",
      profileId: "10000000-0000-4000-8000-000000000011",
      seat: 1,
      name: "Mimic",
      color: "violet",
      avatar: "🦊",
      score: 0,
      totalXp: 0,
      level: 1,
      streak: 0,
      ready: true,
      left: false,
      connected: true,
      isHost: true,
      isSelf: true,
      mimicLives: 3,
      mimicEliminated: false,
    },
  ],
  lastTurn: null,
  rematchReadyCount: 0,
  rematchPlayerCount: 1,
  selfRematchReady: false,
  mimicBattle: {
    turn: {
      turnId: "10000000-0000-4000-8000-000000000012",
      turnNumber: 0,
      seat: 1,
      challengeId: "fusion_smile_wink_left",
      status: "prepared",
      preparedAt: "2026-08-25T02:18:39.010+00:00",
      deadlineAt: null,
      durationMs: 7_000,
    },
    lastResult: null,
    winnerSeat: null,
    serverNow: "2026-08-25T02:18:39.010+00:00",
  },
};

describe("lobbyStateSchema Face Bomb contract", () => {
  it("accepts the authoritative challenge, life and prepared-turn state", () => {
    expect(lobbyStateSchema.parse(mimicLobby)).toMatchObject({
      gameKind: "mimic_rush",
      mimicBattle: { turn: { challengeId: "fusion_smile_wink_left" } },
    });
  });

  it("rejects a challenge the on-device evaluator does not implement", () => {
    expect(() =>
      lobbyStateSchema.parse({
        ...mimicLobby,
        mimicBattle: {
          ...mimicLobby.mimicBattle,
          turn: { ...mimicLobby.mimicBattle.turn, challengeId: "unknown_face" },
        },
      }),
    ).toThrow();
  });
});

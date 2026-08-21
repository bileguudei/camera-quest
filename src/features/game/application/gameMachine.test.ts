import { createActor } from "xstate";
import { describe, expect, it } from "vitest";
import { gameMachine } from "./gameMachine";

const player = {
  id: "00000000-0000-4000-8000-000000000001",
  profileId: "00000000-0000-4000-8000-000000000001",
  seat: 1,
  name: "Номин",
  color: "violet" as const,
  avatar: "aperture",
  score: 0,
  totalXp: 0,
  level: 1,
  streak: 0,
};

describe("game machine", () => {
  it("follows the typed production turn states", () => {
    const actor = createActor(gameMachine).start();
    actor.send({ type: "OPEN_SETUP" });
    actor.send({ type: "CONFIRM_PLAYERS" });
    actor.send({
      type: "START_GAME",
      session: {
        gameId: "00000000-0000-4000-8000-000000000002",
        environment: "home",
        players: [player],
      },
    });
    actor.send({ type: "BEGIN_ROUND" });
    actor.send({ type: "PLAYER_READY" });
    expect(actor.getSnapshot().value).toBe("calibrating");

    actor.send({
      type: "TURN_PREPARED",
      calibrationToken: "signed-calibration-token",
      turn: {
        turnId: "00000000-0000-4000-8000-000000000003",
        challenge: {
          id: "obj-cup",
          kind: "object",
          label: "Аяга",
          prompt: "АЯГА ОЛ",
          difficulty: "easy",
          targetClass: "cup",
          validatorConfig: {},
        },
      },
    });
    actor.send({ type: "REVEAL_DONE" });
    actor.send({
      type: "TURN_ACTIVATED",
      active: {
        turnId: "00000000-0000-4000-8000-000000000003",
        startedAt: "2026-08-12T00:00:00.000Z",
        deadlineAt: "2026-08-12T00:00:30.000Z",
        serverNow: "2026-08-12T00:00:00.000Z",
      },
    });
    expect(actor.getSnapshot().value).toBe("playing");

    actor.send({
      type: "TURN_RESOLVED",
      outcome: {
        turnId: "00000000-0000-4000-8000-000000000003",
        playerId: player.id,
        playerName: player.name,
        playerColor: player.color,
        challengeId: "obj-cup",
        challengePrompt: "АЯГА ОЛ",
        success: true,
        timeMs: 4_000,
        points: 25,
        xp: 25,
        totalAfter: 25,
        totalXp: 25,
        level: 1,
        streak: 1,
        unlockedAchievementIds: ["first_clear", "quick_draw"],
      },
    });
    expect(actor.getSnapshot().value).toBe("turnResult");
    expect(actor.getSnapshot().context.players[0].score).toBe(25);
  });

  it("ignores duplicate resolution outside the playing state", () => {
    const actor = createActor(gameMachine).start();
    const before = actor.getSnapshot().context.players;
    actor.send({ type: "TURN_RESOLVED", outcome: {} as never });
    expect(actor.getSnapshot().context.players).toBe(before);
  });
});

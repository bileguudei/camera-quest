import { describe, expect, it } from "vitest";
import { QUEST_CATALOG, pickLocalQuest } from "./questCatalog";
import { questConditions } from "./questConditions";
import type { Challenge, GameEnvironment } from "./types";

const challenge = (validatorConfig: Record<string, unknown>): Challenge => ({
  id: "q",
  kind: "object",
  label: "Q",
  prompt: "Q",
  difficulty: "medium",
  targetClass: "bottle",
  validatorConfig,
});

const ENVIRONMENTS: GameEnvironment[] = ["school", "home", "outdoor"];

describe("questConditions", () => {
  it("draws nothing for a turn that wants a single object", () => {
    expect(questConditions(challenge({ confidence: 0.55 }))).toEqual([]);
  });

  it("names each thing the turn wants at once", () => {
    expect(
      questConditions(
        challenge({
          targetClasses: ["book", "cup"],
          targetLabels: ["Ном", "Аяга"],
        }),
      ),
    ).toEqual([
      { targetClass: "book", label: "Ном", count: 1 },
      { targetClass: "cup", label: "Аяга", count: 1 },
    ]);
  });

  it("collapses a repeated class into a count", () => {
    expect(
      questConditions(
        challenge({
          targetClasses: ["bottle", "bottle"],
          targetLabels: ["Лонх", "Лонх"],
        }),
      ),
    ).toEqual([{ targetClass: "bottle", label: "Лонх", count: 2 }]);
  });

  it("falls back to the class name when the quest carries no labels", () => {
    expect(
      questConditions(challenge({ targetClasses: ["book", "cup"] })),
    ).toEqual([
      { targetClass: "book", label: "book", count: 1 },
      { targetClass: "cup", label: "cup", count: 1 },
    ]);
  });
});

describe("quest catalogue difficulty", () => {
  it("keeps every easy object quest down to one thing", () => {
    const easy = QUEST_CATALOG.filter((quest) => quest.difficulty === "easy");
    expect(easy.length).toBeGreaterThan(0);
    expect(easy.flatMap(questConditions)).toEqual([]);
  });

  it("gives every medium and hard object quest a condition", () => {
    const harder = QUEST_CATALOG.filter(
      (quest) => quest.kind === "object" && quest.difficulty !== "easy",
    );
    expect(harder.length).toBeGreaterThan(0);
    for (const quest of harder) {
      const wanted = questConditions(quest).reduce(
        (total, condition) => total + condition.count,
        0,
      );
      expect(wanted).toBeGreaterThan(1);
    }
  });

  it("can fill five distinct rounds in every room", () => {
    for (const environment of ENVIRONMENTS) {
      const used = new Set<string>();
      for (const difficulty of [
        "easy",
        "easy",
        "medium",
        "medium",
        "hard",
      ] as const) {
        const quest = pickLocalQuest(difficulty, used, [], environment);
        expect(quest.difficulty).toBe(difficulty);
        used.add(quest.id);
      }
      expect(used.size).toBe(5);
    }
  });
});

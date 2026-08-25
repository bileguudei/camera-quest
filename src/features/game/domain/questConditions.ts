import type { Challenge } from "./types";

/** One line of a turn's condition: what to find, and how many of it. */
export interface QuestCondition {
  targetClass: string;
  label: string;
  count: number;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? (value as string[])
    : [];
}

/**
 * A turn past the easy rounds asks for more than one thing in shot at once.
 * `targetClasses` is the list the server checks — a class repeated in it means
 * "two of these" — and `targetLabels` names each one for the screen. A plain
 * single-object turn returns nothing, so nothing extra is drawn for it.
 */
export function questConditions(challenge: Challenge): QuestCondition[] {
  const classes = stringList(challenge.validatorConfig.targetClasses);
  if (classes.length < 2) return [];
  const labels = stringList(challenge.validatorConfig.targetLabels);
  const conditions: QuestCondition[] = [];
  classes.forEach((targetClass, index) => {
    const existing = conditions.find(
      (condition) => condition.targetClass === targetClass,
    );
    if (existing) existing.count += 1;
    else
      conditions.push({
        targetClass,
        label: labels[index] ?? targetClass,
        count: 1,
      });
  });
  return conditions;
}

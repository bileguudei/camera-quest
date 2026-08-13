import type { Challenge } from "./types";

const object = (
  id: string,
  label: string,
  prompt: string,
  difficulty: Challenge["difficulty"],
  targetClass: string,
): Challenge => ({
  id,
  kind: "object",
  label,
  prompt,
  difficulty,
  targetClass,
  validatorConfig: { confidence: 0.65, borderlineMin: 0.45, consensus: 3 },
});

const fingers = (
  count: 1 | 2 | 3 | 4 | 5,
  difficulty: Challenge["difficulty"],
): Challenge => ({
  id: `fingers-${count}`,
  kind: "fingers",
  label: `${count} хуруу`,
  prompt: `${count} ХУРУУ ХАРУУЛ`,
  difficulty,
  fingerCount: count,
  validatorConfig: { count, consensus: 4 },
});

const color = (
  name: "red" | "blue" | "green" | "yellow",
  label: string,
  hex: string,
  difficulty: Challenge["difficulty"],
): Challenge => ({
  id: `color-${name}`,
  kind: "color",
  label,
  prompt: `${label.toUpperCase()} ЗҮЙЛ ОЛ`,
  difficulty,
  color: name,
  hex,
  validatorConfig: { minArea: 0.12, saturation: 0.45, value: 0.25, consensus: 4 },
});

export const QUEST_CATALOG: Challenge[] = [
  color("red", "Улаан", "#ff4d4d", "easy"),
  color("blue", "Цэнхэр", "#3d8bff", "easy"),
  color("green", "Ногоон", "#3be08a", "medium"),
  color("yellow", "Шар", "#ffd24a", "medium"),
  object("obj-bottle", "Лонх", "ЛОНХ ОЛ", "easy", "bottle"),
  object("obj-cup", "Аяга", "АЯГА ОЛ", "easy", "cup"),
  object("obj-book", "Ном", "НОМ ХАРУУЛ", "easy", "book"),
  object("obj-phone", "Утас", "УТАС ОЛ", "medium", "cell phone"),
  object("obj-backpack", "Үүргэвч", "ҮҮРГЭВЧ ОЛ", "medium", "backpack"),
  object("obj-handbag", "Цүнх", "ЦҮНХ ОЛ", "medium", "handbag"),
  object("obj-keyboard", "Keyboard", "KEYBOARD ОЛ", "hard", "keyboard"),
  object("obj-mouse", "Mouse", "MOUSE ОЛ", "hard", "mouse"),
  fingers(1, "easy"),
  fingers(2, "easy"),
  fingers(3, "medium"),
  fingers(4, "hard"),
  fingers(5, "hard"),
  {
    id: "smile",
    kind: "smile",
    label: "Инээмсэглэл",
    prompt: "ИНЭЭМСЭГЛЭ",
    difficulty: "hard",
    validatorConfig: { delta: 0.35, absolute: 0.55, consensus: 4 },
  },
];

export function pickLocalQuest(
  difficulty: Challenge["difficulty"],
  usedIds: ReadonlySet<string>,
  backgroundClasses: readonly string[],
): Challenge {
  const available = QUEST_CATALOG.filter(
    (quest) =>
      quest.difficulty === difficulty &&
      !usedIds.has(quest.id) &&
      (!quest.targetClass || !backgroundClasses.includes(quest.targetClass)),
  );
  const fallback = QUEST_CATALOG.filter(
    (quest) => quest.difficulty === difficulty && !usedIds.has(quest.id),
  );
  const pool = available.length > 0 ? available : fallback;
  if (pool.length === 0) throw new Error(`No unused ${difficulty} quest is configured`);
  return pool[Math.floor(Math.random() * pool.length)];
}

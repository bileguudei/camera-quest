import type { Challenge, GameEnvironment } from "./types";

/**
 * Development and E2E fixture. It mirrors the seeded rows closely enough to
 * exercise the same flow — Supabase stays authoritative in production.
 */
interface LocalQuest {
  challenge: Challenge;
  environments: readonly GameEnvironment[];
  /** Carried to the camera rather than walked to; drawn three times as often. */
  portable: boolean;
}

const ANYWHERE: readonly GameEnvironment[] = ["school", "home", "outdoor"];

const object = (
  id: string,
  label: string,
  prompt: string,
  difficulty: Challenge["difficulty"],
  targetClass: string,
  environments: readonly GameEnvironment[] = ANYWHERE,
  portable = true,
): LocalQuest => ({
  environments,
  portable,
  challenge: {
    id,
    kind: "object",
    label,
    prompt,
    difficulty,
    targetClass,
    validatorConfig: { confidence: 0.55, borderlineMin: 0.45, consensus: 2 },
  },
});

const color = (
  name: "red" | "blue" | "green" | "yellow",
  label: string,
  hex: string,
  difficulty: Challenge["difficulty"],
): LocalQuest => ({
  environments: ANYWHERE,
  portable: true,
  challenge: {
    id: `color-${name}`,
    kind: "color",
    label,
    prompt: `${label.toUpperCase()} ЗҮЙЛ ОЛ`,
    difficulty,
    color: name,
    hex,
    validatorConfig: {
      minArea: 0.025,
      minRegionArea: 0.015,
      saturation: name === "red" ? 0.36 : 0.3,
      value: 0.18,
      consensus: 3,
    },
  },
});

const LOCAL_QUESTS: LocalQuest[] = [
  color("red", "Улаан", "#ff4d4d", "easy"),
  color("blue", "Цэнхэр", "#3d8bff", "easy"),
  color("green", "Ногоон", "#3be08a", "medium"),
  color("yellow", "Шар", "#ffd24a", "medium"),

  // Indoors, school and home
  object("obj-bottle", "Лонх", "ЛОНХ ОЛ", "easy", "bottle"),
  object("obj-cup", "Аяга", "АЯГА ОЛ", "easy", "cup", ["school", "home"]),
  object("obj-book", "Ном", "НОМ ХАРУУЛ", "easy", "book", ["school", "home"]),
  object("obj-chair", "Сандал", "САНДАЛ ОЛ", "easy", "chair", ["school", "home"], false),
  object("obj-dining-table", "Ширээ", "ШИРЭЭ ОЛ", "easy", "dining table", ["school", "home"], false),
  object("obj-phone", "Утас", "УТАС ОЛ", "medium", "cell phone"),
  object("obj-backpack", "Үүргэвч", "ҮҮРГЭВЧ ОЛ", "medium", "backpack"),
  object("obj-handbag", "Цүнх", "ЦҮНХ ОЛ", "medium", "handbag"),
  object("obj-laptop", "Зөөврийн компьютер", "ЗӨӨВРИЙН КОМПЬЮТЕР ОЛ", "medium", "laptop", [
    "school",
    "home",
  ]),
  object("obj-keyboard", "Keyboard", "KEYBOARD ОЛ", "hard", "keyboard", ["school", "home"]),
  object("obj-mouse", "Mouse", "MOUSE ОЛ", "hard", "mouse", ["school", "home"]),
  object("obj-scissors", "Хайч", "ХАЙЧ ОЛ", "hard", "scissors", ["school", "home"]),

  // Home only
  object("obj-carrot", "Лууван", "ЛУУВАН ОЛ", "easy", "carrot", ["home"]),
  object("obj-couch", "Буйдан", "БУЙДАН ОЛ", "easy", "couch", ["home"], false),
  object("obj-bed", "Ор", "ОР ОЛ", "easy", "bed", ["home"], false),
  object("obj-spoon", "Халбага", "ХАЛБАГА ОЛ", "medium", "spoon", ["home"]),
  object("obj-refrigerator", "Хөргөгч", "ХӨРГӨГЧ ОЛ", "medium", "refrigerator", ["home"], false),
  object("obj-vase", "Ваар", "ВААР ОЛ", "hard", "vase", ["home"]),
  object("obj-teddy-bear", "Тоглоомон баавгай", "ТОГЛООМОН БААВГАЙ ОЛ", "hard", "teddy bear", [
    "home",
  ]),

  // Outdoors
  object("obj-car", "Машин", "МАШИН ОЛ", "easy", "car", ["outdoor"], false),
  object("obj-bicycle", "Дугуй", "ДУГУЙ ОЛ", "easy", "bicycle", ["outdoor"], false),
  object("obj-bench", "Гудамжны сандал", "ГУДАМЖНЫ САНДАЛ ОЛ", "easy", "bench", ["outdoor"], false),
  object("obj-dog", "Нохой", "НОХОЙ ОЛ", "medium", "dog", ["outdoor"], false),
  object("obj-bus", "Автобус", "АВТОБУС ОЛ", "medium", "bus", ["outdoor"], false),
  object("obj-traffic-light", "Гэрлэн дохио", "ГЭРЛЭН ДОХИО ОЛ", "medium", "traffic light", [
    "outdoor",
  ], false),
  object("obj-motorcycle", "Мотоцикль", "МОТОЦИКЛЬ ОЛ", "hard", "motorcycle", ["outdoor"], false),

  {
    environments: ANYWHERE,
    portable: true,
    challenge: {
      id: "smile",
      kind: "smile",
      label: "Инээмсэглэл",
      prompt: "ИНЭЭМСЭГЛЭ",
      difficulty: "hard",
      validatorConfig: { delta: 0.35, absolute: 0.55, consensus: 4 },
    },
  },
];

export const QUEST_CATALOG: Challenge[] = LOCAL_QUESTS.map((quest) => quest.challenge);

export function pickLocalQuest(
  difficulty: Challenge["difficulty"],
  usedIds: ReadonlySet<string>,
  backgroundClasses: readonly string[],
  environment: GameEnvironment = "home",
): Challenge {
  const inRoom = LOCAL_QUESTS.filter(
    (quest) =>
      quest.challenge.difficulty === difficulty &&
      quest.environments.includes(environment) &&
      !usedIds.has(quest.challenge.id),
  );
  // Preferring a target the calibration did not already see keeps the hunt real
  // rather than "point at what is already in frame".
  const unseen = inRoom.filter(
    (quest) =>
      !quest.challenge.targetClass || !backgroundClasses.includes(quest.challenge.targetClass),
  );
  const pool = unseen.length > 0 ? unseen : inRoom;
  if (pool.length === 0) throw new Error(`No unused ${difficulty} quest is configured`);
  // Weighted draw: something you can fetch beats something you point at.
  const weighted = pool.flatMap((quest) => (quest.portable ? [quest, quest, quest] : [quest]));
  return weighted[Math.floor(Math.random() * weighted.length)].challenge;
}

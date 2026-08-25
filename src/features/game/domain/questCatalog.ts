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
const INDOORS: readonly GameEnvironment[] = ["school", "home"];

/** One thing in shot. Every one of these is an easy round now. */
const object = (
  id: string,
  label: string,
  prompt: string,
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
    difficulty: "easy",
    targetClass,
    validatorConfig: { confidence: 0.55, borderlineMin: 0.45, consensus: 2 },
  },
});

/**
 * The harder rounds ask for a condition: several things held in one frame at
 * the same time. A class repeated in `targetClasses` is how "two of these" is
 * written, and `targetLabels` is what the screen ticks off one by one.
 */
const combo = (
  id: string,
  label: string,
  prompt: string,
  difficulty: "medium" | "hard",
  targets: readonly (readonly [string, string])[],
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
    targetClass: targets[0][0],
    validatorConfig: {
      targetClasses: targets.map(([targetClass]) => targetClass),
      targetLabels: targets.map(([, name]) => name),
      // Two things at once is already the difficulty; the per-object bar is
      // lowered a little so a fair attempt is not lost to one weak reading.
      confidence: 0.5,
      borderlineMin: 0.45,
      consensus: 2,
    },
  },
});

const color = (
  name: "red" | "blue" | "green" | "yellow",
  label: string,
  hex: string,
): LocalQuest => ({
  environments: ANYWHERE,
  portable: true,
  challenge: {
    id: `color-${name}`,
    kind: "color",
    label,
    prompt: `${label.toUpperCase()} ЗҮЙЛ ОЛ`,
    difficulty: "easy",
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
  color("red", "Улаан", "#ff4d4d"),
  color("blue", "Цэнхэр", "#3d8bff"),
  color("green", "Ногоон", "#3be08a"),
  color("yellow", "Шар", "#ffd24a"),

  // ---- Easy: one thing ----------------------------------------------------
  object("obj-bottle", "Лонх", "ЛОНХ ОЛ", "bottle"),
  object("obj-cup", "Аяга", "АЯГА ОЛ", "cup", INDOORS),
  object("obj-book", "Ном", "НОМ ХАРУУЛ", "book", INDOORS),
  object("obj-chair", "Сандал", "САНДАЛ ОЛ", "chair", INDOORS, false),
  object(
    "obj-dining-table",
    "Ширээ",
    "ШИРЭЭ ОЛ",
    "dining table",
    INDOORS,
    false,
  ),
  object("obj-phone", "Утас", "УТАС ОЛ", "cell phone"),
  object("obj-backpack", "Үүргэвч", "ҮҮРГЭВЧ ОЛ", "backpack"),
  object("obj-handbag", "Цүнх", "ЦҮНХ ОЛ", "handbag"),
  object("obj-laptop", "Компьютер", "КОМПЬЮТЕР ОЛ", "laptop", INDOORS),
  object("obj-keyboard", "Keyboard", "KEYBOARD ОЛ", "keyboard", INDOORS),
  object("obj-mouse", "Mouse", "MOUSE ОЛ", "mouse", INDOORS),
  object("obj-scissors", "Хайч", "ХАЙЧ ОЛ", "scissors", INDOORS),
  object("obj-carrot", "Лууван", "ЛУУВАН ОЛ", "carrot", ["home"]),
  object("obj-couch", "Буйдан", "БУЙДАН ОЛ", "couch", ["home"], false),
  object("obj-bed", "Ор", "ОР ОЛ", "bed", ["home"], false),
  object("obj-spoon", "Халбага", "ХАЛБАГА ОЛ", "spoon", ["home"]),
  object(
    "obj-refrigerator",
    "Хөргөгч",
    "ХӨРГӨГЧ ОЛ",
    "refrigerator",
    ["home"],
    false,
  ),
  object("obj-vase", "Ваар", "ВААР ОЛ", "vase", ["home"]),
  object("obj-teddy-bear", "Баавгай", "БААВГАЙ ОЛ", "teddy bear", ["home"]),
  object("obj-car", "Машин", "МАШИН ОЛ", "car", ["outdoor"], false),
  object("obj-bicycle", "Дугуй", "ДУГУЙ ОЛ", "bicycle", ["outdoor"], false),
  object(
    "obj-bench",
    "Гудамжны сандал",
    "ГУДАМЖНЫ САНДАЛ ОЛ",
    "bench",
    ["outdoor"],
    false,
  ),
  object("obj-dog", "Нохой", "НОХОЙ ОЛ", "dog", ["outdoor"], false),
  object("obj-bus", "Автобус", "АВТОБУС ОЛ", "bus", ["outdoor"], false),
  object(
    "obj-traffic-light",
    "Гэрлэн дохио",
    "ГЭРЛЭН ДОХИО ОЛ",
    "traffic light",
    ["outdoor"],
    false,
  ),
  object(
    "obj-motorcycle",
    "Мотоцикль",
    "МОТОЦИКЛЬ ОЛ",
    "motorcycle",
    ["outdoor"],
    false,
  ),

  // ---- Medium: two things at once ----------------------------------------
  combo("combo-phone-bottle", "Утас + Лонх", "УТАС БА ЛОНХ ЗЭРЭГ", "medium", [
    ["cell phone", "Утас"],
    ["bottle", "Лонх"],
  ]),
  combo("combo-person-bottle", "Хүн + Лонх", "ХҮН БА ЛОНХ ЗЭРЭГ", "medium", [
    ["person", "Хүн"],
    ["bottle", "Лонх"],
  ]),
  combo("combo-two-bottles", "Хоёр лонх", "ХОЁР ЛОНХ ЗЭРЭГ", "medium", [
    ["bottle", "Лонх"],
    ["bottle", "Лонх"],
  ]),
  combo(
    "combo-backpack-phone",
    "Үүргэвч + Утас",
    "ҮҮРГЭВЧ БА УТАС ЗЭРЭГ",
    "medium",
    [
      ["backpack", "Үүргэвч"],
      ["cell phone", "Утас"],
    ],
  ),
  combo(
    "combo-book-cup",
    "Ном + Аяга",
    "НОМ БА АЯГА ЗЭРЭГ",
    "medium",
    [
      ["book", "Ном"],
      ["cup", "Аяга"],
    ],
    INDOORS,
  ),
  combo(
    "combo-chair-book",
    "Сандал + Ном",
    "САНДАЛ БА НОМ ЗЭРЭГ",
    "medium",
    [
      ["chair", "Сандал"],
      ["book", "Ном"],
    ],
    INDOORS,
    false,
  ),
  combo(
    "combo-laptop-phone",
    "Компьютер + Утас",
    "КОМПЬЮТЕР БА УТАС ЗЭРЭГ",
    "medium",
    [
      ["laptop", "Компьютер"],
      ["cell phone", "Утас"],
    ],
    INDOORS,
  ),
  combo(
    "combo-table-cup",
    "Ширээ + Аяга",
    "ШИРЭЭ БА АЯГА ЗЭРЭГ",
    "medium",
    [
      ["dining table", "Ширээ"],
      ["cup", "Аяга"],
    ],
    INDOORS,
    false,
  ),
  combo(
    "combo-two-chairs",
    "Хоёр сандал",
    "ХОЁР САНДАЛ ЗЭРЭГ",
    "medium",
    [
      ["chair", "Сандал"],
      ["chair", "Сандал"],
    ],
    INDOORS,
    false,
  ),
  combo(
    "combo-backpack-book",
    "Үүргэвч + Ном",
    "ҮҮРГЭВЧ БА НОМ ЗЭРЭГ",
    "medium",
    [
      ["backpack", "Үүргэвч"],
      ["book", "Ном"],
    ],
    INDOORS,
  ),
  combo(
    "combo-couch-tv",
    "Буйдан + Телевиз",
    "БУЙДАН БА ТЕЛЕВИЗ ЗЭРЭГ",
    "medium",
    [
      ["couch", "Буйдан"],
      ["tv", "Телевиз"],
    ],
    ["home"],
    false,
  ),
  combo(
    "combo-bowl-spoon",
    "Таваг + Халбага",
    "ТАВАГ БА ХАЛБАГА ЗЭРЭГ",
    "medium",
    [
      ["bowl", "Таваг"],
      ["spoon", "Халбага"],
    ],
    ["home"],
  ),
  combo(
    "combo-cup-spoon",
    "Аяга + Халбага",
    "АЯГА БА ХАЛБАГА ЗЭРЭГ",
    "medium",
    [
      ["cup", "Аяга"],
      ["spoon", "Халбага"],
    ],
    ["home"],
  ),
  combo(
    "combo-fridge-bottle",
    "Хөргөгч + Лонх",
    "ХӨРГӨГЧ БА ЛОНХ ЗЭРЭГ",
    "medium",
    [
      ["refrigerator", "Хөргөгч"],
      ["bottle", "Лонх"],
    ],
    ["home"],
    false,
  ),
  combo(
    "combo-car-person",
    "Машин + Хүн",
    "МАШИН БА ХҮН ЗЭРЭГ",
    "medium",
    [
      ["car", "Машин"],
      ["person", "Хүн"],
    ],
    ["outdoor"],
    false,
  ),
  combo(
    "combo-bicycle-person",
    "Дугуй + Хүн",
    "ДУГУЙ БА ХҮН ЗЭРЭГ",
    "medium",
    [
      ["bicycle", "Дугуй"],
      ["person", "Хүн"],
    ],
    ["outdoor"],
    false,
  ),
  combo(
    "combo-two-cars",
    "Хоёр машин",
    "ХОЁР МАШИН ЗЭРЭГ",
    "medium",
    [
      ["car", "Машин"],
      ["car", "Машин"],
    ],
    ["outdoor"],
    false,
  ),
  combo(
    "combo-bench-person",
    "Сандал + Хүн",
    "ГУДАМЖНЫ САНДАЛ БА ХҮН ЗЭРЭГ",
    "medium",
    [
      ["bench", "Сандал"],
      ["person", "Хүн"],
    ],
    ["outdoor"],
    false,
  ),
  combo(
    "combo-car-traffic-light",
    "Машин + Гэрлэн дохио",
    "МАШИН БА ГЭРЛЭН ДОХИО ЗЭРЭГ",
    "medium",
    [
      ["car", "Машин"],
      ["traffic light", "Гэрлэн дохио"],
    ],
    ["outdoor"],
    false,
  ),

  // ---- Hard: rarer pairs, or three at once --------------------------------
  combo("combo-three-bottles", "Гурван лонх", "ГУРВАН ЛОНХ ЗЭРЭГ", "hard", [
    ["bottle", "Лонх"],
    ["bottle", "Лонх"],
    ["bottle", "Лонх"],
  ]),
  combo(
    "combo-phone-book-bottle",
    "Утас + Ном + Лонх",
    "УТАС, НОМ, ЛОНХ ЗЭРЭГ",
    "hard",
    [
      ["cell phone", "Утас"],
      ["book", "Ном"],
      ["bottle", "Лонх"],
    ],
    INDOORS,
  ),
  combo(
    "combo-keyboard-mouse",
    "Keyboard + Mouse",
    "KEYBOARD БА MOUSE ЗЭРЭГ",
    "hard",
    [
      ["keyboard", "Keyboard"],
      ["mouse", "Mouse"],
    ],
    INDOORS,
  ),
  combo(
    "combo-laptop-mouse-cup",
    "Компьютер + Mouse + Аяга",
    "КОМПЬЮТЕР, MOUSE, АЯГА ЗЭРЭГ",
    "hard",
    [
      ["laptop", "Компьютер"],
      ["mouse", "Mouse"],
      ["cup", "Аяга"],
    ],
    INDOORS,
  ),
  combo(
    "combo-scissors-book",
    "Хайч + Ном",
    "ХАЙЧ БА НОМ ЗЭРЭГ",
    "hard",
    [
      ["scissors", "Хайч"],
      ["book", "Ном"],
    ],
    INDOORS,
  ),
  combo(
    "combo-keyboard-phone",
    "Keyboard + Утас",
    "KEYBOARD БА УТАС ЗЭРЭГ",
    "hard",
    [
      ["keyboard", "Keyboard"],
      ["cell phone", "Утас"],
    ],
    INDOORS,
  ),
  combo(
    "combo-tie-person",
    "Зангиа + Хүн",
    "ЗАНГИА БА ХҮН ЗЭРЭГ",
    "hard",
    [
      ["tie", "Зангиа"],
      ["person", "Хүн"],
    ],
    ["school"],
    false,
  ),
  combo(
    "combo-vase-plant",
    "Ваар + Цэцэг",
    "ВААР БА ЦЭЦЭГ ЗЭРЭГ",
    "hard",
    [
      ["vase", "Ваар"],
      ["potted plant", "Цэцэг"],
    ],
    ["home"],
  ),
  combo(
    "combo-wine-glass-bottle",
    "Хундага + Лонх",
    "ХУНДАГА БА ЛОНХ ЗЭРЭГ",
    "hard",
    [
      ["wine glass", "Хундага"],
      ["bottle", "Лонх"],
    ],
    ["home"],
  ),
  combo(
    "combo-teddy-bed",
    "Баавгай + Ор",
    "БААВГАЙ БА ОР ЗЭРЭГ",
    "hard",
    [
      ["teddy bear", "Баавгай"],
      ["bed", "Ор"],
    ],
    ["home"],
    false,
  ),
  combo(
    "combo-fork-knife-spoon",
    "Сэрээ + Хутга + Халбага",
    "СЭРЭЭ, ХУТГА, ХАЛБАГА ЗЭРЭГ",
    "hard",
    [
      ["fork", "Сэрээ"],
      ["knife", "Хутга"],
      ["spoon", "Халбага"],
    ],
    ["home"],
  ),
  combo(
    "combo-toothbrush-cup",
    "Сойз + Аяга",
    "СОЙЗ БА АЯГА ЗЭРЭГ",
    "hard",
    [
      ["toothbrush", "Сойз"],
      ["cup", "Аяга"],
    ],
    ["home"],
  ),
  combo(
    "combo-motorcycle-person",
    "Мотоцикль + Хүн",
    "МОТОЦИКЛЬ БА ХҮН ЗЭРЭГ",
    "hard",
    [
      ["motorcycle", "Мотоцикль"],
      ["person", "Хүн"],
    ],
    ["outdoor"],
    false,
  ),
  combo(
    "combo-stop-sign-car",
    "Зогсох тэмдэг + Машин",
    "ЗОГСОХ ТЭМДЭГ БА МАШИН ЗЭРЭГ",
    "hard",
    [
      ["stop sign", "Зогсох тэмдэг"],
      ["car", "Машин"],
    ],
    ["outdoor"],
    false,
  ),
  combo(
    "combo-three-cars",
    "Гурван машин",
    "ГУРВАН МАШИН ЗЭРЭГ",
    "hard",
    [
      ["car", "Машин"],
      ["car", "Машин"],
      ["car", "Машин"],
    ],
    ["outdoor"],
    false,
  ),
  combo(
    "combo-dog-person",
    "Нохой + Хүн",
    "НОХОЙ БА ХҮН ЗЭРЭГ",
    "hard",
    [
      ["dog", "Нохой"],
      ["person", "Хүн"],
    ],
    ["outdoor"],
    false,
  ),
  combo(
    "combo-bicycle-car",
    "Дугуй + Машин",
    "ДУГУЙ БА МАШИН ЗЭРЭГ",
    "hard",
    [
      ["bicycle", "Дугуй"],
      ["car", "Машин"],
    ],
    ["outdoor"],
    false,
  ),

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

export const QUEST_CATALOG: Challenge[] = LOCAL_QUESTS.map(
  (quest) => quest.challenge,
);

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
      !quest.challenge.targetClass ||
      !backgroundClasses.includes(quest.challenge.targetClass),
  );
  const pool = unseen.length > 0 ? unseen : inRoom;
  if (pool.length === 0)
    throw new Error(`No unused ${difficulty} quest is configured`);
  // Weighted draw: something you can fetch beats something you point at.
  const weighted = pool.flatMap((quest) =>
    quest.portable ? [quest, quest, quest] : [quest],
  );
  return weighted[Math.floor(Math.random() * weighted.length)].challenge;
}

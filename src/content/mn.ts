import type { Difficulty } from "@/features/game/domain/types";

/**
 * Every string the player sees. Single file so the whole UI can be
 * proof-read (or translated) without touching components.
 */
export const mn = {
  brand: {
    name: "CAMERA QUEST",
    tagline: "Хай. Харуул. Оноо ав.",
    sub: "Камераа ашиглан даалгаврыг хамгийн хурдан биелүүлээрэй.",
  },

  landing: {
    cta: "Тоглоом эхлүүлэх",
    chips: [
      { icon: "📷", text: "Камертай тоглоно" },
      { icon: "👥", text: "1–6 тоглогч" },
      { icon: "⚡", text: "Шууд тоглоно" },
    ],
    how: "Нэг утсаар ээлжлэн тоглоно",
  },

  setup: {
    title: "Хэдүүлээ тоглох вэ?",
    sub: "Тоглогчийн тоог сонгоод нэрээ бичээрэй.",
    countLabel: "Тоглогчийн тоо",
    playerLabel: (n: number) => `Тоглогч ${n}`,
    namePlaceholder: (n: number) => `Тоглогч ${n}`,
    cta: "Камераа шалгах",
    back: "Буцах",
    hint: "Нэр хоосон бол автоматаар бөглөгдөнө.",
  },

  camera: {
    title: "Камераа шалгая",
    sub: "Бүх зүйл бэлэн болмогц эхэлнэ.",
    steps: {
      camera: { pending: "Камер шалгаж байна...", done: "Камер холбогдлоо" },
      model: { pending: "AI model ачаалж байна...", done: "AI model ачааллаа" },
      ready: { pending: "AI model бэлдэж байна...", done: "Таних систем бэлэн" },
    },
    allReady: "Бүх зүйл бэлэн!",
    switch: "Камер солих",
    front: "Урд",
    rear: "Ард",
    cta: "Тоглоом эхлүүлэх",
    ctaWaiting: "Бэлдэж байна...",
    error: {
      title: "Камерт хандах зөвшөөрөл хэрэгтэй",
      body: "Тоглохын тулд браузерт камер ашиглах зөвшөөрөл өгнө үү. Хаягийн мөрөнд байрлах 🔒 тэмдэг дээр дарж зөвшөөрөл олгож болно.",
      retry: "Дахин оролдох",
      demo: "Камергүй туршиж үзэх",
    },
    demoBadge: "Демо горим",
    engine: {
      title: "Хэн шүүх вэ?",
      ai: "Cloud AI",
      aiHint: "Түр frame боловсруулаад шууд устгана",
      device: "Demo",
      deviceHint: "Зөвхөн хөгжүүлэлт болон тест",
      unavailable: "AI үйлчилгээ тохируулагдаагүй байна",
    },
  },

  round: {
    badge: (n: number) => `РАУНД ${n}`,
    of: (n: number, total: number) => `${n} / ${total} раунд`,
    difficulty: {
      easy: "Хялбар",
      medium: "Дунд",
      hard: "Хэцүү",
    } satisfies Record<Difficulty, string>,
    blurb: {
      easy: "Энэ раундад энгийн өнгө болон өдөр тутмын эд зүйлс хайна.",
      medium: "Одоо арай нарийн зүйлс хайх болно. Танд 30 секунд бий.",
      hard: "Сүүлийн раунд. Хамгийн хэцүү даалгаврууд, 30 секунд.",
    } satisfies Record<Difficulty, string>,
    go: "ЭХЭЛЛЭЭ!",
  },

  turn: {
    whoseTurn: (name: string) => `${name}-гийн ээлж`,
    ready: "Бэлэн үү?",
    handOver: "Утсаа дараагийн тоглогчид өг",
    reveal: "Даалгавар",
    go: "GO!",
    start: "Бэлэн",
  },

  play: {
    target: "Даалгавар",
    scanning: "Хайж байна...",
    locking: "Таньж байна...",
    loading: "Таних систем ачаалж байна...",
    aim: "Камерын аль ч хэсэгт харуул",
    aiSees: (what: string) => `AI: ${what}`,
    wrong: "Энэ биш!",
    wrongIs: (what: string) => `${what} — энэ биш!`,
    paused: "Түр зогслоо",
    resume: "Үргэлжлүүлэх",
    found: "Оллоо!",
    quit: "Гарах",
    quitConfirm: "Тоглоомыг дуусгах уу?",
    quitYes: "Тийм, дуусгая",
    quitNo: "Үгүй, үргэлжлүүлье",
  },

  success: {
    title: "ОЛЛОО!",
    label: "АМЖИЛТТАЙ",
    seconds: (s: string) => `${s} секунд`,
    points: (p: number) => `+${p} оноо`,
    total: "Нийт оноо",
    next: "Дараагийн тоглогч",
    nextRound: "Раундын дүн",
    finish: "Дүн харах",
  },

  fail: {
    title: "ХУГАЦАА ДУУСЛАА",
    label: "ОЛСОНГҮЙ",
    points: "+0 оноо",
    task: (prompt: string) => `Даалгавар: ${prompt}`,
    encourage: "Зүгээр ээ, дараагийн ээлжид олно!",
  },

  roundResult: {
    title: (n: number) => `РАУНД ${n} ДУУСЛАА`,
    sub: "Одоогийн байдал",
    next: "Дараагийн раунд",
    finish: "Ялагчийг харах",
    noChange: "—",
  },

  winner: {
    crown: "🏆",
    title: (name: string) => `${name} ЯЛЛАА!`,
    tie: "ТЭНЦЛЭЭ!",
    points: (p: number) => `${p} оноо`,
    board: "Эцсийн байр",
    again: "Дахин тоглох",
    newGame: "Шинэ тоглоом",
    soloDone: "Тоглоом дууслаа",
  },

  common: {
    points: "оноо",
    player: "тоглогч",
    you: "Та",
  },
} as const;

/** Default names used when a player leaves the field blank. */
export const DEFAULT_NAMES = [
  "Батаа",
  "Номин",
  "Саруул",
  "Тэмүүжин",
  "Анужин",
  "Төгөлдөр",
];

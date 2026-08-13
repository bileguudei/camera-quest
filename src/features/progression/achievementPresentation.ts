const achievementNames: Record<string, string> = {
  first_clear: "Анхны ялалт",
  quick_draw: "Цахилгаан хурд",
  on_fire: "Галтай тоглолт",
  unstoppable: "Зогсоошгүй",
  perfect_game: "Төгс тоглолт",
  rainbow: "Солонго",
  object_hunter: "Объектын ангууч",
};

export function achievementName(id: string): string {
  return achievementNames[id] ?? id;
}

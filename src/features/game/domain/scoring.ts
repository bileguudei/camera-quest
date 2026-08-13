import { BASE_POINTS, SPEED_POINTS } from "./config";
import type { Difficulty, Player, RankRow } from "./types";

export function scoreTurn(difficulty: Difficulty, elapsedMs: number): number {
  const remainingRatio = Math.max(0, 30_000 - elapsedMs) / 30_000;
  return BASE_POINTS[difficulty] + Math.round(SPEED_POINTS[difficulty] * remainingRatio);
}

export function levelForXp(totalXp: number): number {
  for (let level = 50; level >= 2; level -= 1) {
    if (totalXp >= 50 * (level - 1) * level) return level;
  }
  return 1;
}

export function formatSeconds(ms: number): string {
  return (ms / 1000).toFixed(1);
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function rank(players: Player[]): { player: Player; rank: number }[] {
  const sorted = [...players].sort((a, b) => b.score - a.score || a.seat - b.seat);
  let lastScore = Number.NaN;
  let lastRank = 0;
  return sorted.map((player, index) => {
    const nextRank = player.score === lastScore ? lastRank : index + 1;
    lastScore = player.score;
    lastRank = nextRank;
    return { player, rank: nextRank };
  });
}

export function rankWithMovement(
  players: Player[],
  snapshot: Record<string, number>,
): RankRow[] {
  const previous = rank(players.map((player) => ({ ...player, score: snapshot[player.id] ?? 0 })));
  const previousRank = new Map(previous.map((row) => [row.player.id, row.rank]));
  return rank(players).map(({ player, rank: nextRank }) => ({
    player,
    rank: nextRank,
    delta: (previousRank.get(player.id) ?? nextRank) - nextRank,
    gained: player.score - (snapshot[player.id] ?? 0),
  }));
}

export function winners(players: Player[]): Player[] {
  const top = Math.max(...players.map((player) => player.score));
  return players.filter((player) => player.score === top);
}

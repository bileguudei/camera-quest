export function remainingFromDeadline(
  deadlineAtMs: number,
  serverClockOffsetMs: number,
  localNowMs = Date.now(),
): number {
  return Math.max(0, deadlineAtMs - (localNowMs + serverClockOffsetMs));
}

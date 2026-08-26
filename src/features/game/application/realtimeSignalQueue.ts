import type { TurnSignal } from "../domain/types";

/** Preserves one-shot WebRTC negotiation messages while Realtime is joining. */
export class RealtimeSignalQueue {
  private readonly values: TurnSignal[] = [];

  constructor(private readonly capacity = 64) {}

  push(signal: TurnSignal): void {
    if (this.values.length >= this.capacity) this.values.shift();
    this.values.push(signal);
  }

  drain(): TurnSignal[] {
    return this.values.splice(0);
  }

  clear(): void {
    this.values.splice(0);
  }
}

/** A watcher that stopped pinging no longer keeps the costly fallback alive. */
export class WatcherHeartbeatRegistry {
  private readonly seenAt = new Map<string, number>();

  touch(id: string, now = Date.now()): void {
    this.seenAt.set(id, now);
  }

  ids(): string[] {
    return [...this.seenAt.keys()];
  }

  expire(before: number): string[] {
    const expired: string[] = [];
    for (const [id, seenAt] of this.seenAt) {
      if (seenAt >= before) continue;
      expired.push(id);
      this.seenAt.delete(id);
    }
    return expired;
  }

  clear(): void {
    this.seenAt.clear();
  }
}

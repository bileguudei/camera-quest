"use client";

import { useEffect } from "react";

/** The database permits another lobby member to expire a turn after 5s. */
export const SPECTATOR_RECOVERY_GRACE_MS = 5_250;

interface ExpiredTurnRecoveryOptions {
  enabled: boolean;
  turnId: string | null;
  deadlineAt: string | null;
  /** Null means the turn is resolved; a number schedules another attempt. */
  recover: (turnId: string) => Promise<number | null>;
}

/**
 * Gives every watching phone the same recovery timer. The server remains the
 * authority: simultaneous attempts are harmless because expiry is row-locked.
 */
export function useExpiredTurnRecovery({
  enabled,
  turnId,
  deadlineAt,
  recover,
}: ExpiredTurnRecoveryOptions): void {
  useEffect(() => {
    if (!enabled || !turnId || !deadlineAt) return;

    let cancelled = false;
    let timer: number | null = null;
    const schedule = (delayMs: number) => {
      timer = window.setTimeout(() => {
        void recover(turnId).then(
          (retryAfterMs) => {
            if (!cancelled && retryAfterMs !== null) schedule(Math.max(1_000, retryAfterMs));
          },
          () => {
            if (!cancelled) schedule(2_000);
          },
        );
      }, Math.max(0, delayMs));
    };

    schedule(
      Math.max(
        1_000,
        Date.parse(deadlineAt) - Date.now() + SPECTATOR_RECOVERY_GRACE_MS,
      ),
    );
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [deadlineAt, enabled, recover, turnId]);
}

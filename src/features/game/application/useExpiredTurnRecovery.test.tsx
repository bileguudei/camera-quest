import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SPECTATOR_RECOVERY_GRACE_MS,
  useExpiredTurnRecovery,
} from "./useExpiredTurnRecovery";

describe("spectator turn recovery", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("asks the server to expire a disconnected player's turn after its grace period", async () => {
    const recover = vi.fn().mockResolvedValue(null);
    renderHook(() =>
      useExpiredTurnRecovery({
        enabled: true,
        turnId: "turn-1",
        deadlineAt: "2026-08-24T00:00:30.000Z",
        recover,
      }),
    );

    await act(() =>
      vi.advanceTimersByTimeAsync(30_000 + SPECTATOR_RECOVERY_GRACE_MS - 1),
    );
    expect(recover).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(recover).toHaveBeenCalledOnce();
    expect(recover).toHaveBeenCalledWith("turn-1");
  });

  it("retries from the authoritative remaining time and stops after recovery", async () => {
    const recover = vi.fn()
      .mockResolvedValueOnce(2_000)
      .mockResolvedValueOnce(null);
    renderHook(() =>
      useExpiredTurnRecovery({
        enabled: true,
        turnId: "turn-2",
        deadlineAt: "2026-08-24T00:00:00.000Z",
        recover,
      }),
    );

    await act(() => vi.advanceTimersByTimeAsync(SPECTATOR_RECOVERY_GRACE_MS));
    expect(recover).toHaveBeenCalledTimes(1);

    await act(() => vi.advanceTimersByTimeAsync(2_000));
    expect(recover).toHaveBeenCalledTimes(2);

    await act(() => vi.runOnlyPendingTimersAsync());
    expect(recover).toHaveBeenCalledTimes(2);
  });

  it("does nothing when this phone owns the active seat", async () => {
    const recover = vi.fn();
    renderHook(() =>
      useExpiredTurnRecovery({
        enabled: false,
        turnId: "turn-3",
        deadlineAt: "2026-08-24T00:00:00.000Z",
        recover,
      }),
    );

    await act(() => vi.runOnlyPendingTimersAsync());
    expect(recover).not.toHaveBeenCalled();
  });

  it("backs off instead of spinning when a stale lobby is already past grace", async () => {
    const recover = vi.fn().mockResolvedValue(1_000);
    renderHook(() =>
      useExpiredTurnRecovery({
        enabled: true,
        turnId: "turn-4",
        deadlineAt: "2026-08-23T23:59:50.000Z",
        recover,
      }),
    );

    await act(() => vi.advanceTimersByTimeAsync(999));
    expect(recover).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(recover).toHaveBeenCalledOnce();
  });
});

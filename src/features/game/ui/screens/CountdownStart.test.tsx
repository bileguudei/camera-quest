import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COLD_START_HINT_MS, CountdownStart } from "./CountdownStart";

const mocks = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
  warmVisionService: vi.fn(),
  startPlay: vi.fn(),
  calls: [] as string[],
  cameraMode: "live",
}));

vi.mock("@/features/game/infrastructure/createGameRepository", () => ({
  getGameRepository: () => ({ getAccessToken: mocks.getAccessToken }),
}));

vi.mock("@/features/vision/visionClient", () => ({
  warmVisionService: mocks.warmVisionService,
}));

vi.mock("@/features/game/ui/components/Countdown", () => ({
  Countdown: ({ onDone }: { onDone: () => void }) => (
    <button type="button" onClick={onDone}>
      countdown-done
    </button>
  ),
}));

vi.mock("@/features/game/application/useGame", () => ({
  useGame: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      currentPlayer: () => ({ id: "p1", name: "Bat", color: "lime" }),
      challenge: { prompt: "Улаан юм олоорой" },
      startPlay: mocks.startPlay,
      backendMode: "supabase",
      cameraMode: mocks.cameraMode,
    }),
}));

describe("CountdownStart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.calls.length = 0;
    mocks.cameraMode = "live";
    mocks.getAccessToken.mockResolvedValue("access-token");
    mocks.startPlay.mockImplementation(async () => {
      mocks.calls.push("startPlay");
    });
  });

  afterEach(cleanup);

  it("finishes the warm-up before the server turn clock starts", async () => {
    let releaseWarmup = () => {};
    mocks.warmVisionService.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          mocks.calls.push("warmup");
          releaseWarmup = resolve;
        }),
    );

    render(<CountdownStart />);
    await waitFor(() => expect(mocks.warmVisionService).toHaveBeenCalled());
    fireEvent.click(screen.getByText("countdown-done"));

    // Activating the turn while Modal is still cold would spend the player's
    // 30 seconds on a container boot.
    expect(mocks.startPlay).not.toHaveBeenCalled();
    // The hint is deliberately delayed so a warm start never flashes it.
    expect(
      await screen.findByText(/Cloud GPU/, {}, { timeout: COLD_START_HINT_MS + 1_000 }),
    ).toBeInTheDocument();

    releaseWarmup();
    await waitFor(() => expect(mocks.calls).toEqual(["warmup", "startPlay"]));
  });

  it("still starts the turn when the warm-up fails", async () => {
    mocks.warmVisionService.mockRejectedValue(new Error("503"));

    render(<CountdownStart />);
    await waitFor(() => expect(mocks.warmVisionService).toHaveBeenCalled());
    fireEvent.click(screen.getByText("countdown-done"));

    await waitFor(() => expect(mocks.startPlay).toHaveBeenCalledTimes(1));
  });

  it("skips the Modal warm-up in demo mode", async () => {
    mocks.cameraMode = "demo";

    render(<CountdownStart />);
    fireEvent.click(screen.getByText("countdown-done"));

    await waitFor(() => expect(mocks.startPlay).toHaveBeenCalledTimes(1));
    expect(mocks.warmVisionService).not.toHaveBeenCalled();
  });
});

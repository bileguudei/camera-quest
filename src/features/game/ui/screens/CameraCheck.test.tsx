import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CameraCheck, WARMUP_MAX_RETRIES } from "./CameraCheck";

const mocks = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
  warmVisionService: vi.fn(),
  startGame: vi.fn(),
  retryCamera: vi.fn(),
  stream: {} as MediaStream,
}));

vi.mock("@/shared/env/publicEnv", () => ({
  publicEnv: {
    devControlsEnabled: false,
    visionEnabled: true,
    visionUrl: "https://vision.example.test",
  },
}));

vi.mock("@/features/game/infrastructure/createGameRepository", () => ({
  getGameRepository: () => ({ getAccessToken: mocks.getAccessToken }),
}));

vi.mock("@/features/vision/visionClient", () => ({
  warmVisionService: mocks.warmVisionService,
}));

vi.mock("@/features/camera/CameraProvider", () => ({
  useCameraContext: () => ({
    stream: mocks.stream,
    status: "ready",
    retry: mocks.retryCamera,
  }),
}));

vi.mock("@/features/game/application/useGame", () => ({
  useGame: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      cameraFacing: "user",
      toggleCameraFacing: vi.fn(),
      cameraMode: "live",
      setCameraMode: vi.fn(),
      startGame: mocks.startGame,
      backendMode: "supabase",
      busy: false,
      errorCode: null,
    }),
}));

vi.mock("@/features/game/ui/components/CameraFrame", () => ({
  CameraFrame: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("CameraCheck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAccessToken.mockResolvedValue("access-token");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("recovers from a transient warmup failure when the player retries", async () => {
    mocks.warmVisionService
      .mockRejectedValueOnce(new Error("503"))
      .mockResolvedValueOnce(undefined);

    render(<CameraCheck />);

    expect(
      await screen.findByText("AI түр ачаалалтай байна. Автоматаар дахин оролдож байна."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Дахин" }));

    await waitFor(() => expect(mocks.warmVisionService).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("AI model ачааллаа")).toBeInTheDocument();
    expect(
      screen.queryByText("AI түр ачаалалтай байна. Автоматаар дахин оролдож байна."),
    ).not.toBeInTheDocument();
  });

  it("stops retrying and names the outage once the backend stays unreachable", async () => {
    vi.useFakeTimers();
    // What a deleted Supabase project looks like from the browser: never a
    // status code, always a request that finds no host.
    mocks.warmVisionService.mockRejectedValue(new Error("net::ERR_NAME_NOT_RESOLVED"));

    render(<CameraCheck />);

    // The first attempt plus every automatic retry it is allowed.
    for (let attempt = 0; attempt <= WARMUP_MAX_RETRIES; attempt += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
    }

    expect(mocks.warmVisionService).toHaveBeenCalledTimes(WARMUP_MAX_RETRIES + 1);
    expect(
      screen.getByText(/Тоглоомын сервертэй холбогдож чадсангүй/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("AI түр ачаалалтай байна. Автоматаар дахин оролдож байна."),
    ).not.toBeInTheDocument();

    // The loop is genuinely over; a player is not left waiting on a retry that
    // will never come back.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(mocks.warmVisionService).toHaveBeenCalledTimes(WARMUP_MAX_RETRIES + 1);
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CameraCheck } from "./CameraCheck";

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
});

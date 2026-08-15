import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Calibrating } from "./Calibrating";

const mocks = vi.hoisted(() => ({
  calibrate: vi.fn(),
  getAccessToken: vi.fn(),
  prepareTurn: vi.fn(),
  preparationFailed: vi.fn(),
  retry: vi.fn(),
  stream: {} as MediaStream,
}));

vi.mock("@/features/camera/CameraProvider", () => ({
  useCameraContext: () => ({ stream: mocks.stream, retry: mocks.retry }),
}));

vi.mock("@/features/game/infrastructure/createGameRepository", () => ({
  getGameRepository: () => ({ getAccessToken: mocks.getAccessToken }),
}));

vi.mock("@/features/vision/visionClient", () => ({ calibrate: mocks.calibrate }));

vi.mock("@/features/game/application/useGame", () => ({
  useGame: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      cameraFacing: "user",
      cameraMode: "live",
      backendMode: "supabase",
      // Fresh wrappers reproduce the unstable action identities from a new XState snapshot.
      prepareTurn: (payload: unknown) => mocks.prepareTurn(payload),
      preparationFailed: (code: string) => mocks.preparationFailed(code),
    }),
}));

vi.mock("@/features/game/ui/components/CameraFrame", async () => {
  const React = await import("react");
  return {
    CameraFrame: ({
      videoRef,
      children,
    }: {
      videoRef: React.RefObject<HTMLVideoElement | null>;
      children: React.ReactNode;
    }) => (
      <div>
        <video ref={videoRef} />
        {children}
      </div>
    ),
  };
});

describe("Calibrating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.stream = {} as MediaStream;
    mocks.getAccessToken.mockResolvedValue("access-token");
  });

  it("does not abort calibration when XState action identities change", async () => {
    let finishCalibration: ((value: unknown) => void) | undefined;
    mocks.calibrate.mockImplementation(
      (_video: HTMLVideoElement, _token: string, signal: AbortSignal) =>
        new Promise((resolve, reject) => {
          finishCalibration = resolve;
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    const view = render(<Calibrating />);
    await waitFor(() => expect(mocks.calibrate).toHaveBeenCalledOnce());

    view.rerender(<Calibrating />);
    await act(async () => {
      finishCalibration?.({
        calibrationToken: "signed-calibration-token",
        backgroundClasses: ["chair"],
      });
    });

    await waitFor(() =>
      expect(mocks.prepareTurn).toHaveBeenCalledWith({
        token: "signed-calibration-token",
        backgroundClasses: ["chair"],
      }),
    );
    expect(mocks.preparationFailed).not.toHaveBeenCalled();
  });

  it("restarts the camera once when the first frame is unavailable", async () => {
    const { AppError } = await import("@/shared/errors/appError");
    mocks.calibrate
      .mockRejectedValueOnce(new AppError("INVALID_FRAME", "frame unavailable", true))
      .mockRejectedValueOnce(new AppError("INVALID_FRAME", "frame unavailable again", true));

    const view = render(<Calibrating />);
    await waitFor(() => expect(mocks.retry).toHaveBeenCalledOnce());

    mocks.stream = {} as MediaStream;
    view.rerender(<Calibrating />);
    await waitFor(() => expect(mocks.preparationFailed).toHaveBeenCalledWith("INVALID_FRAME"));
    expect(mocks.retry).toHaveBeenCalledOnce();
  });
});

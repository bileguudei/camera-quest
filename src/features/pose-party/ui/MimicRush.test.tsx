import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MimicObservation } from "../domain/mimicRules";
import { MimicRush } from "./MimicRush";

const mocks = vi.hoisted(() => ({
  onObservation: null as null | ((observation: MimicObservation, timestamp: number) => void),
  camera: {
    stream: {} as MediaStream,
    status: "ready",
    isReady: true,
    retry: vi.fn(),
  },
}));

vi.mock("@/features/camera/useCamera", () => ({
  useCamera: () => mocks.camera,
}));

vi.mock("../application/useMimicTracker", () => ({
  useMimicTracker: ({ onObservation }: { onObservation: typeof mocks.onObservation }) => {
    mocks.onObservation = onObservation;
    return { status: "ready", loadStage: null };
  },
}));

vi.mock("@/features/game/ui/components/CameraFrame", () => ({
  CameraFrame: ({
    children,
    videoRef,
  }: {
    children: React.ReactNode;
    videoRef: React.RefObject<HTMLVideoElement | null>;
  }) => (
    <div data-testid="camera-frame">
      <video ref={videoRef} />
      {children}
    </div>
  ),
}));

const framedSmile: MimicObservation = {
  faceLandmarks: [{ x: 0.3, y: 0.2 }, { x: 0.7, y: 0.72 }],
  blendshapes: {
    mouthSmileLeft: 0.9,
    mouthSmileRight: 0.88,
    eyeBlinkLeft: 0.92,
    eyeBlinkRight: 0.04,
  },
  headPose: { pitch: 0, yaw: 0, roll: 0 },
};

const framedNeutral: MimicObservation = {
  faceLandmarks: framedSmile.faceLandmarks,
  blendshapes: { mouthSmileLeft: 0.06, mouthSmileRight: 0.05 },
  headPose: { pitch: 0, yaw: 0, roll: 0 },
};

describe("Mimic Rush", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.onObservation = null;
    mocks.camera.status = "ready";
    mocks.camera.isReady = true;
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("presents one face-only Expression Fusion game without mode choices or effects", () => {
    const { container } = render(<MimicRush />);

    expect(screen.getByRole("heading", { name: /MIMIC RUSH/ })).toBeInTheDocument();
    expect(screen.getByText(/Нүүр, мөр л хангалттай/)).toBeInTheDocument();
    expect(screen.getByText(/EXPRESSION FUSION · ON-DEVICE/)).toBeInTheDocument();
    expect(screen.getByText(/12 fusion challenge · combo оноо/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Mimic Rush эхлүүлэх/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ARENA MIX|MIMIC CLASSIC|HEAD MOTION/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/BETA|Laser eyes|Moustache|Emoji mask/)).not.toBeInTheDocument();
    expect(container.querySelector("canvas")).not.toBeInTheDocument();
  });

  it("moves from close-up framing to a held expression result", () => {
    render(<MimicRush />);
    fireEvent.click(screen.getByRole("button", { name: /Mimic Rush эхлүүлэх/ }));

    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText(/Selfie хүрээнд/)).toBeInTheDocument();

    for (const timestamp of [100, 250, 400, 550, 700, 850]) {
      act(() => mocks.onObservation?.(framedNeutral, timestamp));
    }
    expect(screen.getByText("3")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(3_100));
    expect(screen.getByRole("heading", { name: "ИНЭЭ + ЗҮҮН ИРМЭЛТ" })).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: /Expression progress/ })).toBeInTheDocument();

    act(() => mocks.onObservation?.(framedNeutral, 3_500));
    expect(screen.getByText(/Илүү чанга инээгээрэй/)).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(4_100));
    expect(screen.getByTestId("time-pressure-pulse")).toBeInTheDocument();

    act(() => mocks.onObservation?.(framedSmile, 7_700));
    act(() => mocks.onObservation?.(framedSmile, 8_200));
    expect(screen.getByText(/АМЖИЛТТАЙ/)).toBeInTheDocument();
    expect(screen.getAllByText(/COMBO x1/).length).toBeGreaterThan(0);
    expect(screen.queryByText("🤩")).not.toBeInTheDocument();
  });

  it("explains denied camera permission instead of waiting forever", () => {
    mocks.camera.status = "denied";
    mocks.camera.isReady = false;
    render(<MimicRush />);

    fireEvent.click(screen.getByRole("button", { name: /Mimic Rush эхлүүлэх/ }));

    expect(screen.getByRole("heading", { name: /Камер эхэлсэнгүй/ })).toBeInTheDocument();
    expect(screen.getByText(/Камерын зөвшөөрөл хэрэгтэй/)).toBeInTheDocument();
  });
});

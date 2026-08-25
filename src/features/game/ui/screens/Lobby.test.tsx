import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Lobby } from "./Lobby";

const mocks = vi.hoisted(() => ({
  setReady: vi.fn().mockResolvedValue(undefined),
  start: vi.fn().mockResolvedValue(undefined),
  quit: vi.fn().mockResolvedValue(undefined),
  warm: vi.fn().mockResolvedValue(undefined),
  state: {} as Record<string, unknown>,
}));

const player = (seat: number, self: boolean, ready: boolean) => ({
  id: `00000000-0000-4000-8000-00000000000${seat}`,
  profileId: `00000000-0000-4000-8000-00000000000${seat}`,
  seat,
  name: `Player ${seat}`,
  color: seat === 1 ? "violet" : "blue",
  avatar: "🦊",
  score: 0,
  totalXp: 0,
  level: 1,
  streak: 0,
  ready,
  left: false,
  connected: true,
  isHost: seat === 1,
  isSelf: self,
});

const lobby = (isHost: boolean, selfReady: boolean) => ({
  gameId: "10000000-0000-4000-8000-000000000001",
  mode: "online",
  environment: "home",
  status: "active",
  joinCode: "KX7M2P",
  lobbyOpen: true,
  currentRound: 1,
  currentSeat: 1,
  isHost,
  selfSeat: isHost ? 1 : 2,
  players: isHost
    ? [player(1, true, selfReady), player(2, false, true)]
    : [player(1, false, true), player(2, true, selfReady)],
  lastTurn: null,
  rematchReadyCount: 0,
  rematchPlayerCount: 2,
  selfRematchReady: false,
});

vi.mock("@/features/game/application/useGame", () => ({
  useGame: (selector: (state: Record<string, unknown>) => unknown) => selector(mocks.state),
}));

vi.mock("@/features/camera/CameraProvider", () => ({
  useCameraContext: () => ({ stream: {} as MediaStream, status: "ready", retry: vi.fn() }),
}));

vi.mock("@/features/camera/cameraPreflight", () => ({
  useCameraPreflight: () => ({
    online: true,
    lighting: "good",
    cameraReady: true,
    deviceReady: true,
  }),
}));

vi.mock("@/features/game/infrastructure/createGameRepository", () => ({
  getGameRepository: () => ({ getAccessToken: vi.fn().mockResolvedValue("token") }),
}));

vi.mock("@/features/vision/visionClient", () => ({
  warmVisionService: (...args: unknown[]) => mocks.warm(...args),
}));

vi.mock("@/features/game/ui/components/CameraFrame", () => ({
  CameraFrame: () => <div />,
}));

describe("online lobby start ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state = {
      lobby: lobby(false, false),
      setLobbyReady: mocks.setReady,
      startOnlineGame: mocks.start,
      quitGame: mocks.quit,
      busy: false,
      errorCode: null,
      cameraFacing: "environment",
    };
  });

  it("automatically marks a guest ready after device preflight without a Start button", async () => {
    render(<Lobby />);

    await waitFor(() => expect(mocks.setReady).toHaveBeenCalledWith(true));
    expect(screen.queryByRole("button", { name: "Тоглоом эхлүүлэх" })).not.toBeInTheDocument();
  });

  it("shows one authoritative Start action only to the ready host", async () => {
    mocks.state = { ...mocks.state, lobby: lobby(true, true) };
    render(<Lobby />);

    const starts = await screen.findAllByRole("button", { name: "Тоглоом эхлүүлэх" });
    fireEvent.click(starts[0]!);
    expect(mocks.start).toHaveBeenCalledOnce();
    expect(mocks.setReady).not.toHaveBeenCalled();
  });
});

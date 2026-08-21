import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Landing } from "./Landing";

const mocks = vi.hoisted(() => ({
  openSetup: vi.fn(),
  openOnline: vi.fn(),
}));

vi.mock("@/features/game/application/useGame", () => ({
  useGame: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ openSetup: mocks.openSetup, openOnline: mocks.openOnline }),
}));

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span data-testid="image" aria-label={alt} />,
}));

describe("Landing", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  /**
   * Both doors have to stay on the landing screen. A visual redesign once
   * dropped the online button, which left the entire multiplayer flow with no
   * way in while every other test stayed green.
   */
  it("keeps a way into both the local game and an online table", () => {
    render(<Landing />);

    fireEvent.click(screen.getByRole("button", { name: /Тоглоом эхлүүлэх/ }));
    fireEvent.click(screen.getByRole("button", { name: /Найзтайгаа онлайн/ }));

    expect(mocks.openSetup).toHaveBeenCalledTimes(1);
    expect(mocks.openOnline).toHaveBeenCalledTimes(1);
  });
});

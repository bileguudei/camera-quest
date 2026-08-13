import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GameShell } from "./GameShell";

describe("GameShell", () => {
  it("moves from landing to the accessible player setup", async () => {
    render(<GameShell />);
    fireEvent.click(screen.getByRole("button", { name: "Тоглоом эхлүүлэх" }));
    expect(await screen.findByRole("heading", { name: "Хэдүүлээ тоглох вэ?" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Тоглогчийн тоо" })).toBeInTheDocument();
  });
});

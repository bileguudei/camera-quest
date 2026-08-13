import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BoundingBox } from "./BoundingBox";

const detection = {
  id: "detection-1",
  className: "bottle",
  label: "bottle",
  score: 0.9,
  box: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
  isTarget: true,
};

describe("BoundingBox", () => {
  it("mirrors ROI-local x coordinates without mirroring its label", () => {
    const { container, getByText } = render(
      <BoundingBox detection={detection} mirrored />,
    );
    expect(Number.parseFloat((container.firstElementChild as HTMLElement).style.left)).toBeCloseTo(60);
    expect(getByText("bottle")).toHaveTextContent("bottle");
  });
});

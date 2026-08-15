import { describe, expect, it } from "vitest";
import { activeTurnSchema } from "./gameApiSchemas";

const turnId = "10000000-0000-4000-8000-000000000001";

describe("activeTurnSchema", () => {
  it("accepts the UTC offset format returned by Postgres jsonb", () => {
    expect(
      activeTurnSchema.parse({
        turnId,
        startedAt: "2026-08-14T02:18:39.010+00:00",
        deadlineAt: "2026-08-14T02:19:09.010+00:00",
        serverNow: "2026-08-14T02:18:39.010+00:00",
      }),
    ).toMatchObject({ turnId });
  });

  it("still requires an explicit timezone", () => {
    expect(() =>
      activeTurnSchema.parse({
        turnId,
        startedAt: "2026-08-14T02:18:39.010",
        deadlineAt: "2026-08-14T02:19:09.010",
        serverNow: "2026-08-14T02:18:39.010",
      }),
    ).toThrow();
  });
});

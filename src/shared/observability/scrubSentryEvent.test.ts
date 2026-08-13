import { describe, expect, it } from "vitest";
import { scrubSentryEvent } from "./scrubSentryEvent";

describe("scrubSentryEvent", () => {
  it("removes bodies and filters camera-like diagnostic fields", () => {
    const event = scrubSentryEvent({
      type: undefined,
      request: {
        data: "raw multipart body",
        cookies: { session: "secret" },
        headers: { authorization: "Bearer secret", accept: "application/json" },
      },
      extra: { frameBatch: "pixels", sequenceNo: 2 },
      breadcrumbs: [{ data: { imageBlob: "pixels", turnId: "turn-1" } }],
    });

    expect(event.request?.data).toBeUndefined();
    expect(event.request?.cookies).toBeUndefined();
    expect(event.request?.headers?.authorization).toBe("[Filtered]");
    expect(event.request?.headers?.accept).toBe("application/json");
    expect(event.extra?.frameBatch).toBe("[Filtered]");
    expect(event.extra?.sequenceNo).toBe(2);
    expect(event.breadcrumbs?.[0].data?.imageBlob).toBe("[Filtered]");
  });
});

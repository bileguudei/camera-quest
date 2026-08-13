import type { ErrorEvent } from "@sentry/nextjs";

const sensitiveKey = /(authorization|cookie|frame|image|blob|camera|multipart)/i;

/**
 * Camera Quest never needs request bodies or image-like values in diagnostics.
 * Keep stack traces and timings while enforcing that privacy boundary centrally.
 */
export function scrubSentryEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    if (event.request.headers) {
      event.request.headers = Object.fromEntries(
        Object.entries(event.request.headers).map(([key, value]) => [
          key,
          sensitiveKey.test(key) ? "[Filtered]" : value,
        ]),
      );
    }
  }

  if (event.extra) {
    event.extra = Object.fromEntries(
      Object.entries(event.extra).map(([key, value]) => [
        key,
        sensitiveKey.test(key) ? "[Filtered]" : value,
      ]),
    );
  }

  event.breadcrumbs = event.breadcrumbs?.map((breadcrumb) => ({
    ...breadcrumb,
    data: breadcrumb.data
      ? Object.fromEntries(
          Object.entries(breadcrumb.data).map(([key, value]) => [
            key,
            sensitiveKey.test(key) ? "[Filtered]" : value,
          ]),
        )
      : undefined,
  }));

  return event;
}

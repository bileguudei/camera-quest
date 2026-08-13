import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "@/shared/observability/scrubSentryEvent";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  sendDefaultPii: false,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,
  beforeSend: scrubSentryEvent,
});

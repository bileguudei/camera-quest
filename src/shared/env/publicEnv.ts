import { z } from "zod";

const optionalUrl = z.preprocess((value) => value || undefined, z.url().optional());
const booleanFlag = z
  .enum(["true", "false"])
  .optional()
  .transform((value) => value === "true");

const publicEnvSchema = z.object({
  supabaseUrl: optionalUrl,
  supabasePublishableKey: z.string().min(20).optional(),
  visionUrl: optionalUrl,
  visionEnabled: booleanFlag,
  devControlsEnabled: booleanFlag,
  sentryDsn: optionalUrl,
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

/**
 * Each key is referenced literally so Next can replace NEXT_PUBLIC values at
 * build time. Never put service-role or Gemini secrets in this module.
 */
export const publicEnv = publicEnvSchema.parse({
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  visionUrl: process.env.NEXT_PUBLIC_VISION_URL,
  visionEnabled: process.env.NEXT_PUBLIC_VISION_ENABLED,
  devControlsEnabled: process.env.NEXT_PUBLIC_DEV_CONTROLS_ENABLED,
  sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
});

export const hasProductionBackend = Boolean(
  publicEnv.supabaseUrl && publicEnv.supabasePublishableKey,
);

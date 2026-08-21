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
 * A value copied straight out of `.env.example` is not configuration. Treating
 * the placeholders as unset keeps a fresh clone in local mode instead of
 * pointing the game at https://YOUR_PROJECT.supabase.co and failing later, at
 * the first command, with nothing on screen to explain why.
 */
const configured = (value: string | undefined) =>
  value && value.trim() !== "" && !value.includes("YOUR_") ? value : undefined;

const ENV_KEYS: Record<string, string> = {
  supabaseUrl: "NEXT_PUBLIC_SUPABASE_URL",
  supabasePublishableKey: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  visionUrl: "NEXT_PUBLIC_VISION_URL",
  visionEnabled: "NEXT_PUBLIC_VISION_ENABLED",
  devControlsEnabled: "NEXT_PUBLIC_DEV_CONTROLS_ENABLED",
  sentryDsn: "NEXT_PUBLIC_SENTRY_DSN",
};

/** A bad value should name itself, not arrive as a raw ZodError behind a 500. */
function parsePublicEnv(input: Record<string, unknown>): PublicEnv {
  const parsed = publicEnvSchema.safeParse(input);
  if (parsed.success) return parsed.data;

  const problems = parsed.error.issues
    .map((issue) => `  ${ENV_KEYS[String(issue.path[0])] ?? String(issue.path[0])}: ${issue.message}`)
    .join("\n");
  throw new Error(
    `.env.local has values this app cannot use:\n${problems}\n\n` +
      "Leave a key blank to run without it — the game then uses the local\n" +
      "catalogue and needs no cloud account. See .env.example for the shape.",
  );
}

/**
 * Each key is referenced literally so Next can replace NEXT_PUBLIC values at
 * build time. Never put service-role or Gemini secrets in this module.
 */
export const publicEnv = parsePublicEnv({
  supabaseUrl: configured(process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabasePublishableKey: configured(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
  visionUrl: configured(process.env.NEXT_PUBLIC_VISION_URL),
  visionEnabled: process.env.NEXT_PUBLIC_VISION_ENABLED,
  devControlsEnabled: process.env.NEXT_PUBLIC_DEV_CONTROLS_ENABLED,
  sentryDsn: configured(process.env.NEXT_PUBLIC_SENTRY_DSN),
});

export const hasProductionBackend = Boolean(
  publicEnv.supabaseUrl && publicEnv.supabasePublishableKey,
);

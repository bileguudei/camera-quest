import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * First run after a clone. `.env.local` holds secrets, so it is never committed
 * and a new teammate has none — this writes the local-mode one for them so
 * `npm run dev` works before anybody has shared cloud values.
 */
const target = resolve(import.meta.dirname, "..", ".env.local");

if (existsSync(target)) process.exit(0);

writeFileSync(
  target,
  `# Written automatically on the first \`npm run dev\`.
#
# As it stands the game runs entirely on this machine: quests come from the
# local catalogue, nothing is sent to Supabase or Modal, and no account is
# needed. That is enough to work on any screen.
#
# To play against the shared cloud instead — online tables, real AI recognition
# — ask the project owner for these four values and fill them in. Only
# NEXT_PUBLIC_ values belong here; a service role key never does.
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_VISION_URL=
NEXT_PUBLIC_VISION_ENABLED=false

# Force-pass buttons and the dev panel. Local development only.
NEXT_PUBLIC_DEV_CONTROLS_ENABLED=true
NEXT_PUBLIC_SENTRY_DSN=
`,
  "utf8",
);

console.log(
  "\nCreated .env.local for local development — no cloud account needed.\n" +
    "Ask the project owner for the Supabase and Modal values when you need the\n" +
    "online table or real recognition.\n",
);

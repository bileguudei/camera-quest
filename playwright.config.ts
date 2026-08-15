import { defineConfig, devices } from "@playwright/test";

const e2ePort = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: e2eBaseUrl,
    trace: "retain-on-failure",
    video: "off",
    permissions: ["camera"],
    launchOptions: {
      args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
    },
  },
  projects: [
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
    { name: "desktop-chrome", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    // A dedicated port prevents a developer's production-like localhost:3000
    // session from bypassing the deterministic E2E environment below.
    command: `npm run dev -- --port ${e2ePort}`,
    url: e2eBaseUrl,
    reuseExistingServer: false,
    env: {
      NEXT_DIST_DIR: ".next-e2e",
      // E2E must stay deterministic even when a developer has production-like
      // Supabase or Modal values in .env.local.
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "e2e-local-repository-disabled",
      NEXT_PUBLIC_VISION_URL: "",
      NEXT_PUBLIC_VISION_ENABLED: "false",
      NEXT_PUBLIC_DEV_CONTROLS_ENABLED: "true",
      NEXT_PUBLIC_SENTRY_DSN: "",
    },
  },
});

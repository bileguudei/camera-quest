import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
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
    command: "npm run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    env: {
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

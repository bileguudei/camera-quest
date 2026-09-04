import { defineConfig, devices } from "@playwright/test";

/**
 * Checks a deployment that is already running. No webServer and no env
 * overrides: the point is to exercise whatever Supabase and Modal the deployed
 * bundle was built against, which is exactly what the local suite cannot see.
 */
const target = process.env.SMOKE_URL ?? "https://camera-quest.vercel.app";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/deployed-smoke.spec.ts",
  fullyParallel: false,
  // A deployment check that flakes is a deployment check nobody trusts, but a
  // cold Modal container is a real, expected delay rather than a failure.
  retries: 1,
  reporter: "list",
  use: {
    baseURL: target,
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
});

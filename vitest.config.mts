import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "camera-quest-dev-panel": fileURLToPath(
        new URL("./src/features/game/ui/components/DevPanel.tsx", import.meta.url),
      ),
      "camera-quest-environment-repository": fileURLToPath(
        new URL(
          "./src/features/game/infrastructure/developmentEnvironmentRepository.ts",
          import.meta.url,
        ),
      ),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      reporter: ["text", "json-summary"],
    },
  },
});

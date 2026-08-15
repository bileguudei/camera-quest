import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import path from "node:path";

function environmentAliases(production: boolean, absolute = false) {
  const entries = {
    "camera-quest-dev-panel": production
      ? "./src/features/game/ui/components/NoopDevPanel.tsx"
      : "./src/features/game/ui/components/DevPanel.tsx",
    "camera-quest-environment-repository": production
      ? "./src/features/game/infrastructure/productionEnvironmentRepository.ts"
      : "./src/features/game/infrastructure/developmentEnvironmentRepository.ts",
  };

  return absolute
    ? Object.fromEntries(
        Object.entries(entries).map(([name, target]) => [
          name,
          path.resolve(target),
        ]),
      )
    : entries;
}

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  typescript: {
    tsconfigPath: process.env.NEXT_DIST_DIR === ".next-e2e" ? "tsconfig.e2e.json" : "tsconfig.json",
  },
  allowedDevOrigins: ["127.0.0.1"],
  turbopack: {
    root: process.cwd(),
    resolveAlias: environmentAliases(process.env.NODE_ENV === "production"),
  },
  webpack(config, { dev }) {
    // Keep the fail-closed production boundary identical across both Next bundlers.
    Object.assign(config.resolve.alias, environmentAliases(!dev, true));
    return config;
  },
};

export default process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(nextConfig, {
      silent: true,
      disableLogger: true,
    })
  : nextConfig;

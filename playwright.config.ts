import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 180_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:4173",
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    trace: "retain-on-failure",
  },
  webServer: process.env.PLAYWRIGHT_USE_EXTERNAL_SERVERS
    ? undefined
    : [
        {
          command: "MIN_PLAYERS=1 BOT_ACTION_MIN_MS=30 BOT_ACTION_MAX_MS=60 npm --prefix server run start",
          url: "http://127.0.0.1:2567/health",
          reuseExistingServer: true,
          timeout: 60_000,
        },
        {
          command: "npm --prefix client run preview",
          url: "http://127.0.0.1:4173",
          reuseExistingServer: true,
          timeout: 60_000,
        },
      ],
});

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  // Stateful game-flow specs share one local Colyseus process. Running them in
  // parallel makes their operation timers contend and produces false timeouts.
  workers: 1,
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
          command:
            "node dist/index.js",
          cwd: "./server",
          env: {
            ...process.env,
            NODE_ENV: "test",
            MIN_PLAYERS: "1",
            ROOM_CREATE_RATE_LIMIT: "1000",
            WAITING_ROOM_IDLE_MS: "1000",
            ACTIVE_ROOM_IDLE_MS: "3000",
            RECONNECT_GRACE_MS: "300",
            BOT_THINK_MIN_MS: "30",
            BOT_THINK_MAX_MS: "60",
            LOCAL_TRANSITION_DELAY_MS: "20",
            DEALER_PICK_INTRO_MS: "20",
            DEALER_REVEAL_INTRO_MS: "20",
            OPENING_DEAL_DELAY_MS: "80",
            ENABLE_DEBUG_SCENARIOS: "1",
          },
          url: "http://127.0.0.1:2567/health",
          reuseExistingServer: false,
          timeout: 60_000,
        },
        {
          command: "node_modules/.bin/vite preview --host 0.0.0.0 --port 4173",
          cwd: "./client",
          url: "http://127.0.0.1:4173",
          reuseExistingServer: false,
          timeout: 60_000,
        },
      ],
});

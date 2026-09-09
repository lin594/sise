import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./output/playwright/test-results",
  // 有状态牌局共用一个本地 Colyseus 进程；并行会让操作计时互相争抢并制造假超时。
  workers: 1,
  timeout: 180_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:4173",
    headless: true,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
      },
    },
    {
      name: "webkit-responsive",
      testMatch: /(?:responsive-release|quick-phrase|appearance|mobile-table-appearance|declared-kans|product-analytics|tutorial|context-hints)\.spec\.ts/,
      use: {
        browserName: "webkit",
      },
    },
  ],
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
            PUBLIC_WEB_ORIGIN: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:4173",
            MIN_PLAYERS: "1",
            ROOM_CREATE_RATE_LIMIT: "1000",
            GUEST_PROFILE_RATE_LIMIT: "1000",
            // CI 忙碌时浏览器上下文和邀请页可能数秒后才启动，因此沿用生产环境的宽限期。
            WAITING_ROOM_IDLE_MS: "60000",
            ACTIVE_ROOM_IDLE_MS: "3000",
            // Match the production grace period: offline UI assertions/screenshots must not race takeover.
            RECONNECT_GRACE_MS: process.env.RECONNECT_GRACE_MS || "5000",
            BOT_THINK_MIN_MS: "30",
            BOT_THINK_MAX_MS: "60",
            BOT_COLLECTIVE_THINK_MIN_MS: "10",
            BOT_COLLECTIVE_THINK_MAX_MS: "20",
            // 浏览器回归必须覆盖真实三秒窗；该变量只在 NODE_ENV=test 时读取。
            TEST_COLLECTIVE_RESPONSE_WINDOW_MS: "3000",
            LOCAL_TRANSITION_DELAY_MS: "20",
            DEALER_PICK_INTRO_MS: "20",
            DEALER_REVEAL_INTRO_MS: "20",
            // 仍显著快于生产，但要留出多帧才能验证“逐张揭示且缩放不抖”。
            OPENING_DEAL_DELAY_MS: "600",
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

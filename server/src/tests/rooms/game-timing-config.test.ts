import test from "node:test";
import assert from "node:assert/strict";
import { resolveGameTimingConfig } from "../../rooms/game-timing-config.js";

test("production ignores legacy slow timing overrides that make bot tables look frozen", () => {
  const warnings: string[] = [];
  const config = resolveGameTimingConfig(
    {
      NODE_ENV: "production",
      BOT_THINK_MIN_MS: "1800",
      BOT_THINK_MAX_MS: "3200",
      BOT_COLLECTIVE_THINK_MIN_MS: "80",
      BOT_COLLECTIVE_THINK_MAX_MS: "180",
      LOCAL_TRANSITION_DELAY_MS: "5000",
    },
    (message) => warnings.push(message),
  );

  assert.deepEqual(config, {
    botThinkMinMs: 450,
    botThinkMaxMs: 850,
    botCollectiveThinkMinMs: 80,
    botCollectiveThinkMaxMs: 180,
    localTransitionDelayMs: 250,
  });
  assert.equal(warnings.length, 3);
  assert.equal(warnings.every((message) => message.includes("unresponsive table")), true);
});

test("development and tests may still opt into deliberate long timing scenarios", () => {
  const config = resolveGameTimingConfig(
    {
      NODE_ENV: "test",
      BOT_THINK_MIN_MS: "1800",
      BOT_THINK_MAX_MS: "3200",
      BOT_COLLECTIVE_THINK_MIN_MS: "600",
      BOT_COLLECTIVE_THINK_MAX_MS: "900",
      LOCAL_TRANSITION_DELAY_MS: "5000",
    },
    () => {},
  );

  assert.deepEqual(config, {
    botThinkMinMs: 1800,
    botThinkMaxMs: 3200,
    botCollectiveThinkMinMs: 600,
    botCollectiveThinkMaxMs: 900,
    localTransitionDelayMs: 5000,
  });
});

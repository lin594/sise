import { defineConfig } from "@playwright/test";
// The existing test/expect implementation, with no browser fixtures or servers.
export default defineConfig({
  forbidOnly: true,
  testDir: "./tests/logic", workers: 1, retries: 0,
  timeout: 180_000, globalTimeout: 120_000, expect: { timeout: 10_000 },
  projects: [{ name: "logic" }],
  outputDir: "./output/ci-migration/logic/test-results",
  reporter: [["line"], ["json", { outputFile: "output/ci-migration/logic/results.json" }]],
});

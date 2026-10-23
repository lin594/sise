import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
// Keep old execution identities. Request fixtures do not launch a browser.
export default defineConfig({
  forbidOnly: true,
  ...base, testDir: "./tests/integration", retries: 0, globalTimeout: 300_000,
  webServer: Array.isArray(base.webServer) ? base.webServer.slice(0, 1) : base.webServer,
  outputDir: "./output/ci-migration/http/test-results",
  reporter: [["line"], ["json", { outputFile: "output/ci-migration/http/results.json" }]],
});

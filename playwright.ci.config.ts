import { readdirSync } from "node:fs";
import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
// Real-time experience stays on real clocks. Other DOM/layout contracts also
// stay in real browsers; no model or fake-clock test replaces their assertions.
const experience = new Set([
  "offline-action-presentation.spec.ts", "central-draw.spec.ts",
  "passive-collective.spec.ts", "flow-stability.spec.ts", "reduced-motion.spec.ts", "responsive-release.spec.ts",
]);
const layer = process.env.CI_BROWSER_LAYER || "contracts";
if (!["contracts", "experience"].includes(layer)) throw new Error(`Unknown browser layer: ${layer}`);
const files = (readdirSync(`${__dirname}/tests/e2e/`, { recursive: true }) as string[])
  .filter((file) => file.endsWith(".spec.ts"))
  .filter((file) => experience.has(file) === (layer === "experience"));
export default defineConfig({
  forbidOnly: true,
  ...base, retries: 0, globalTimeout: 1_800_000,
  projects: base.projects!.map((project) => ({
    ...project,
    testMatch: files.filter((file) => !project.testMatch || (project.testMatch as RegExp).test(file))
      .map((file) => `**/${file}`),
  })),
  outputDir: `./output/ci-migration/browser-${layer}/test-results`,
  reporter: [["line"], ["json", { outputFile: `output/ci-migration/browser-${layer}/results.json` }]],
});

import { harnessOverrides } from "./harness-overrides.mjs";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import toolchain from "../../ci/toolchain.json" with { type: "json" };
if (process.env.GITHUB_ACTIONS !== "true") throw new Error("Legacy restoration requires a disposable Actions checkout");
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const overrides = harnessOverrides(process.cwd());
const applicationSha = git("rev-parse", "HEAD");
const files = git("ls-tree", "-r", "--name-only", toolchain.baseline, "tests/e2e", "playwright.config.ts").split("\n");
for (const file of files) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, execFileSync("git", ["show", `${toolchain.baseline}:${file}`]));
}
for (const entry of overrides) writeFileSync(entry.path, entry.content);
mkdirSync("output/ci-migration/legacy", { recursive: true });
writeFileSync("output/ci-migration/legacy/harness.json", JSON.stringify({
  applicationSha, harnessSha: toolchain.baseline, files,
  overrides: overrides.map(({content, ...metadata}) => metadata),
  note: "Only frozen tests/config are restored; application source/build is the current checkout.",
}, null, 2) + "\n");

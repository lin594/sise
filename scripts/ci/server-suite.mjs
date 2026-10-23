#!/usr/bin/env node
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const usage = "Usage: node scripts/ci/server-suite.mjs [core|protocol|services|all] [--list]";

async function discoverTestSources(directory) {
  const entries = await readdir(path.join(repositoryRoot, directory), { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await discoverTestSources(relative));
    else if (entry.isFile() && entry.name.endsWith(".test.ts")) files.push(relative);
  }
  return files;
}

async function main() {
  let listOnly = false;
  let selected = null;
  for (const argument of process.argv.slice(2)) {
    if (argument === "--help" || argument === "-h") {
      console.log(usage);
      return;
    }
    if (argument === "--list") listOnly = true;
    else if (!selected && !argument.startsWith("-")) selected = argument;
    else throw new Error(`${usage}\nUnexpected argument: ${argument}`);
  }

  const manifest = JSON.parse(await readFile(path.join(repositoryRoot, "ci/server-suites.json"), "utf8"));
  if (manifest.version !== 1 || !manifest.suites || typeof manifest.suites !== "object" || Array.isArray(manifest.suites)) {
    throw new Error("Invalid server-suites.json schema");
  }
  const suiteNames = Object.keys(manifest.suites);
  if (!suiteNames.length || suiteNames.some(name => !/^[a-z][a-z0-9-]*$/.test(name) || name === "all")) {
    throw new Error("Invalid server suite names");
  }
  selected ??= "all";
  if (selected !== "all" && !suiteNames.includes(selected)) throw new Error(`${usage}\nUnknown suite: ${selected}`);

  // Check the complete partition even when only one suite is requested. A new
  // source test must acquire an explicit owner before any CI subset can pass.
  await access(path.join(repositoryRoot, "server/src/tests/run.ts"));
  const expected = new Set(["server/src/tests/run.ts", ...await discoverTestSources("server/src/tests")]);
  const assigned = new Map();
  for (const [name, suite] of Object.entries(manifest.suites)) {
    if (!suite || !Array.isArray(suite.files) || !suite.files.length) throw new Error(`Suite ${name} has no explicit files`);
    for (const source of suite.files) {
      if (typeof source !== "string" || !expected.has(source)) throw new Error(`Suite ${name} has an unknown test: ${source}`);
      if (assigned.has(source)) throw new Error(`Test belongs to both ${assigned.get(source)} and ${name}: ${source}`);
      assigned.set(source, name);
    }
  }
  const missing = [...expected].filter(source => !assigned.has(source));
  if (missing.length) throw new Error(`Server tests missing from suites:\n${missing.join("\n")}`);

  const selectedNames = selected === "all" ? suiteNames : [selected];
  const plans = selectedNames.map(name => ({
    name,
    description: manifest.suites[name].description,
    files: manifest.suites[name].files.map(source => ({
      source,
      built: source.replace(/^server\/src\//, "server/dist/").replace(/\.ts$/, ".js"),
    })),
  }));
  for (const plan of plans) {
    console.log(`[${plan.name}] ${plan.description ?? ""}`);
    for (const file of plan.files) console.log(`  ${file.source} -> ${file.built}`);
  }
  console.log(`Validated ${assigned.size} source entrypoints; selected ${plans.reduce((count, plan) => count + plan.files.length, 0)} compiled entrypoints.`);
  if (listOnly) return;

  if (selectedNames.includes("services") && !process.env.ANALYTICS_TEST_REDIS_URL) {
    throw new Error("The services suite requires ANALYTICS_TEST_REDIS_URL; real Redis coverage must not silently skip.");
  }
  for (const plan of plans) {
    for (const file of plan.files) {
      try {
        await access(path.join(repositoryRoot, file.built));
      } catch {
        throw new Error(`Missing compiled test ${file.built}; build the server before running suites.`);
      }
    }
  }

  const run = arguments_ => {
    const result = spawnSync(process.execPath, arguments_, {
      cwd: path.join(repositoryRoot, "server"),
      env: process.env,
      stdio: "inherit",
    });
    if (result.error) throw result.error;
    if (result.signal) throw new Error(`Server test process terminated by ${result.signal}`);
    if (result.status !== 0) process.exit(result.status ?? 1);
  };
  for (const plan of plans) {
    console.log(`Running server suite: ${plan.name}`);
    const standalone = plan.files.filter(file => file.source === "server/src/tests/run.ts");
    for (const file of standalone) run([path.relative("server", file.built)]);
    const nodeTests = plan.files.filter(file => file.source !== "server/src/tests/run.ts");
    if (nodeTests.length) run(["--test", ...nodeTests.map(file => path.relative("server", file.built))]);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

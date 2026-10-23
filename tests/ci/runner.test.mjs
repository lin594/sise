import test from "node:test";
import assert from "node:assert/strict";
import { copyFile, lstat, mkdir, mkdtemp, readFile, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const payload = ["node_modules", "server/node_modules", "client/node_modules", "server/dist", "client/dist"];
// Never inherit the outer workflow's event file, merge SHA or run identity.
const environment = {
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GITHUB_"))),
  CI: "false", GITHUB_ACTIONS: "false", GITHUB_RUN_ID: "123", GITHUB_RUN_ATTEMPT: "2",
};

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "sise-ci-runner-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "scripts/ci"), { recursive: true });
  await mkdir(path.join(root, "ci"));
  for (const file of ["artifact.mjs", "record.mjs"]) {
    await copyFile(path.join(repository, "scripts/ci", file), path.join(root, "scripts/ci", file));
  }
  await copyFile(path.join(repository, "ci/toolchain.json"), path.join(root, "ci/toolchain.json"));
  const lock = JSON.stringify({ lockfileVersion: 3, packages: {
    "node_modules/@playwright/test": { version: "1.62.1" },
    "node_modules/playwright": { version: "1.62.1" },
  } });
  for (const name of ["package-lock.json", "server/package-lock.json", "client/package-lock.json"]) {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await writeFile(path.join(root, name), lock);
  }
  await writeFile(path.join(root, ".gitignore"), "node_modules/\ndist/\noutput/\nci-bundle.*\n.ci-bundle-*\n");
  const run = (command, args, env = environment) => spawnSync(command, args, {
    cwd: root, env, encoding: "utf8", timeout: 20_000,
  });
  const git = args => {
    const result = run("git", args);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git(["init", "-q"]);
  git(["add", "."]);
  git(["-c", "user.name=CI fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture"]);
  for (const name of payload) {
    await mkdir(path.join(root, name), { recursive: true });
    await writeFile(path.join(root, name, "fixture.txt"), `${name}\n`);
  }
  await mkdir(path.join(root, "node_modules/.bin"));
  await mkdir(path.join(root, "node_modules/fixture"));
  await writeFile(path.join(root, "node_modules/fixture/bin.mjs"), "#!/usr/bin/env node\n", { mode: 0o755 });
  await symlink("../fixture/bin.mjs", path.join(root, "node_modules/.bin/fixture"));
  const artifact = (command, env = environment) => run(process.execPath, ["scripts/ci/artifact.mjs", command], env);
  const ok = result => { assert.equal(result.status, 0, result.stderr); return result; };
  const rejects = (result, reason) => {
    assert.notEqual(result.status, 0, "the rejected operation must fail");
    assert.match(result.stderr, reason);
  };
  return { root, run, git, artifact, ok, rejects };
}

async function json(root, name) {
  return JSON.parse(await readFile(path.join(root, name), "utf8"));
}

test("tiny artifact preserves executable bin links and dist identity without env/cache payloads", async t => {
  const f = await fixture(t);
  await writeFile(path.join(f.root, "node_modules/.env"), "SECRET=never archive this\n");
  await mkdir(path.join(f.root, "node_modules/.cache"));
  await writeFile(path.join(f.root, "node_modules/.cache/value"), "never archive this\n");
  f.ok(f.artifact("pack"));
  const manifest = await json(f.root, "ci-bundle.json");
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.distTrees["server/dist"].fileCount, 1);
  assert.equal(manifest.distTrees["client/dist"].fileCount, 1);
  const listing = f.ok(f.run("tar", ["-tzf", "ci-bundle.tar.gz"])).stdout;
  assert.doesNotMatch(listing, /\/\.env|\/\.cache/);
  f.ok(f.artifact("verify"));
  f.rejects(f.artifact("pack"), /Refusing to replace existing artifact/);
  f.rejects(f.artifact("restore"), /Refusing to replace existing payload/);
  for (const name of payload) await rm(path.join(f.root, name), { recursive: true });
  f.ok(f.artifact("restore"));
  assert.equal((await lstat(path.join(f.root, "node_modules/.bin/fixture"))).isSymbolicLink(), true);
  assert.equal(await readlink(path.join(f.root, "node_modules/.bin/fixture")), "../fixture/bin.mjs");
  assert.equal((await lstat(path.join(f.root, "node_modules/fixture/bin.mjs"))).mode & 0o111, 0o111);
  assert.equal(await readFile(path.join(f.root, "server/dist/fixture.txt"), "utf8"), "server/dist\n");
  assert.equal(await readFile(path.join(f.root, "client/dist/fixture.txt"), "utf8"), "client/dist\n");
  // identity needs built output, but neither installed packages nor an archive.
  for (const name of payload.slice(0, 3)) await rm(path.join(f.root, name), { recursive: true });
  await rm(path.join(f.root, "ci-bundle.tar.gz"));
  const identity = JSON.parse(f.ok(f.artifact("identity")).stdout);
  assert.deepEqual(identity.distTrees, manifest.distTrees);
  assert.equal(identity.source.sha, manifest.source.sha);
});

test("artifact rejects a different source, lock, run attempt and archive bytes", async t => {
  const f = await fixture(t);
  f.ok(f.artifact("pack"));
  const originalHead = f.git(["rev-parse", "HEAD"]);
  f.git(["-c", "user.name=CI fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-qm", "new head"]);
  f.rejects(f.artifact("verify"), /source identity mismatch/);
  f.git(["reset", "--hard", originalHead]);
  const lockPath = path.join(f.root, "client/package-lock.json");
  const lock = await readFile(lockPath);
  await writeFile(lockPath, Buffer.concat([lock, Buffer.from("\n")]));
  f.rejects(f.artifact("verify"), /identity mismatch/);
  await writeFile(lockPath, lock);
  f.rejects(f.artifact("verify", { ...environment, GITHUB_RUN_ATTEMPT: "3" }), /workflow identity mismatch/);
  f.rejects(f.artifact("verify", { ...environment, GITHUB_RUN_ID: "456" }), /workflow identity mismatch/);
  const archivePath = path.join(f.root, "ci-bundle.tar.gz");
  await writeFile(archivePath, Buffer.concat([await readFile(archivePath), Buffer.from("tampered")]));
  f.rejects(f.artifact("restore"), /archive SHA256 mismatch/);
  assert.equal(await readFile(path.join(f.root, "server/dist/fixture.txt"), "utf8"), "server/dist\n");
});

test("producer rejects a bin link that escapes the five payload roots", async t => {
  const f = await fixture(t);
  await symlink("../../outside", path.join(f.root, "node_modules/.bin/escape"));
  f.rejects(f.artifact("pack"), /outside the allowed payload/);
  await assert.rejects(lstat(path.join(f.root, "ci-bundle.tar.gz")), { code: "ENOENT" });
});

test("recorder streams stderr, preserves the exit code, and cannot overwrite first failure evidence", async t => {
  const f = await fixture(t);
  const args = ["scripts/ci/record.mjs", "first-failure", "--", process.execPath, "-e",
    "console.log('stdout marker'); console.error('stderr marker'); process.exit(7)"];
  const first = f.run(process.execPath, args);
  assert.equal(first.status, 7);
  assert.match(first.stdout, /stdout marker/);
  assert.match(first.stderr, /stderr marker/);
  const relative = "output/ci-migration/first-failure/";
  const before = await readFile(path.join(f.root, relative, "evidence.json"), "utf8");
  const evidence = JSON.parse(before);
  assert.equal(evidence.exitCode, 7);
  assert.equal(evidence.status, "failed");
  assert.equal(evidence.sourceSHA, f.git(["rev-parse", "HEAD"]));
  assert.ok(evidence.start && evidence.end && evidence.durationMs >= 0);
  assert.equal(await readFile(path.join(f.root, relative, "stdout.log"), "utf8"), "stdout marker\n");
  assert.equal(await readFile(path.join(f.root, relative, "stderr.log"), "utf8"), "stderr marker\n");
  const second = f.run(process.execPath, ["scripts/ci/record.mjs", "first-failure", "--", process.execPath, "-e", "process.exit(0)"]);
  assert.notEqual(second.status, 0);
  assert.equal(await readFile(path.join(f.root, relative, "evidence.json"), "utf8"), before);
  f.rejects(f.run(process.execPath, ["scripts/ci/record.mjs", "../escape", "--", process.execPath, "-e", ""]), /Usage:/);
});

test("recorder forwards SIGTERM and never records cancellation as success", { timeout: 20_000 }, async t => {
  const f = await fixture(t);
  const child = spawn(process.execPath, ["scripts/ci/record.mjs", "cancelled", "--", process.execPath, "-e",
    "console.log('ready'); setInterval(() => {}, 1000)"], { cwd: f.root, env: environment, stdio: ["ignore", "pipe", "pipe"] });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); });
  const closed = once(child, "close");
  const [ready] = await once(child.stdout, "data");
  assert.match(ready.toString(), /ready/);
  child.kill("SIGTERM");
  const [exitCode] = await closed;
  assert.equal(exitCode, 143);
  const evidence = await json(f.root, "output/ci-migration/cancelled/evidence.json");
  assert.equal(evidence.exitCode, 143);
  assert.equal(evidence.signal, "SIGTERM");
  assert.equal(evidence.status, "cancelled");
});

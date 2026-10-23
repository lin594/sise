#!/usr/bin/env node
import { gitArguments } from "./git.mjs";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, link, lstat, readFile, readdir, readlink, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const paths = ["node_modules", "server/node_modules", "client/node_modules", "server/dist", "client/dist"];
const lockPaths = ["package-lock.json", "server/package-lock.json", "client/package-lock.json"];
const archive = path.join(root, "ci-bundle.tar.gz");
const metadata = path.join(root, "ci-bundle.json");
const forbidden = [".env", ".env.*", ".npmrc", ".netrc", ".git", ".hg", ".svn", ".ssh", ".aws", ".kube", ".azure", ".gnupg", ".cache", ".npm", ".vite", ".vite-temp", ".parcel-cache", ".turbo", "npm-debug.log", "credentials", "credentials.json"];
const digest = value => createHash("sha256").update(value).digest("hex");
const stable = value => JSON.stringify(value);
const isCI = process.env.GITHUB_ACTIONS === "true" || Boolean(process.env.CI && process.env.CI !== "false");

function run(command, arguments_, options = {}) {
  const result = spawnSync(command, command === "git" ? gitArguments(root, arguments_) : arguments_, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.signal ?? result.status}): ${result.stderr ?? ""}`);
  return (result.stdout ?? "").trim();
}
async function shaFile(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
function blocked(name) {
  return name.split("/").some(part => forbidden.some(pattern => pattern.endsWith(".*")
    ? part.startsWith(pattern.slice(0, -1)) : part === pattern));
}
function allowed(name) {
  return typeof name === "string" && name.length > 0 && !name.includes("\\") && !name.includes("\0")
    && !/[\r\n]/.test(name) && !path.posix.isAbsolute(name) && !name.split("/").some(part => !part || part === "." || part === "..")
    && paths.some(base => name === base || name.startsWith(`${base}/`)) && !blocked(name);
}
function assertMember(name) {
  if (!allowed(name)) throw new Error(`Archive path is outside the allowed payload: ${name}`);
}
async function sourceIdentity() {
  const sha = run("git", ["rev-parse", "HEAD"]);
  const tree = run("git", ["rev-parse", "HEAD^{tree}"]);
  if (!/^[a-f0-9]{40}$/.test(sha) || !/^[a-f0-9]{40}$/.test(tree)) throw new Error("A full Git HEAD and tree are required");
  const diff = run("git", ["diff", "--binary", "HEAD", "--"]);
  if (isCI && diff) throw new Error("CI artifact sources must match the committed tree");
  if (process.env.GITHUB_SHA && process.env.GITHUB_SHA !== sha) throw new Error("GITHUB_SHA does not match the checked-out HEAD");
  let pr = null;
  if (process.env.GITHUB_EVENT_PATH) {
    const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
    if (event.pull_request) {
      pr = { head: event.pull_request.head?.sha, base: event.pull_request.base?.sha };
      if (![pr.head, pr.base].every(value => /^[a-f0-9]{40}$/.test(value ?? ""))) throw new Error("Invalid PR head/base identity");
    }
  }
  return { sha, tree, trackedDiffSHA256: digest(diff), pr };
}
function workflowIdentity() {
  const runId = process.env.GITHUB_RUN_ID ?? null;
  const rawAttempt = process.env.GITHUB_RUN_ATTEMPT;
  const attempt = rawAttempt === undefined ? null : Number(rawAttempt);
  if (runId !== null && !/^[1-9][0-9]*$/.test(runId)) throw new Error("Invalid GITHUB_RUN_ID");
  if (attempt !== null && (!Number.isSafeInteger(attempt) || attempt < 1)) throw new Error("Invalid GITHUB_RUN_ATTEMPT");
  if (process.env.GITHUB_ACTIONS === "true" && (runId === null || attempt === null)) throw new Error("GitHub artifact identity requires run ID and attempt");
  return { runId, attempt };
}
async function identity(requireToolchain) {
  const toolchainBytes = await readFile(path.join(root, "ci/toolchain.json"));
  const toolchain = JSON.parse(toolchainBytes);
  const locks = {};
  for (const relative of lockPaths) locks[relative] = await shaFile(path.join(root, relative));
  const rootLock = JSON.parse(await readFile(path.join(root, "package-lock.json"), "utf8"));
  const playwrightLockVersion = rootLock.packages?.["node_modules/@playwright/test"]?.version ?? null;
  const playwrightRuntimeLockVersion = rootLock.packages?.["node_modules/playwright"]?.version ?? null;
  const browserImageDigest = toolchain.browserImage?.match(/@sha256:([a-f0-9]{64})$/)?.[1] ?? null;
  let osRelease = null;
  if (process.platform === "linux") {
    const contents = await readFile("/etc/os-release", "utf8");
    const field = key => contents.match(new RegExp(`^${key}=(?:"([^"]*)"|([^\\n]*))$`, "m"))?.slice(1).find(value => value !== undefined) ?? null;
    osRelease = { id: field("ID"), versionId: field("VERSION_ID") };
  }
  const runtime = {
    node: process.versions.node,
    npm: run(process.platform === "win32" ? "npm.cmd" : "npm", ["--version"]),
    platform: process.platform,
    arch: process.arch,
    nodeABI: process.versions.modules,
    openssl: process.versions.openssl,
    glibc: process.report?.getReport().header.glibcVersionRuntime ?? null,
    osRelease,
  };
  if (requireToolchain && (toolchain.node !== "22.23.3" || runtime.node !== toolchain.node || runtime.npm !== toolchain.npm
    || runtime.platform !== "linux" || runtime.arch !== "x64" || !runtime.glibc
    || runtime.osRelease?.id !== "ubuntu" || runtime.osRelease?.versionId !== "24.04"
    || playwrightLockVersion !== toolchain.playwright || playwrightRuntimeLockVersion !== toolchain.playwright || !browserImageDigest)) {
    throw new Error("CI artifact requires Node 22.23.3, pinned npm/Playwright, Linux x64 Ubuntu 24.04 with glibc, and a pinned browser image digest");
  }
  return {
    source: await sourceIdentity(), workflow: workflowIdentity(), runtime, locks,
    toolchain: { sha256: digest(toolchainBytes), playwrightLockVersion, playwrightRuntimeLockVersion, browserImageDigest },
  };
}
async function distTrees() {
  const result = {};
  for (const base of ["server/dist", "client/dist"]) {
    const files = [];
    const visit = async relative => {
      if (relative) assertMember(`${base}/${relative}`);
      const absolute = path.join(root, base, relative);
      const stat = await lstat(absolute);
      if (stat.isDirectory()) {
        for (const child of (await readdir(absolute)).sort()) await visit(relative ? `${relative}/${child}` : child);
      } else if (stat.isFile()) files.push({ path: relative, sha256: await shaFile(absolute) });
      else if (stat.isSymbolicLink()) {
        const target = await readlink(absolute);
        assertMember(path.posix.normalize(path.posix.join(base, path.posix.dirname(relative), target)));
        files.push({ path: relative, sha256: digest(`symlink\0${target}`) });
      } else throw new Error(`Unsupported dist entry: ${base}/${relative}`);
    };
    await visit("");
    files.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
    result[base] = { sha256: digest(stable(files)), fileCount: files.length };
  }
  return result;
}

// Both producer and consumers belong to the same trusted workflow. Inspect
// filesystem links while packing; let the standard tar implementation list its
// own PAX/GNU names before a consumer extracts the hash-bound archive.
async function checkPayload() {
  const visit = async name => {
    if (blocked(name)) return;
    assertMember(name);
    const stat = await lstat(path.join(root, name));
    if (stat.isDirectory()) {
      for (const child of (await readdir(path.join(root, name))).sort()) await visit(`${name}/${child}`);
    } else if (stat.isSymbolicLink()) {
      const target = await readlink(path.join(root, name));
      if (path.posix.isAbsolute(target) || target.includes("\\") || /[\r\n]/.test(target)) throw new Error(`Unsafe payload link: ${name}`);
      assertMember(path.posix.normalize(path.posix.join(path.posix.dirname(name), target)));
    } else if (!stat.isFile()) throw new Error(`Unsupported payload entry: ${name}`);
  };
  for (const base of paths) {
    if (!(await lstat(path.join(root, base))).isDirectory()) throw new Error(`Payload root must be a real directory: ${base}`);
    await visit(base);
  }
}
function inspectArchive(file) {
  const listing = run("tar", ["-tzf", file], { env: { ...process.env, TAR_OPTIONS: "", COPYFILE_DISABLE: "1" } });
  const members = listing.split("\n").map(name => name.replace(/\/$/, ""));
  for (const name of members) assertMember(name);
  for (const base of paths) if (!members.includes(base)) throw new Error(`Missing archive payload: ${base}`);
  return members.length;
}
async function verify(requireToolchain) {
  const manifest = JSON.parse(await readFile(metadata, "utf8"));
  if (manifest.schemaVersion !== 1 || manifest.archive !== "ci-bundle.tar.gz" || stable(manifest.paths) !== stable(paths)
    || !/^[a-f0-9]{64}$/.test(manifest.archiveSHA256 ?? "")) throw new Error("Invalid artifact manifest schema");
  if (await shaFile(archive) !== manifest.archiveSHA256) throw new Error("Artifact archive SHA256 mismatch");
  const current = await identity(requireToolchain);
  for (const field of ["source", "workflow", "runtime", "locks", "toolchain"]) {
    if (stable(current[field]) !== stable(manifest[field])) throw new Error(`Artifact ${field} identity mismatch`);
  }
  for (const base of ["server/dist", "client/dist"]) {
    if (!/^[a-f0-9]{64}$/.test(manifest.distTrees?.[base]?.sha256 ?? "") || !Number.isSafeInteger(manifest.distTrees[base].fileCount)) throw new Error(`Invalid dist tree manifest: ${base}`);
  }
  await inspectArchive(archive);
  return manifest;
}
async function main() {
  const [command, ...options] = process.argv.slice(2);
  if (!["pack", "verify", "restore", "identity"].includes(command) || options.some(option => option !== "--require-toolchain")) {
    throw new Error("Usage: node scripts/ci/artifact.mjs pack|verify|restore|identity [--require-toolchain]");
  }
  const requireToolchain = isCI || options.includes("--require-toolchain");
  if (command === "identity") {
    console.log(JSON.stringify({ ...await identity(requireToolchain), distTrees: await distTrees() }, null, 2));
    return;
  }
  if (command === "pack") {
    for (const output of [archive, metadata]) {
      try { await access(output); } catch (error) { if (error.code === "ENOENT") continue; throw error; }
      throw new Error(`Refusing to replace existing artifact: ${output}`);
    }
    await checkPayload();
    const before = await identity(requireToolchain);
    const trees = await distTrees();
    const temporary = path.join(root, `.ci-bundle-${randomUUID()}.tar.gz`);
    try {
      run("tar", ["--format=pax", "-czf", temporary, ...forbidden.map(pattern => `--exclude=${pattern}`), "--", ...paths], {
        env: { ...process.env, TAR_OPTIONS: "", COPYFILE_DISABLE: "1" },
      });
      const memberCount = await inspectArchive(temporary);
      const after = await identity(requireToolchain);
      if (stable(before) !== stable(after) || stable(trees) !== stable(await distTrees())) throw new Error("Artifact sources or build outputs changed while packing");
      const manifest = { schemaVersion: 1, archive: "ci-bundle.tar.gz", archiveSHA256: await shaFile(temporary), paths,
        ...before, distTrees: trees, createdAt: new Date().toISOString() };
      await link(temporary, archive);
      await writeFile(metadata, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx", mode: 0o600 });
      console.log(`Packed ${memberCount} validated entries for ${before.source.sha}; archive SHA256 ${manifest.archiveSHA256}`);
    } finally { await rm(temporary, { force: true }); }
  } else {
    const manifest = await verify(requireToolchain);
    if (command === "restore") {
      for (const base of paths) {
        const parent = path.dirname(path.join(root, base));
        if (!(await lstat(parent)).isDirectory()) throw new Error(`Restore parent must be a real directory: ${parent}`);
        try { await lstat(path.join(root, base)); } catch (error) { if (error.code === "ENOENT") continue; throw error; }
        throw new Error(`Refusing to replace existing payload: ${base}`);
      }
      run("tar", ["-xzf", archive, "--no-same-owner", "--no-same-permissions", "-C", root], { env: { ...process.env, TAR_OPTIONS: "", COPYFILE_DISABLE: "1" } });
      if (stable(await distTrees()) !== stable(manifest.distTrees)) throw new Error("Restored dist tree digest mismatch");
      if (await shaFile(archive) !== manifest.archiveSHA256) throw new Error("Artifact archive changed during restore");
    }
    console.log(`${command === "restore" ? "Restored" : "Verified"} artifact for ${manifest.source.sha}, run ${manifest.workflow.runId ?? "local"}, attempt ${manifest.workflow.attempt ?? "local"}`);
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });

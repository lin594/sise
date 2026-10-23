#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, open, rename, writeFile } from "node:fs/promises";
import { constants } from "node:os";
import path from "node:path";
import { finished } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
async function main() {
  const [label, separator, command, ...arguments_] = process.argv.slice(2);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(label ?? "") || separator !== "--" || !command) {
    throw new Error("Usage: node scripts/ci/record.mjs <safe-layer-label> -- <command> [arguments...]");
  }
  const source = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
  const sourceSHA = source.stdout?.trim();
  if (source.error || source.status !== 0 || !/^[a-f0-9]{40}$/.test(sourceSHA ?? "")) throw new Error("Evidence requires a full current Git HEAD");
  const directory = path.join(root, "output/ci-migration", label);
  await mkdir(directory, { recursive: true });
  const evidencePath = path.join(directory, "evidence.json");
  const reserved = await open(evidencePath, "wx");
  const start = new Date().toISOString();
  const started = performance.now();
  const evidence = { schemaVersion: 1, layer: label, command: [command, ...arguments_], sourceSHA,
    start, end: null, durationMs: null, attempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
    runId: process.env.GITHUB_RUN_ID ?? null, exitCode: null, signal: null, status: "running" };
  await reserved.writeFile(`${JSON.stringify(evidence, null, 2)}\n`);
  await reserved.close();
  const stdoutFile = await open(path.join(directory, "stdout.log"), "wx");
  const stderrFile = await open(path.join(directory, "stderr.log"), "wx");
  const stdoutLog = createWriteStream("", { fd: stdoutFile.fd, autoClose: false });
  const stderrLog = createWriteStream("", { fd: stderrFile.fd, autoClose: false });
  let receivedSignal = null;
  let child;
  let escalation;
  const forward = signal => {
    receivedSignal ??= signal;
    if (!child?.pid) return;
    try {
      if (process.platform === "win32") child.kill(signal);
      else process.kill(-child.pid, signal);
    } catch (error) { if (error.code !== "ESRCH") throw error; }
    escalation ??= setTimeout(() => {
      try {
        if (process.platform === "win32") child.kill("SIGKILL");
        else process.kill(-child.pid, "SIGKILL");
      } catch (error) { if (error.code !== "ESRCH") console.error(error.message); }
    }, 10_000).unref();
  };
  const handlers = new Map(["SIGINT", "SIGTERM", "SIGHUP"].map(signal => [signal, () => forward(signal)]));
  for (const [signal, handler] of handlers) process.on(signal, handler);
  let result;
  try {
    child = spawn(command, arguments_, { cwd: root, env: process.env, shell: false,
      detached: process.platform !== "win32", stdio: ["inherit", "pipe", "pipe"] });
    child.stdout.pipe(process.stdout, { end: false });
    child.stdout.pipe(stdoutLog);
    child.stderr.pipe(process.stderr, { end: false });
    child.stderr.pipe(stderrLog);
    if (receivedSignal) forward(receivedSignal);
    result = await new Promise(resolve => {
      let spawnError = null;
      child.once("error", error => {
        spawnError = error;
        process.stderr.write(`${error.message}\n`);
        stderrLog.write(`${error.message}\n`);
      });
      child.once("close", (code, signal) => resolve({ code, signal, spawnError }));
    });
    await Promise.all([finished(stdoutLog), finished(stderrLog)]);
  } finally {
    if (escalation) clearTimeout(escalation);
    for (const [signal, handler] of handlers) process.off(signal, handler);
    await Promise.all([stdoutFile.close(), stderrFile.close()]);
  }
  const signal = receivedSignal ?? result.signal;
  const exitCode = signal ? 128 + (constants.signals[signal] ?? 1) : result.spawnError ? 127 : result.code ?? 1;
  Object.assign(evidence, { end: new Date().toISOString(), durationMs: performance.now() - started, exitCode, signal,
    status: signal ? "cancelled" : exitCode === 0 ? "passed" : "failed" });
  const temporary = path.join(directory, "evidence.json.tmp");
  await writeFile(temporary, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx" });
  await rename(temporary, evidencePath);
  process.exitCode = exitCode;
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });

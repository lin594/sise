import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { promisify } from "node:util";

// Only creates and removes uniquely named local test resources. No existing
// Compose project, remote host, gateway, Redis database or container is touched.
const require = createRequire(new URL("../client/package.json", import.meta.url));
const { Client } = require("@colyseus/sdk");
const exec = promisify(execFile);
const candidate = process.env.RECOVERY_TEST_IMAGE;
assert.ok(candidate, "Set RECOVERY_TEST_IMAGE to the locally built candidate image");
const baseline = process.env.RECOVERY_BASELINE_IMAGE;
const redisImage = process.env.RECOVERY_REDIS_IMAGE || "redis:7-alpine";
const project = `sise-recovery-test-${randomBytes(6).toString("hex")}`;
const network = `${project}-net`;
const redis = `${project}-redis`;
const server = `${project}-server`;
const evidence = { project, candidate, baseline, cases: [] };
let room;
let baseUrl;
async function docker(...args) {
  return (await exec("docker", args, { timeout: 120_000, maxBuffer: 2 * 1024 * 1024 })).stdout.trim();
}
async function waitFor(check, description, timeout = 30_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try { const result = await check(); if (result) return result; } catch { /* startup window */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${description}`);
}
async function start(image) {
  await docker("run", "-d", "--name", server, "--network", network,
    "-p", "127.0.0.1::2567", "--stop-timeout", "30",
    "-e", `REDIS_URL=redis://${redis}:6379`, "-e", "NODE_ENV=production",
    "-e", "CORS_ALLOWED_ORIGINS=http://127.0.0.1", "-e", "MIN_PLAYERS=1",
    "-e", "RECONNECT_GRACE_MS=300000", "-e", "OP_TIMEOUT_MS=300000",
    "-e", "DECLARE_TIMEOUT_MS=300000", "-e", "ROOM_LOG=0", "-e", "HU_LOG=0",
    "-e", "BOT_THINK_MIN_MS=20", "-e", "BOT_THINK_MAX_MS=40",
    "-e", "BOT_COLLECTIVE_THINK_MIN_MS=10", "-e", "BOT_COLLECTIVE_THINK_MAX_MS=20",
    "-e", "LOCAL_TRANSITION_DELAY_MS=0", "-e", "DEALER_PICK_INTRO_MS=0", "-e", "DEALER_REVEAL_INTRO_MS=0", image);
  const port = await docker("port", server, "2567/tcp");
  baseUrl = `http://${port}`;
  await waitFor(async () => (await fetch(`${baseUrl}/health`)).ok, "server health");
}
async function join(roomId, playerToken, hostKey) {
  const client = new Client(baseUrl.replace(/^http/, "ws"));
  room = await client.joinById(roomId, { name: "Recovery test", playerToken, hostKey });
  room.reconnection.enabled = false;
  room.onMessage("*", () => {});
  // Suppress expected close notifications during a Docker stop.
  room.onError(() => {});
  room.send("sync_state");
  return room;
}
async function privateState(roomId, token) {
  const response = await fetch(`${baseUrl}/private-state?roomId=${encodeURIComponent(roomId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(response.status, 200);
  return response.json();
}
async function snapshot(roomId) {
  return JSON.parse(await docker("exec", redis, "redis-cli", "--raw", "GET", `sise:room-snapshot:v1:${roomId}`));
}
async function stop(roomId, requireFlush) {
  const stoppedAt = Date.now();
  await docker("stop", "--time", "30", server);
  const status = JSON.parse(await docker("inspect", "--format", "{{json .State}}", server));
  assert.notEqual(status.ExitCode, 137, "Docker SIGKILLed the server after its grace period");
  const saved = await snapshot(roomId);
  if (requireFlush) {
    assert.equal(status.ExitCode, 0, "candidate should gracefully exit after SIGTERM");
    assert.ok(saved.savedAt >= stoppedAt, "SIGTERM must flush a fresh snapshot before exit");
  }
  await docker("rm", server);
  return { exitCode: status.ExitCode, gracefulSnapshotFlushed: saved.savedAt >= stoppedAt };
}
async function declare() {
  room.send("declare_fish", { fishCardIds: [] });
  room.send("declare_kongs", 0);
}
async function reachDiscard(roomId, token) {
  await declare();
  await waitFor(async () => {
    const saved = await snapshot(roomId);
    const state = await privateState(roomId, token);
    if (process.env.RECOVERY_DEBUG === "1") console.error(JSON.stringify({ phase: saved.state.phase,
      lastAction: saved.state.lastAction, awaiting: saved.privateState.awaitingDiscardOwnerId,
      seat: state.seatId, actions: state.availableActions, timer: state.decisionTimer }));
    if (saved.state.phase === "declaring") await declare();
    if (saved.state.phase === "playing" && saved.privateState.awaitingDiscardOwnerId === state.seatId) return true;
    const action = ["chi", "peng", "kai", "pass"].map(name => state.availableActions.find(a => a.action === name && a.enabled && !a.deferred)).find(Boolean);
    if (action) room.send("action", { action: action.action, candidateId: action.candidates?.[0]?.id,
      decisionKey: state.decisionTimer.decisionKey });
    return false;
  }, "a human discard decision", 120_000);
}
async function recoveryCase(images, label, phase) {
  await start(images[0]);
  const response = await fetch(`${baseUrl}/rooms`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "practice" }),
  });
  assert.equal(response.status, 200);
  const created = await response.json();
  const token = `pt_${randomBytes(24).toString("hex")}`;
  await join(created.roomId, token, created.hostKey);
  room.send("start_game");
  let before = await waitFor(async () => {
    const state = await privateState(created.roomId, token);
    return state.privateHand.length >= 20 ? state : false;
  }, "an active private hand");
  await waitFor(async () => (await snapshot(created.roomId)).state.phase === "declaring", "persisted declaring room");
  if (phase === "playing") {
    await reachDiscard(created.roomId, token);
    before = await privateState(created.roomId, token);
  }
  const stops = [];
  for (let index = 1; index < images.length; index += 1) {
    stops.push(await stop(created.roomId, images[index - 1] === candidate));
    await start(images[index]);
    assert.match(await docker("logs", server), /\[room-recovery\] 已在开放连接前恢复 \d+ 个房间/);
    const after = await privateState(created.roomId, token);
    assert.equal(after.roomId, before.roomId);
    assert.equal(after.seatId, before.seatId);
    assert.deepEqual(after.privateHand, before.privateHand, "private hand must survive replacement/rollback");
    await join(created.roomId, token);
  }
  if (phase === "playing") {
    const current = await privateState(created.roomId, token);
    const legal = current.decisionTimer.legalDiscardCardIds ?? current.privateHand.filter(card =>
      card.type !== "jiang" && card.color !== "gold"
      && current.privateHand.filter(other => other.color === card.color && other.type === card.type).length < 3,
    ).map(card => card.id);
    assert.ok(legal.length, "a playable discard must exist");
    let accepted = false;
    room.onMessage("action_received", message => { if (message.action === "discard") accepted = true; });
    room.send("discard_card", { cardId: legal[0], decisionKey: current.decisionTimer.decisionKey });
    await waitFor(() => accepted, "recovered discard to be accepted");
  } else {
    await declare();
    await waitFor(async () => (await snapshot(created.roomId)).state.phase === "playing", "recovered decision to advance");
  }
  const saved = await snapshot(created.roomId);
  evidence.cases.push({ label, phase, images, roomPreserved: true, seatPreserved: true,
    credentialPreserved: true, privateHandCount: before.privateHand.length,
    privateHandHash: createHash("sha256").update(JSON.stringify(before.privateHand)).digest("hex"),
    recoveredDecisionAdvanced: true, snapshotSchema: saved.version, stops });
  await stop(created.roomId, images.at(-1) === candidate);
}
try {
  await docker("network", "create", ...(process.env.RECOVERY_TEST_SUBNET ? ["--subnet", process.env.RECOVERY_TEST_SUBNET] : []), network);
  await docker("run", "-d", "--name", redis, "--network", network, redisImage);
  await waitFor(async () => (await docker("exec", redis, "redis-cli", "ping")) === "PONG", "isolated Redis");
  for (const phase of ["declaring", "playing"]) {
    await recoveryCase([candidate, candidate], "candidate SIGTERM and restart", phase);
    if (baseline) await recoveryCase([baseline, candidate, baseline], "baseline upgrade and rollback", phase);
  }
  console.log(JSON.stringify({ ok: true, ...evidence }, null, 2));
} finally {
  room?.connection?.close();
  await docker("rm", "-f", server).catch(() => {});
  await docker("rm", "-f", redis).catch(() => {});
  await docker("network", "rm", network).catch(() => {});
}

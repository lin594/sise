import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chromium } from "playwright";

const execFileAsync = promisify(execFile);

if (process.env.LIVE_RECOVERY_SMOKE !== "1") {
  console.error("Refusing to restart a live service. Set LIVE_RECOVERY_SMOKE=1 after confirming the target.");
  process.exit(2);
}

const baseUrl = new URL(process.env.LIVE_RECOVERY_BASE_URL || "http://imac.tajuren.cn/");
const backendUrl = new URL(process.env.LIVE_RECOVERY_BACKEND_URL || baseUrl.href);
const sshHost = process.env.LIVE_RECOVERY_SSH_HOST || "imac";
const remotePath = process.env.LIVE_RECOVERY_REMOTE_PATH || "~/workspace/lin594/sise";
const browserChannel = process.env.PLAYWRIGHT_CHANNEL || "chrome";
const recreateServer = process.env.LIVE_RECOVERY_RECREATE_SERVER === "1";
const recoveryPhase = process.env.LIVE_RECOVERY_PHASE || "declaring";

assert.match(baseUrl.protocol, /^https?:$/);
assert.match(backendUrl.protocol, /^https?:$/);
assert.match(sshHost, /^[A-Za-z0-9_.-]+$/, "SSH host contains unsupported characters");
assert.match(remotePath, /^~?[A-Za-z0-9_./-]+$/, "Remote path contains unsupported characters");
assert.match(recoveryPhase, /^(?:declaring|playing)$/u, "Unsupported recovery phase");

async function waitForHealth(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  const healthUrl = new URL("/health", backendUrl);
  while (Date.now() < deadline) {
    try {
      const response = await fetch(healthUrl, { signal: AbortSignal.timeout(2_000) });
      if (response.ok && (await response.json())?.ok === true) {
        return;
      }
    } catch {
      // A restart normally produces a short connection failure window.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Health check did not recover within ${timeoutMs}ms`);
}

async function readRemoteContainerId(service) {
  assert.match(service, /^(?:server|web)$/u);
  const { stdout } = await execFileAsync(
    "ssh",
    [
      sshHost,
      `cd ${remotePath} && docker compose -f docker-compose.yml -f docker-compose.imac.yml ps -q ${service}`,
    ],
    { timeout: 30_000, maxBuffer: 1024 * 1024 },
  );
  const containerId = stdout.trim();
  assert.ok(containerId, `${service} container is not running`);
  return containerId;
}

async function readDeclarationSnapshot(page) {
  await page.getByTestId("confirm-declaration").waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForFunction(() => {
    const button = document.querySelector('[data-testid="confirm-declaration"]');
    const cards = document.querySelectorAll('[data-testid="declare-hand-preview"] [role="img"]');
    // The dealer holds the revealed dealer card (21 cards); the other three
    // seats begin declaration with 20. Button readiness is the authoritative
    // signal that the private hand has finished synchronizing.
    return button instanceof HTMLButtonElement && !button.disabled && cards.length >= 20;
  }, undefined, { timeout: 30_000 });

  return page.evaluate(() => {
    const roomId = localStorage.getItem("four_room_id");
    const token = roomId ? localStorage.getItem(`four_player_token:${roomId}`) : null;
    return {
      roomId,
      token,
      seatId: document.querySelector('[data-testid="player-self"]')?.getAttribute("data-player-id") ?? null,
      handLabels: Array.from(
        document.querySelectorAll('[data-testid="declare-hand-preview"] [role="img"]'),
        (card) => card.getAttribute("aria-label") ?? "",
      ),
    };
  });
}

async function readPlayingSnapshot(page) {
  await page.locator("main.layout.playing").waitFor({ state: "visible", timeout: 30_000 });
  await page.getByTestId("discard-confirm").waitFor({ state: "visible", timeout: 30_000 });
  await page.locator(".hand .hand-card").first().waitFor({ state: "visible", timeout: 30_000 });

  return page.evaluate(() => {
    const roomId = localStorage.getItem("four_room_id");
    const token = roomId ? localStorage.getItem(`four_player_token:${roomId}`) : null;
    return {
      roomId,
      token,
      seatId: document.querySelector('[data-testid="player-self"]')?.getAttribute("data-player-id") ?? null,
      handLabels: Array.from(
        document.querySelectorAll(".hand .hand-card"),
        (card) => card.dataset.cardId ?? "",
      ),
    };
  });
}

async function reachPlayingDiscardDecision(page) {
  await page.getByTestId("confirm-declaration").click();
  await page.locator("main.layout.playing").waitFor({ state: "visible", timeout: 30_000 });
  const deadline = Date.now() + 60_000;
  const discardConfirm = page.getByTestId("discard-confirm");

  while (Date.now() < deadline) {
    if (await discardConfirm.isVisible().catch(() => false)) {
      return;
    }

    const candidate = page.getByTestId("candidate-option").first();
    if ((await candidate.isVisible().catch(() => false)) && (await candidate.isEnabled().catch(() => false))) {
      await candidate.click({ force: true });
      await page.waitForTimeout(250);
      continue;
    }

    const responsePhase = await page.getByTestId("game-board").getAttribute("data-response-phase");
    const preferredActions = responsePhase === "collective"
      ? ["action-pass", "action-peng", "action-kai", "action-chi"]
      : ["action-pass", "action-chi", "action-peng", "action-kai"];
    let acted = false;
    for (const testId of preferredActions) {
      const action = page.getByTestId(testId);
      if ((await action.isVisible().catch(() => false)) && (await action.isEnabled().catch(() => false))) {
        await action.click({ force: true });
        acted = true;
        break;
      }
    }
    await page.waitForTimeout(acted ? 250 : 150);
  }

  throw new Error("Timed out before the player received a discard decision");
}

async function advanceRecoveredPlayingDecision(page, handCountBefore) {
  const playableCard = page.locator(".hand .hand-card:not(:disabled)").first();
  await playableCard.waitFor({ state: "visible", timeout: 30_000 });
  await playableCard.click();
  const discardConfirm = page.getByTestId("discard-confirm");
  await discardConfirm.waitFor({ state: "visible", timeout: 10_000 });
  assert.equal(await discardConfirm.isEnabled(), true, "discard confirmation did not become enabled");
  await discardConfirm.click();
  await page.waitForFunction(
    (previousCount) =>
      document.querySelectorAll(".hand .hand-card").length < previousCount
      || !document.querySelector('[data-testid="discard-confirm"]'),
    handCountBefore,
    { timeout: 30_000 },
  );
}

let browser;
let page;
try {
  await waitForHealth();
  browser = await chromium.launch({ channel: browserChannel, headless: true });
  const context = await browser.newContext({
    viewport: { width: 667, height: 375 },
    hasTouch: true,
    isMobile: true,
  });
  page = await context.newPage();
  await page.goto(baseUrl.href, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.getByTestId("random-nickname").click();
  await page.getByTestId("login-submit").click();
  await page.getByText("游戏模式选择").waitFor({ state: "visible", timeout: 15_000 });
  await page.getByTestId("lobby-start").click();
  await page.getByTestId("game-board").waitFor({ state: "visible", timeout: 20_000 });

  if (recoveryPhase === "playing") {
    await reachPlayingDiscardDecision(page);
  }
  const before = recoveryPhase === "playing"
    ? await readPlayingSnapshot(page)
    : await readDeclarationSnapshot(page);
  assert.match(before.roomId ?? "", /^[A-Za-z0-9_-]+$/);
  assert.ok(/^pt_[0-9a-f]{48}$/.test(before.token ?? ""), "room credential is missing or malformed");
  assert.ok(before.seatId, "seat identity is missing");
  assert.ok(
    recoveryPhase === "playing" ? before.handLabels.length > 0 : before.handLabels.length >= 20,
    "private hand is incomplete",
  );

  // Give the debounced persistence writer enough time before inducing failure.
  await page.waitForTimeout(500);
  const serverContainerIdBefore = recreateServer ? await readRemoteContainerId("server") : null;
  const webContainerIdBefore = recreateServer ? await readRemoteContainerId("web") : null;
  const restartStartedAt = Date.now();
  await execFileAsync(
    "ssh",
    [
      sshHost,
      recreateServer
        ? `cd ${remotePath} && docker compose -f docker-compose.yml -f docker-compose.imac.yml up -d --force-recreate --no-deps server`
        : `cd ${remotePath} && docker compose restart server`,
    ],
    { timeout: 120_000, maxBuffer: 1024 * 1024 },
  );
  if (recreateServer) {
    assert.notEqual(
      await readRemoteContainerId("server"),
      serverContainerIdBefore,
      "server container was not recreated",
    );
    assert.equal(
      await readRemoteContainerId("web"),
      webContainerIdBefore,
      "web gateway restarted during the server-only recovery test",
    );
  }
  await waitForHealth();

  const restoredNotice = page.locator('[data-testid="connection-status"][data-state="restored"]');
  await restoredNotice.waitFor({ state: "visible", timeout: 30_000 });
  assert.match((await restoredNotice.textContent()) ?? "", /已恢复.*请核对手牌/s);

  const after = recoveryPhase === "playing"
    ? await readPlayingSnapshot(page)
    : await readDeclarationSnapshot(page);
  assert.ok(after.roomId === before.roomId, "room id changed after restart");
  assert.ok(after.token === before.token, "room credential changed after restart");
  assert.ok(after.seatId === before.seatId, "seat changed after restart");
  assert.ok(
    after.handLabels.length === before.handLabels.length
      && after.handLabels.every((label, index) => label === before.handLabels[index]),
    "private hand changed during restart recovery",
  );

  const since = new Date(restartStartedAt - 2_000).toISOString();
  const { stdout: recoveryLogs } = await execFileAsync(
    "ssh",
    [sshHost, `cd ${remotePath} && docker compose logs --since '${since}' server`],
    { timeout: 30_000, maxBuffer: 1024 * 1024 },
  );
  assert.match(recoveryLogs, /\[room-recovery\] 已在开放连接前恢复 \d+ 个房间/);

  // Prove that the recovered untimed human decision can still advance.
  if (recoveryPhase === "playing") {
    await advanceRecoveredPlayingDecision(page, after.handLabels.length);
  } else {
    await page.getByTestId("confirm-declaration").click();
    await page.locator("main.layout.playing").waitFor({ state: "visible", timeout: 30_000 });
  }

  await page.getByTestId("game-exit").click();
  await page.getByTestId("confirm-exit").click();
  await page.getByText("游戏模式选择").waitFor({ state: "visible", timeout: 15_000 });

  console.log(JSON.stringify({
    ok: true,
    roomPreserved: true,
    seatPreserved: true,
    privateHandCount: after.handLabels.length,
    recoveredDecisionAdvanced: true,
    playingDecisionAdvanced: recoveryPhase === "playing" ? true : undefined,
    recoveryPhase,
    serverOperation: recreateServer ? "recreate" : "restart",
    webGatewayPreserved: recreateServer || undefined,
  }));
} catch (error) {
  if (page) {
    await page.screenshot({ path: "test-results/live-room-recovery-failure.png", fullPage: true }).catch(() => undefined);
  }
  throw error;
} finally {
  await browser?.close().catch(() => undefined);
}

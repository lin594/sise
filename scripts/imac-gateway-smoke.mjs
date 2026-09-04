import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chromium } from "playwright";

const execFileAsync = promisify(execFile);
const baseUrl = new URL(process.env.IMAC_GATEWAY_BASE_URL || "http://imac.tajuren.cn/");
const sshHost = process.env.IMAC_GATEWAY_SSH_HOST || "imac";
const remotePath = process.env.IMAC_GATEWAY_REMOTE_PATH || "~/workspace/lin594/sise";
const browserChannel = process.env.PLAYWRIGHT_CHANNEL || "chrome";

assert.match(baseUrl.protocol, /^https?:$/u);
assert.match(sshHost, /^[A-Za-z0-9_.-]+$/u, "SSH host contains unsupported characters");
assert.match(remotePath, /^~?[A-Za-z0-9_./-]+$/u, "Remote path contains unsupported characters");

async function fetchWithTimeout(url, init = {}, timeoutMs = 5_000) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

const composeFiles = "-f docker-compose.yml -f docker-compose.imac.yml";
const { stderr: nginxCheck } = await execFileAsync(
  "ssh",
  [sshHost, `cd ${remotePath} && docker compose ${composeFiles} exec -T web nginx -t`],
  { timeout: 30_000, maxBuffer: 1024 * 1024 },
);
assert.match(nginxCheck, /syntax is ok/u, "Nginx configuration check did not pass");

const pageResponse = await fetchWithTimeout(baseUrl);
assert.equal(pageResponse.status, 200, "gateway did not serve the client page");
assert.match(pageResponse.headers.get("content-type") ?? "", /text\/html/u);
assert.match(await pageResponse.text(), /<div id="app"><\/div>/u);

const manifestResponse = await fetchWithTimeout(new URL("/site.webmanifest", baseUrl));
assert.equal(manifestResponse.status, 200, "web app manifest is unavailable");
assert.match(
  manifestResponse.headers.get("content-type") ?? "",
  /application\/manifest\+json/u,
  "web app manifest has the wrong content type",
);
const manifest = await manifestResponse.json();
assert.equal(manifest.name, "四色牌", "web app manifest has the wrong name");
assert.equal(manifest.start_url, "/", "web app manifest has the wrong start URL");

const iconResponse = await fetchWithTimeout(new URL("/icons/sise-192.png", baseUrl));
assert.equal(iconResponse.status, 200, "home-screen icon is unavailable");
assert.equal(iconResponse.headers.get("content-type"), "image/png", "home-screen icon has the wrong content type");

const missingIconResponse = await fetchWithTimeout(new URL("/icons/missing-smoke-icon.png", baseUrl));
assert.equal(missingIconResponse.status, 404, "missing static icons still fall back to the app shell");

const healthResponse = await fetchWithTimeout(new URL("/health", baseUrl));
assert.equal(healthResponse.status, 200, "same-origin health proxy failed");
assert.equal((await healthResponse.json())?.ok, true, "health proxy returned an invalid body");

const legacyUrl = new URL(baseUrl);
legacyUrl.port = process.env.IMAC_GATEWAY_LEGACY_PORT || "3000";
const legacyResponse = await fetchWithTimeout(legacyUrl);
assert.equal(legacyResponse.status, 200, "legacy port 3000 no longer serves the client page");

let directBackendReachable = false;
try {
  const directBackendUrl = new URL(baseUrl);
  directBackendUrl.port = process.env.IMAC_GATEWAY_DIRECT_BACKEND_PORT || "2567";
  await fetchWithTimeout(new URL("/health", directBackendUrl), {}, 2_000);
  directBackendReachable = true;
} catch {
  // The intended result is a connection refusal or timeout: port 2567 stays private.
}
assert.equal(directBackendReachable, false, "backend port 2567 is still reachable from the host network");

const browser = await chromium.launch({ channel: browserChannel, headless: true });
let roomApiSeen = false;
let sameOriginWebSocket = false;
try {
  const context = await browser.newContext({
    viewport: { width: 667, height: 375 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (response.request().method() === "POST" && url.origin === baseUrl.origin && url.pathname === "/rooms") {
      roomApiSeen = response.ok();
    }
  });
  page.on("websocket", (socket) => {
    const url = new URL(socket.url());
    if (
      url.host === baseUrl.host
      && /^\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/u.test(url.pathname)
    ) {
      sameOriginWebSocket = true;
    }
  });

  await page.goto(baseUrl.href, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.getByTestId("random-nickname").click();
  await page.getByTestId("login-submit").click();
  await page.getByText("游戏模式选择").waitFor({ state: "visible", timeout: 15_000 });
  await page.getByTestId("lobby-start").click();
  await page.getByTestId("game-board").waitFor({ state: "visible", timeout: 30_000 });
  assert.equal(roomApiSeen, true, "room creation did not use the same-origin HTTP proxy");
  assert.equal(sameOriginWebSocket, true, "room connection did not use the same-origin WebSocket proxy");

  await page.getByTestId("game-exit").click();
  await page.getByTestId("confirm-exit").click();
  await page.getByText("游戏模式选择").waitFor({ state: "visible", timeout: 15_000 });
  await context.close();
} finally {
  await browser.close();
}

console.log(JSON.stringify({
  ok: true,
  page: true,
  browserIdentity: true,
  missingStatic404: true,
  health: true,
  roomApi: roomApiSeen,
  websocket: sameOriginWebSocket,
  legacyPort: true,
  backendHostPortClosed: true,
  nginxSyntax: true,
}));

import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const repositoryRoot = process.cwd();

test("the iMac override exposes only the same-origin web gateway", async () => {
  const compose = await readFile(path.join(repositoryRoot, "docker-compose.imac.yml"), "utf8");

  expect(compose).toContain('VITE_SERVER_URL: "${IMAC_VITE_SERVER_URL:-ws://imac.tajuren.cn}"');
  expect(compose).toContain('VITE_SERVER_HTTP_URL: "${IMAC_VITE_SERVER_HTTP_URL:-http://imac.tajuren.cn}"');
  expect(compose).toContain('CORS_ALLOWED_ORIGINS: "${IMAC_CORS_ALLOWED_ORIGINS:-http://imac.tajuren.cn,http://imac.tajuren.cn:3000}"');
  expect(compose).toContain('TRUST_PROXY_HOPS: "1"');
  expect(compose).toMatch(/server:[\s\S]*?ports:\s*!override\s*\[\]/u);
  expect(compose).toMatch(/web:[\s\S]*?ports:\s*!override[\s\S]*?-\s*"80:80"[\s\S]*?-\s*"3000:80"/u);
});

test("Nginx forwards every browser-facing game route and websocket upgrade", async () => {
  const nginx = await readFile(path.join(repositoryRoot, "client/nginx/default.conf"), "utf8");

  expect(nginx).toMatch(
    /upstream\s+game_server\s*\{[\s\S]*?zone\s+game_server\s+64k;[\s\S]*?resolver\s+127\.0\.0\.11\s+valid=10s\s+ipv6=off;[\s\S]*?server\s+server:2567\s+resolve;/u,
  );
  expect(nginx).toContain("resolver_timeout 5s;");
  expect(nginx).toContain("location ^~ /matchmake/");
  expect(nginx).toContain("error_page 418 = @game_websocket;");
  expect(nginx).toContain("if ($connection_upgrade = upgrade)");
  expect(nginx).toContain("location @game_websocket");
  for (const route of ["/health", "/guest-profile", "/room-id", "/rooms", "/reset-room", "/private-state"]) {
    expect(nginx).toContain(`location = ${route}`);
  }
  expect(nginx).toContain("proxy_set_header Upgrade $http_upgrade;");
  expect(nginx).toContain("proxy_set_header Connection $connection_upgrade;");
  expect(nginx).toContain("proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;");
});

test("the recovery smoke can replace only the backend container", async () => {
  const smoke = await readFile(path.join(repositoryRoot, "scripts/live-room-recovery-smoke.mjs"), "utf8");

  expect(smoke).toContain('process.env.LIVE_RECOVERY_RECREATE_SERVER === "1"');
  expect(smoke).toContain("up -d --force-recreate --no-deps server");
  expect(smoke).toContain('readRemoteContainerId("server")');
  expect(smoke).toContain('readRemoteContainerId("web")');
  expect(smoke).toContain('"web gateway restarted during the server-only recovery test"');
});

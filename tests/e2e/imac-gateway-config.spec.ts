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

  expect(nginx).toMatch(/upstream\s+game_server\s*\{[\s\S]*?server\s+server:2567;/u);
  expect(nginx).toContain("location ^~ /matchmake/");
  for (const route of ["/health", "/guest-profile", "/room-id", "/rooms", "/reset-room", "/private-state"]) {
    expect(nginx).toContain(`location = ${route}`);
  }
  expect(nginx).toContain("proxy_set_header Upgrade $http_upgrade;");
  expect(nginx).toContain("proxy_set_header Connection $connection_upgrade;");
  expect(nginx).toContain("proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;");
});

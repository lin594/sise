import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const expectedHttpOrigin = "http://imac.tajuren.cn";
const expectedLegacyOrigin = "http://imac.tajuren.cn:3000";

const { stdout } = await execFileAsync(
  "docker",
  [
    "compose",
    "-f",
    "docker-compose.yml",
    "-f",
    "docker-compose.imac.yml",
    "config",
    "--format",
    "json",
  ],
  {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      IMAC_CORS_ALLOWED_ORIGINS: `${expectedHttpOrigin},${expectedLegacyOrigin}`,
      IMAC_VITE_SERVER_HTTP_URL: expectedHttpOrigin,
      IMAC_VITE_SERVER_URL: "ws://imac.tajuren.cn",
    },
    maxBuffer: 4 * 1024 * 1024,
  },
);

const rendered = JSON.parse(stdout);
const server = rendered.services?.server;
const web = rendered.services?.web;
assert.ok(server && web, "rendered Compose config is missing server or web");
assert.deepEqual(server.ports ?? [], [], "server port 2567 must not be published on the iMac host");
assert.equal(server.environment?.TRUST_PROXY_HOPS, "1");
assert.equal(
  server.environment?.CORS_ALLOWED_ORIGINS,
  `${expectedHttpOrigin},${expectedLegacyOrigin}`,
);
assert.equal(web.build?.args?.VITE_SERVER_HTTP_URL, expectedHttpOrigin);
assert.equal(web.build?.args?.VITE_SERVER_URL, "ws://imac.tajuren.cn");

const publishedPorts = (web.ports ?? [])
  .map((entry) => String(typeof entry === "object" ? entry.published : entry).split(":")[0])
  .sort();
assert.deepEqual(publishedPorts, ["3000", "80"], "web must publish only ports 80 and 3000");

console.log(JSON.stringify({
  ok: true,
  browserOrigin: expectedHttpOrigin,
  legacyOrigin: expectedLegacyOrigin,
  serverHostPorts: [],
  webHostPorts: publishedPorts,
}));

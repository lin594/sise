import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const directory = process.argv[2] || "release";
const sourceSHA = process.env.SOURCE_SHA;
assert.match(sourceSHA ?? "", /^[0-9a-f]{40}$/);
assert.equal(process.env.VITE_SERVER_URL, "wss://api.sise.tajuren.cn");
assert.equal(process.env.VITE_SERVER_HTTP_URL, "https://api.sise.tajuren.cn");
assert.equal(process.env.VITE_SERVER_SAME_ORIGIN, "0");
const images = {};
for (const service of ["server", "web"]) {
  const raw = await readFile(join(directory, `${service}-manifest.json`));
  const manifest = JSON.parse(raw);
  const config = JSON.parse(await readFile(join(directory, `${service}-config.json`), "utf8"));
  const digest = process.env[`${service.toUpperCase()}_DIGEST`];
  // Buildx may append one display newline to the original registry bytes.
  const hash = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  assert.ok(hash(raw) === digest || (raw.at(-1) === 10 && hash(raw.subarray(0, -1)) === digest), `${service} registry digest`);
  assert.match(manifest.config?.digest ?? "", /^sha256:[0-9a-f]{64}$/);
  assert.equal(config.os, "linux");
  assert.equal(config.architecture, "amd64");
  assert.equal(config.config?.Labels?.["org.opencontainers.image.revision"], sourceSHA);
  images[service] = {
    image: `ghcr.io/lin594/sise-${service}`,
    tag: `sha-${sourceSHA}`,
    digest,
    configDigest: manifest.config.digest,
    platform: "linux/amd64",
    revision: sourceSHA,
  };
}
const recoverySource = await readFile("server/src/rooms/room-recovery.ts", "utf8");
const schemaVersion = Number(recoverySource.match(/export const ROOM_RECOVERY_VERSION = (\d+);/)?.[1]);
assert.ok(Number.isSafeInteger(schemaVersion) && schemaVersion > 0, "room recovery schema is explicit");
const compatibility = JSON.parse(await readFile("release-compatibility.json", "utf8"));
assert.equal(compatibility.serverSourceTree, execFileSync("git", ["rev-parse", `${sourceSHA}:server/src`], { encoding: "utf8" }).trim(), "Changed server source requires new recovery compatibility evidence");
assert.equal(compatibility.schemaVersion, schemaVersion);
assert.equal(compatibility.redisSchemaVersion, 1);
assert.ok(compatibility.testedSourceSHAs.every(sha => /^[0-9a-f]{40}$/.test(sha)));
assert.ok(compatibility.testedImageIDs.every(digest => /^sha256:[0-9a-f]{64}$/.test(digest)));
const release = {
  schemaVersion: 1,
  repository: "lin594/sise",
  sourceSHA,
  branch: "main",
  platform: "linux/amd64",
  workflowRunId: process.env.GITHUB_RUN_ID,
  ciRunId: process.env.CI_RUN_ID,
  createdAt: new Date().toISOString(),
  build: {
    NODE_IMAGE: process.env.NODE_IMAGE,
    NGINX_IMAGE: process.env.NGINX_IMAGE,
    NPM_CONFIG_REGISTRY: "https://registry.npmjs.org",
    web: {
      VITE_SERVER_URL: process.env.VITE_SERVER_URL,
      VITE_SERVER_HTTP_URL: process.env.VITE_SERVER_HTTP_URL,
      VITE_SERVER_SAME_ORIGIN: process.env.VITE_SERVER_SAME_ORIGIN,
    },
  },
  // Compatibility applies only to the tested source/image pairs and frozen server tree.
  // Version numbers alone do not establish cross-release rollback safety.
  recovery: {
    schemaVersion, redisSchemaVersion: 1, compatibility: "tested-source-pair",
    testedSourceSHAs: [...new Set([...compatibility.testedSourceSHAs, sourceSHA])],
    testedImageIDs: compatibility.testedImageIDs,
    rollbackSafe: true,
  },
  images,
};
await writeFile(join(directory, "release-manifest.json"), `${JSON.stringify(release, null, 2)}\n`);

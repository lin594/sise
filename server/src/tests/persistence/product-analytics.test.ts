import assert from "node:assert/strict";
import test from "node:test";
import { anonymizeEvent, dayNumber, DAY_MS, validateProductEvent } from "../../analytics/events.js";
import { ProductAnalytics } from "../../analytics/runtime.js";
import { summarizeMetrics } from "../../analytics/report.js";
import { RedisProductEventStore, ANALYTICS_PREFIX } from "../../analytics/redis-store.js";
import { createClient } from "redis";
const secret = "test-analytics-secret-not-a-game-token";
const token = `gp_${"a".repeat(48)}`;
const event = (name = "app_open", id = "test") => anonymizeEvent({ name, id }, token, secret, "server")!;

test("analytics rejects sensitive and arbitrary input rather than copying it", () => {
  for (const field of ["token", "nickname", "privateHand", "roomToken", "ip", "url", "error"]) {
    assert.equal(validateProductEvent({ name: "app_open", id: "x", [field]: "private" }, "client"), false);
  }
  assert.equal(validateProductEvent({ name: "round_complete", id: "x" }, "client"), false);
  assert.equal(validateProductEvent({ name: "app_open", id: "x", humans: 4 }, "client"), false);
  assert.equal(validateProductEvent({ name: "practice_start", id: "x", durationMs: Infinity }, "client"), false);
  const serialized = JSON.stringify(event());
  assert.equal(serialized.includes(token), false);
  assert.equal(serialized.includes("test-analytics-secret"), false);
  assert.equal(event().actor.length, 64);
  assert.notEqual(event().actor, anonymizeEvent({ name: "app_open", id: "test" }, token, secret + "other", "server")!.actor);
});
test("failed and saturated stores never throw into gameplay or retain raw credentials", async () => {
  let release!: () => void;
  const captured: unknown[] = [];
  const analytics = new ProductAnalytics({ record: async e => { captured.push(e); await new Promise<void>(resolve => { release = resolve; }); throw Error("down"); } }, secret, 2);
  for (let i = 0; i < 10; i++) assert.doesNotThrow(() => analytics.emit({ name: "app_open", id: String(i) }, token));
  assert.equal(analytics.status().queued, 2);
  assert.equal(analytics.status().dropped, 7);
  assert.equal(JSON.stringify(captured).includes(token), false);
  await analytics.close(); release();
});
test("retention excludes immature calendar cohorts and empty metrics stay unknown", () => {
  const now = Date.UTC(2026, 8, 10, 4);
  const today = dayNumber(now);
  const report = summarizeMetrics([
    { day: today - 8, counts: { retention_eligible: "10", return1: "5", return7: "3" } },
    { day: today - 1, counts: { retention_eligible: "20", return1: "9" } },
  ], now);
  assert.deepEqual(report.d7, { numerator: 3, denominator: 10, rate: .3 });
  assert.deepEqual(report.d1, { numerator: 5, denominator: 10, rate: .5 });
  assert.equal(report.firstRoundActivation.rate, null);
  assert.equal(dayNumber(Date.UTC(2026, 8, 9, 16)), today);
});

const redisUrl = process.env.ANALYTICS_TEST_REDIS_URL;
test("real Redis atomically dedupes events, attributes invite reorder, preserves TTL and isolates data", { skip: !redisUrl }, async () => {
  const client = createClient({ url: redisUrl });
  client.on("error", () => {});
  await client.connect();
  const stores = [new RedisProductEventStore(redisUrl!), new RedisProductEventStore(redisUrl!)];
  try {
    for await (const keys of client.scanIterator({ MATCH: `${ANALYTICS_PREFIX}*` })) if (keys.length) await client.unlink(keys);
    const opening = event();
    await Promise.all(stores.map(store => store.record(opening)));
    const daily = `${ANALYTICS_PREFIX}day:${dayNumber(opening.at)}`;
    assert.equal(await client.hGet(daily, "events:server:app_open:unknown:started"), "1");
    const actorKey = `${ANALYTICS_PREFIX}actor:${opening.actor}`;
    const ttl = await client.pTTL(actorKey);
    assert.ok(ttl > 29 * DAY_MS && ttl <= 30 * DAY_MS);
    assert.ok(await client.pTTL(daily) > 89 * DAY_MS);
    const invite = (name: string) => anonymizeEvent({ name, id: name, visitId: "shared_visit", mode: "friends" }, token, secret, "server")!;
    await stores[0].record(invite("invite_join_success"));
    await stores[0].record(invite("invite_open"));
    assert.equal(await client.hGet(daily, "invite_opened"), "1");
    assert.equal(await client.hGet(daily, "invite_joined"), "1");
    const round = (name: string, visitId: string) => anonymizeEvent({ name, id: visitId, visitId, mode: "practice" }, token, secret, "server")!;
    await stores[0].record(round("round_start", "r1"));
    await stores[0].record(round("round_complete", "r1"));
    await stores[0].record(round("round_complete", "r1"));
    await stores[0].record(round("round_start", "r2"));
    assert.equal(await client.hGet(daily, "first_completed"), "1");
    assert.equal(await client.hGet(daily, "replay_started"), "1");
    assert.ok(await client.pTTL(actorKey) <= ttl, "ordinary events cannot extend actor retention");
    for await (const keys of client.scanIterator({ MATCH: `${ANALYTICS_PREFIX}*` })) {
      for (const key of keys) {
        assert.equal(key.includes(token), false);
        const type = await client.type(key);
        const serialized = type === "hash" ? JSON.stringify(await client.hGetAll(key)) : await client.get(key);
        assert.equal(serialized?.includes(token), false);
        assert.equal(serialized?.includes("nickname"), false);
      }
    }
    await client.pExpire(actorKey, 1);
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(await client.exists(actorKey), 0);
  } finally {
    await Promise.all(stores.map(store => store.close()));
    for await (const keys of client.scanIterator({ MATCH: `${ANALYTICS_PREFIX}*` })) if (keys.length) await client.unlink(keys);
    client.destroy();
  }
});

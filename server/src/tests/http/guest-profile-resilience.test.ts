import assert from "node:assert/strict";
import test from "node:test";
import {
  InMemoryGuestProfileStore,
  type GuestProfile,
  type GuestProfileRoundRecord,
  type GuestProfileStore,
} from "../../profiles/guest-profile-store.js";
import { RecoveringGuestProfileStore } from "../../profiles/redis-guest-profile-store.js";

const TOKEN = `gp_${"c".repeat(48)}`;

class ControllableGuestProfileStore implements GuestProfileStore {
  readonly inner: InMemoryGuestProfileStore;
  available = true;
  connectCalls = 0;
  operationCalls = 0;
  failAfterNextRoundWrite = false;

  constructor(now: () => number) {
    this.inner = new InMemoryGuestProfileStore(now);
  }

  async connect(): Promise<void> {
    this.connectCalls += 1;
    this.requireAvailable();
  }

  async getOrCreate(token: string): Promise<GuestProfile> {
    this.operationCalls += 1;
    this.requireAvailable();
    return this.inner.getOrCreate(token);
  }

  async updateName(token: string, nickname: string): Promise<GuestProfile> {
    this.operationCalls += 1;
    this.requireAvailable();
    return this.inner.updateName(token, nickname);
  }

  async recordRound(record: GuestProfileRoundRecord): Promise<GuestProfile> {
    this.operationCalls += 1;
    this.requireAvailable();
    const updated = await this.inner.recordRound(record);
    if (this.failAfterNextRoundWrite) {
      this.failAfterNextRoundWrite = false;
      throw new Error("response lost after Redis committed the event");
    }
    return updated;
  }

  private requireAvailable(): void {
    if (!this.available) {
      throw new Error("Redis temporarily unavailable");
    }
  }
}

test("temporary Redis failure serves the mirror and replays unique mutations after recovery", async () => {
  let now = 10_000;
  const warnings: string[] = [];
  const primary = new ControllableGuestProfileStore(() => now);
  const store = new RecoveringGuestProfileStore(primary, {
    now: () => now,
    retryDelayMs: 1_000,
    warn: (message) => warnings.push(message),
  });

  await store.updateName(TOKEN, "原昵称");
  await store.recordRound({ token: TOKEN, eventId: "room-a:1", won: true, score: 6 });

  primary.available = false;
  now += 100;
  const renamedOffline = await store.updateName(TOKEN, "恢复牌友");
  assert.equal(renamedOffline.nickname, "恢复牌友");

  now += 100;
  const firstOfflineRound = await store.recordRound({
    token: TOKEN,
    eventId: "room-b:1",
    won: false,
    score: -2,
  });
  const duplicateOfflineRound = await store.recordRound({
    token: TOKEN,
    eventId: "room-b:1",
    won: false,
    score: -2,
  });
  assert.equal(firstOfflineRound.roundsPlayed, 2);
  assert.deepEqual(duplicateOfflineRound, firstOfflineRound);

  const callsAfterFailure = primary.operationCalls;
  now += 500;
  assert.equal((await store.getOrCreate(TOKEN)).nickname, "恢复牌友");
  assert.equal(primary.operationCalls, callsAfterFailure, "the retry cooldown must avoid a Redis request storm");

  primary.available = true;
  now += 1_000;
  const recovered = await store.getOrCreate(TOKEN);
  assert.equal(recovered.nickname, "恢复牌友");
  assert.equal(recovered.roundsPlayed, 2);
  assert.equal(recovered.huWins, 1);
  assert.equal(recovered.totalScore, 4);

  const authoritative = await primary.inner.getOrCreate(TOKEN);
  assert.deepEqual(authoritative, recovered);
  assert.equal(warnings.filter((message) => message.includes("暂不可用")).length, 1);
  assert.equal(warnings.filter((message) => message.includes("已恢复")).length, 1);
});

test("a round committed before a lost response is not counted twice when replayed", async () => {
  let now = 20_000;
  const primary = new ControllableGuestProfileStore(() => now);
  const store = new RecoveringGuestProfileStore(primary, {
    now: () => now,
    retryDelayMs: 500,
    warn: () => undefined,
  });

  primary.failAfterNextRoundWrite = true;
  const mirrored = await store.recordRound({
    token: TOKEN,
    eventId: "room-response-lost:1",
    won: true,
    score: 18,
  });
  assert.equal(mirrored.roundsPlayed, 1);
  assert.equal(mirrored.totalScore, 18);

  now += 600;
  const recovered = await store.getOrCreate(TOKEN);
  assert.equal(recovered.roundsPlayed, 1);
  assert.equal(recovered.huWins, 1);
  assert.equal(recovered.totalScore, 18);
});

test("an initial connection failure can recover without restarting the service", async () => {
  let now = 30_000;
  const primary = new ControllableGuestProfileStore(() => now);
  primary.available = false;
  const store = new RecoveringGuestProfileStore(primary, {
    now: () => now,
    retryDelayMs: 750,
    warn: () => undefined,
  });

  await store.initialize();
  assert.equal(primary.connectCalls, 1);
  assert.equal((await store.updateName(TOKEN, "启动降级牌友")).nickname, "启动降级牌友");
  assert.equal(primary.operationCalls, 0, "the startup cooldown should serve memory immediately");

  primary.available = true;
  now += 800;
  const recovered = await store.getOrCreate(TOKEN);
  assert.equal(recovered.nickname, "启动降级牌友");
  assert.equal((await primary.inner.getOrCreate(TOKEN)).nickname, "启动降级牌友");
});


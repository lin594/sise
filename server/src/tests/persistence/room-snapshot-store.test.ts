import test from "node:test";
import assert from "node:assert/strict";
import {
  InMemoryRoomSnapshotStore,
  NoopRoomSnapshotStore,
  RedisRoomSnapshotStore,
} from "../../persistence/room-snapshot-store.js";
import {
  ROOM_RECOVERY_VERSION,
  type RoomRecoverySnapshot,
} from "../../rooms/room-recovery.js";

function snapshot(roomId: string, savedAt: number, expiresAt = savedAt + 60_000): RoomRecoverySnapshot {
  return {
    version: ROOM_RECOVERY_VERSION,
    roomId,
    savedAt,
    expiresAt,
    state: { phase: "waiting", roomMode: "practice", players: {} },
    privateState: {
      roomIdleExpiresAt: 0,
      deck: [],
      playerHands: [],
      playerOrder: [],
      botIds: [],
      configuredBotIds: [],
      seatByToken: [],
      baseNameBySeat: [],
      profileTokenBySeat: [],
      hostKey: "",
      hostKeyConsumed: false,
      pendingResponse: null,
      publicGeneralPool: [],
      dealerCard: null,
      dealerPickerId: null,
      nextRoundSetup: null,
      awaitingDiscardOwnerId: null,
      pendingFishDeclarations: [],
      declareTimeExtensionUsedBy: [],
      responseTimeExtensionUsed: false,
      declareTimerTotalMs: 0,
      responseTimerTotalMs: 0,
      declareDecisionWindowId: 0,
      responseDecisionWindowId: 0,
      collectiveQueue: [],
      collectiveCursor: 0,
      collectiveResponderId: null,
      debugSeq: 0,
      roundDealerId: null,
      lastRoundResult: null,
    },
  };
}

test("in-memory snapshot store keeps only the latest valid room snapshot", async () => {
  let now = 1_000;
  const store = new InMemoryRoomSnapshotStore(() => now);
  await store.save(snapshot("room-a", 900));
  await store.save(snapshot("room-a", 1_000));
  await store.save(snapshot("room-b", 950));

  assert.deepEqual(
    (await store.loadAll()).map((item) => [item.roomId, item.savedAt]),
    [["room-a", 1_000], ["room-b", 950]],
  );

  now = 62_000;
  assert.deepEqual(await store.loadAll(), []);
});

test("snapshot removal and disabled storage are idempotent", async () => {
  const store = new InMemoryRoomSnapshotStore(() => 1_000);
  await store.save(snapshot("room-a", 1_000));
  await store.remove("room-a");
  await store.remove("room-a");
  assert.deepEqual(await store.loadAll(), []);

  const disabled = new NoopRoomSnapshotStore();
  await disabled.save(snapshot("room-disabled", 1_000));
  await disabled.remove("room-disabled");
  assert.deepEqual(await disabled.loadAll(), []);
});

class FakeRedisClient {
  isReady = true;
  isOpen = true;
  readonly strings = new Map<string, string>();
  readonly sets = new Map<string, Set<string>>();

  async connect() {}
  async disconnect() {
    this.isReady = false;
    this.isOpen = false;
  }
  async quit() {
    this.isReady = false;
    this.isOpen = false;
  }
  async get(key: string) {
    return this.strings.get(key) ?? null;
  }
  async sMembers(key: string) {
    return [...(this.sets.get(key) ?? [])];
  }
  async sRem(key: string, member: string) {
    return this.sets.get(key)?.delete(member) ? 1 : 0;
  }
  multi() {
    const operations: Array<() => void> = [];
    const chain = {
      set: (key: string, value: string) => {
        operations.push(() => this.strings.set(key, value));
        return chain;
      },
      sAdd: (key: string, member: string) => {
        operations.push(() => {
          const values = this.sets.get(key) ?? new Set<string>();
          values.add(member);
          this.sets.set(key, values);
        });
        return chain;
      },
      del: (key: string) => {
        operations.push(() => this.strings.delete(key));
        return chain;
      },
      sRem: (key: string, member: string) => {
        operations.push(() => this.sets.get(key)?.delete(member));
        return chain;
      },
      exec: async () => {
        operations.forEach((operation) => operation());
        return [];
      },
    };
    return chain;
  }
}

test("Redis snapshot loading removes corrupt, incompatible, missing and expired records", async () => {
  const client = new FakeRedisClient();
  const store = new RedisRoomSnapshotStore(client as never, () => 1_000);
  await store.save(snapshot("room-good", 1_000));

  const indexKey = "sise:room-snapshots:v1";
  const valueKey = (roomId: string) => `sise:room-snapshot:v1:${roomId}`;
  const index = client.sets.get(indexKey) ?? new Set<string>();
  for (const roomId of ["room-corrupt", "room-version", "room-expired", "room-missing"]) {
    index.add(roomId);
  }
  client.sets.set(indexKey, index);
  client.strings.set(valueKey("room-corrupt"), "not-json");
  client.strings.set(valueKey("room-version"), JSON.stringify({
    ...snapshot("room-version", 1_000),
    version: ROOM_RECOVERY_VERSION - 1,
  }));
  client.strings.set(valueKey("room-expired"), JSON.stringify(snapshot("room-expired", 0, 500)));

  assert.deepEqual((await store.loadAll()).map((item) => item.roomId), ["room-good"]);
  assert.deepEqual(client.sets.get(indexKey), new Set(["room-good"]));
  assert.equal(client.strings.has(valueKey("room-corrupt")), false);
  assert.equal(client.strings.has(valueKey("room-version")), false);
  assert.equal(client.strings.has(valueKey("room-expired")), false);
  await store.close();
});

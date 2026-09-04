import test from "node:test";
import assert from "node:assert/strict";
import { RoomSnapshotRuntime } from "../../persistence/room-snapshot-runtime.js";
import type { RoomSnapshotStore } from "../../persistence/room-snapshot-store.js";
import { ROOM_RECOVERY_VERSION, type RoomRecoverySnapshot } from "../../rooms/room-recovery.js";

function snapshot(roomId: string, savedAt: number): RoomRecoverySnapshot {
  return {
    version: ROOM_RECOVERY_VERSION,
    roomId,
    savedAt,
    expiresAt: savedAt + 60_000,
    state: { phase: "waiting", roomMode: "practice", players: {} },
    privateState: {
      deck: [], playerHands: [], playerOrder: [], botIds: [], configuredBotIds: [], seatByToken: [],
      baseNameBySeat: [], profileTokenBySeat: [], hostKey: "", hostKeyConsumed: false, pendingResponse: null,
      publicGeneralPool: [], dealerCard: null, dealerPickerId: null, nextRoundSetup: null,
      awaitingDiscardOwnerId: null, pendingFishDeclarations: [], declareTimeExtensionUsedBy: [],
      responseTimeExtensionUsed: false, declareTimerTotalMs: 0, responseTimerTotalMs: 0,
      declareDecisionWindowId: 0, responseDecisionWindowId: 0, collectiveQueue: [], collectiveCursor: 0,
      collectiveResponderId: null, debugSeq: 0, roundDealerId: null, lastRoundResult: null,
    },
  };
}

class RecordingStore implements RoomSnapshotStore {
  saved: RoomRecoverySnapshot[] = [];
  removed: string[] = [];
  closed = false;

  async loadAll() { return []; }
  async save(value: RoomRecoverySnapshot) { this.saved.push(value); }
  async remove(roomId: string) { this.removed.push(roomId); }
  async close() { this.closed = true; }
}

test("runtime coalesces room writes and flushes the latest snapshot", async () => {
  const store = new RecordingStore();
  const runtime = new RoomSnapshotRuntime(store, { debounceMs: 60_000 });
  runtime.schedule(snapshot("room-a", 1_000));
  runtime.schedule(snapshot("room-a", 2_000));

  await runtime.flushAll();

  assert.deepEqual(store.saved.map((item) => [item.roomId, item.savedAt]), [["room-a", 2_000]]);
});

test("normal disposal deletes while shutdown preserves and force-flushes", async () => {
  const store = new RecordingStore();
  const runtime = new RoomSnapshotRuntime(store, { debounceMs: 60_000 });
  runtime.schedule(snapshot("normal-room", 1_000));
  await runtime.remove("normal-room");
  assert.deepEqual(store.removed, ["normal-room"]);
  assert.equal(store.saved.length, 0);

  await runtime.beginShutdown([snapshot("active-room", 3_000)]);
  await runtime.remove("active-room");
  runtime.schedule(snapshot("ignored-room", 4_000));
  await runtime.flushAll();

  assert.deepEqual(store.saved.map((item) => item.roomId), ["active-room"]);
  assert.deepEqual(store.removed, ["normal-room"]);
});

test("runtime reports write failures without rejecting the game mutation", async () => {
  const warnings: string[] = [];
  const store: RoomSnapshotStore = {
    loadAll: async () => [],
    save: async () => { throw new Error("secret redis detail"); },
    remove: async () => undefined,
    close: async () => undefined,
  };
  const runtime = new RoomSnapshotRuntime(store, { debounceMs: 60_000, warn: (message) => warnings.push(message) });
  runtime.schedule(snapshot("room-a", 1_000));

  await runtime.flushAll();

  assert.deepEqual(warnings, ["牌局快照暂时无法写入；游戏继续运行，后续状态变化会再次尝试。"]);
});

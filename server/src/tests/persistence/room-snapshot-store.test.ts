import test from "node:test";
import assert from "node:assert/strict";
import {
  InMemoryRoomSnapshotStore,
  NoopRoomSnapshotStore,
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


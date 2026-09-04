import test from "node:test";
import assert from "node:assert/strict";
import { matchMaker } from "@colyseus/core";
import { FourColorGameRoom } from "../../rooms/GameRoom.js";
import { CardSchema, PlayerState } from "../../schema/game-state.schema.js";
import { ROOM_RECOVERY_VERSION } from "../../rooms/room-recovery.js";

function schemaCard(id: string, color: string, type: string, source: "upper" | "draw" = "upper") {
  const card = new CardSchema();
  card.id = id;
  card.color = color;
  card.type = type;
  card.source = source;
  return card;
}

function createRecoverableRoom(roomMode: "practice" | "friends" = "friends") {
  const room = new FourColorGameRoom() as any;
  room.roomId = "room-recovery-1";
  room.onCreate({ roomMode, hostKey: "private-host-key" });
  room.clearRoomIdleTimer();

  const human = new PlayerState();
  human.clientId = "seat_0";
  human.seatIndex = 0;
  human.name = "张阿姨";
  human.connected = true;
  human.cumulativeScore = 12;
  human.exposedArea.push(schemaCard("exposed-1", "green", "shi"));
  human.exposedGroupSizes.push(3);
  human.exposedGroupKinds.push("chi");

  const bot = new PlayerState();
  bot.clientId = "seat_1";
  bot.seatIndex = 1;
  bot.name = "常乐";
  bot.isBot = true;
  bot.isConfiguredBot = true;
  bot.connected = false;

  room.state.players.set("seat_0", human);
  room.state.players.set("seat_1", bot);
  room.state.phase = "playing";
  room.state.hostPlayerId = "seat_0";
  room.state.dealerId = "seat_0";
  room.state.currentPlayerId = "seat_0";
  room.state.currentTurnPlayerId = "seat_0";
  room.state.previousPlayerId = "seat_1";
  room.state.pollOriginPlayerId = "seat_0";
  room.state.activeResponderId = "seat_0";
  room.state.responsePhase = "local_draw";
  room.state.lastAction = "seat_0 DRAW";
  room.state.publicDiscardPile.push(schemaCard("discard-1", "red", "che"));

  room.playerOrder = ["seat_0", "seat_1"];
  room.playerHands = new Map([
    ["seat_0", [
      { id: "hand-1", color: "green", type: "xiang", source: "upper" },
      { id: "hand-2", color: "yellow", type: "pao", source: "upper" },
    ]],
    ["seat_1", [{ id: "bot-hand-1", color: "white", type: "ma", source: "upper" }]],
  ]);
  room.deck = [
    { id: "deck-1", color: "red", type: "zu", source: "upper" },
    { id: "deck-2", color: "green", type: "jiang", source: "upper" },
  ];
  room.botIds = new Set(["seat_1"]);
  room.configuredBotIds = new Set(["seat_1"]);
  room.seatBySession = new Map([["old-session", "seat_0"]]);
  room.seatByToken = new Map([["room-token", "seat_0"]]);
  room.baseNameBySeat = new Map([["seat_0", "张阿姨"]]);
  room.profileTokenBySeat = new Map([["seat_0", "gp_" + "a".repeat(48)]]);
  room.publicGeneralPool = [{ id: "general-1", color: "red", type: "gong", source: "draw" }];
  room.dealerCard = { id: "dealer-1", color: "green", type: "shi", source: "upper" };
  room.dealerPickerId = "seat_1";
  room.awaitingDiscardOwnerId = "seat_0";
  room.pendingResponse = {
    ownerId: "seat_0",
    card: { id: "draw-1", color: "green", type: "jiang", source: "draw" },
    collectives: new Map([["seat_1", { action: "pass" }]]),
    responsePhaseAfterNoResponse: "local_draw",
  };
  room.collectiveQueue = ["seat_1", "seat_0"];
  room.collectiveCursor = 1;
  room.collectiveResponderId = "seat_0";
  room.state.deckCount = room.deck.length;
  room.updatePublicHandCounts();
  return room;
}

test("active room recovery preserves authoritative and private state", () => {
  const source = createRecoverableRoom();
  const snapshot = source.exportRecoverySnapshot(10_000);
  source.onDispose();

  const restored = new FourColorGameRoom() as any;
  restored.roomId = "temporary-id";
  restored.onCreate({ recoverySnapshot: snapshot });
  restored.clearRoomIdleTimer();

  assert.equal(snapshot.version, ROOM_RECOVERY_VERSION);
  assert.equal(restored.roomId, "room-recovery-1");
  assert.equal(restored.state.phase, "playing");
  assert.equal(restored.state.lastAction, "seat_0 DRAW");
  assert.equal(restored.state.hostPlayerId, "seat_0");
  assert.equal(restored.state.dealerId, "seat_0");
  assert.equal(restored.state.currentTurnPlayerId, "seat_0");
  assert.equal(restored.state.deckCount, 2);
  assert.deepEqual(
    [...restored.state.publicDiscardPile].map((card: CardSchema) => card.id),
    ["discard-1"],
  );
  assert.equal(restored.state.players.get("seat_0")?.cumulativeScore, 12);
  assert.deepEqual(
    [...(restored.state.players.get("seat_0")?.exposedArea ?? [])].map((card: CardSchema) => card.id),
    ["exposed-1"],
  );
  assert.deepEqual(
    [...(restored.state.players.get("seat_0")?.exposedGroupSizes ?? [])],
    [3],
  );
  assert.deepEqual(
    [...(restored.state.players.get("seat_0")?.exposedGroupKinds ?? [])],
    ["chi"],
  );
  assert.deepEqual(restored.playerOrder, ["seat_0", "seat_1"]);
  assert.deepEqual(restored.playerHands.get("seat_0"), source.playerHands.get("seat_0"));
  assert.deepEqual(restored.playerHands.get("seat_1"), source.playerHands.get("seat_1"));
  assert.deepEqual(restored.deck, source.deck);
  assert.equal(restored.pendingResponse.card.id, "draw-1");
  assert.deepEqual([...restored.pendingResponse.collectives], [["seat_1", { action: "pass" }]]);
  assert.equal(restored.awaitingDiscardOwnerId, "seat_0");
  assert.equal(restored.state.players.get("seat_0").connected, false);
  assert.equal(restored.state.players.get("seat_0").isBot, false);
  assert.equal(restored.botIds.has("seat_1"), true);
  assert.equal(restored.seatBySession.size, 0);

  const privateState = restored.getPrivateStateByToken("room-token");
  assert.equal(privateState?.roomId, "room-recovery-1");
  assert.deepEqual(privateState?.privateHand.map((card: any) => card.id), ["hand-1", "hand-2"]);
  restored.onDispose();
});

test("incompatible or incomplete recovery snapshots fail before replacing room identity", () => {
  const source = createRecoverableRoom();
  const snapshot = source.exportRecoverySnapshot(10_000);
  source.onDispose();

  for (const invalid of [
    { ...snapshot, version: ROOM_RECOVERY_VERSION + 1 },
    { ...snapshot, privateState: { ...snapshot.privateState, playerHands: undefined } },
  ]) {
    const room = new FourColorGameRoom() as any;
    room.roomId = "temporary-id";
    assert.throws(() => room.onCreate({ recoverySnapshot: invalid }), /room recovery snapshot/i);
    assert.equal(room.roomId, "temporary-id");
  }
});

test("reclaiming a recovered practice decision restores the human's untimed turn", () => {
  const source = createRecoverableRoom("practice");
  const snapshot = source.exportRecoverySnapshot(10_000);
  source.onDispose();

  const restored = new FourColorGameRoom() as any;
  restored.roomId = "temporary-id";
  restored.onCreate({ recoverySnapshot: snapshot });
  restored.clearRoomIdleTimer();
  assert.ok(restored.state.responseEndsAt > 0, "offline recovery must keep the game moving");

  const messages: Array<[string, unknown]> = [];
  const client = {
    sessionId: "new-session",
    send: (type: string, payload: unknown) => messages.push([type, payload]),
    leave: () => undefined,
  };
  restored.reclaimSeat(client, "seat_0", "room-token", "张阿姨");

  assert.equal(restored.state.players.get("seat_0").connected, true);
  assert.equal(restored.seatBySession.get("new-session"), "seat_0");
  assert.equal(restored.state.responseEndsAt, 0);
  assert.equal(restored.responseTimerTotalMs, 0);
  assert.equal(restored.collectiveTimer, null);
  assert.equal(messages.some(([type]) => type === "session_token"), true);
  restored.onDispose();
});

test("MatchMaker indexes a recovered room under its original room id", async () => {
  const source = createRecoverableRoom();
  const snapshot = source.exportRecoverySnapshot(10_000);
  source.onDispose();

  await matchMaker.setup();
  matchMaker.defineRoomType("four-color-recovery-test", FourColorGameRoom);
  const listing = await matchMaker.createRoom("four-color-recovery-test", {
    recoverySnapshot: snapshot,
  });
  const restored = matchMaker.getLocalRoomById(snapshot.roomId) as FourColorGameRoom | undefined;

  assert.equal(listing.roomId, snapshot.roomId);
  assert.equal(restored?.roomId, snapshot.roomId);
  assert.equal((await matchMaker.getRoomById(snapshot.roomId)).roomId, snapshot.roomId);
  assert.equal(restored?.getPrivateStateByToken("room-token")?.seatId, "seat_0");

  await restored?.disconnect();
});

test("an already empty room keeps its original idle expiry across repeated restarts", () => {
  const source = createRecoverableRoom();
  const now = Date.now();
  const originalIdleExpiry = now + 60_000;
  source.seatBySession.clear();
  source.roomIdleExpiresAt = originalIdleExpiry;

  const snapshot = source.exportRecoverySnapshot(now);
  source.onDispose();

  assert.equal(snapshot.expiresAt, originalIdleExpiry);
  assert.equal((snapshot.privateState as any).roomIdleExpiresAt, originalIdleExpiry);

  const restored = new FourColorGameRoom() as any;
  restored.roomId = "temporary-id";
  restored.onCreate({ recoverySnapshot: snapshot });
  assert.equal(restored.roomIdleExpiresAt, originalIdleExpiry);
  assert.equal(restored.exportRecoverySnapshot(now + 10_000).expiresAt, originalIdleExpiry);
  restored.onDispose();
});

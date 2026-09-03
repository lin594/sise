import test from "node:test";
import assert from "node:assert/strict";
import { FourColorGameRoom } from "../../rooms/GameRoom.js";
import { GameState, PlayerState } from "../../schema/game-state.schema.js";

function createActiveHumanRoom(graceMs: number) {
  const room = new FourColorGameRoom() as any;
  room.state = new GameState();
  room.state.phase = "playing";
  room.state.hostPlayerId = "seat_0";
  room.playerOrder = ["seat_0"];
  room.playerHands = new Map([["seat_0", []]]);
  room.seatBySession = new Map([["old-session", "seat_0"]]);
  room.seatByToken = new Map([["token", "seat_0"]]);
  room.pendingNameBySession = new Map();
  room.pendingTokenBySession = new Map();
  room.baseNameBySeat = new Map([["seat_0", "张阿姨"]]);
  room.botIds = new Set();
  room.configuredBotIds = new Set();
  room.takeoverTimers = new Map();
  room.seatDisconnectTimers = new Map();
  room.reconnectGraceMs = graceMs;
  room.clients = [];
  room.clearRoomIdleTimer = () => undefined;
  room.scheduleRoomIdleIfEmpty = () => undefined;
  room.syncAllPrivateHands = () => undefined;
  room.broadcastAvailableActions = () => undefined;
  room.tickBots = () => undefined;

  const player = new PlayerState();
  player.clientId = "seat_0";
  player.name = "张阿姨";
  player.connected = true;
  player.isBot = false;
  player.isConfiguredBot = false;
  room.state.players.set("seat_0", player);
  return { room, player };
}

function addSecondOnlineHuman(room: any) {
  const player = new PlayerState();
  player.clientId = "seat_1";
  player.seatIndex = 1;
  player.name = "李叔叔";
  player.connected = true;
  player.isBot = false;
  player.isConfiguredBot = false;
  room.state.players.set("seat_1", player);
  room.playerHands.set("seat_1", []);
  room.playerOrder.push("seat_1");
  room.seatBySession.set("other-session", "seat_1");
  room.seatByToken.set("other-token", "seat_1");
  room.baseNameBySeat.set("seat_1", "李叔叔");
  return player;
}

test("a brief active-game disconnect waits before bot takeover", async () => {
  const { room, player } = createActiveHumanRoom(20);

  room.onLeave({ sessionId: "old-session" });

  assert.equal(player.connected, false);
  assert.equal(player.isBot, false);
  assert.equal(room.botIds.has("seat_0"), false);
  assert.equal(room.state.lastAction, "RECONNECT_WAIT seat_0");

  await new Promise((resolve) => setTimeout(resolve, 35));

  assert.equal(player.isBot, true);
  assert.equal(room.botIds.has("seat_0"), true);
  assert.equal(room.state.lastAction, "TAKEOVER seat_0");
});

test("reconnecting inside the grace window cancels bot takeover", async () => {
  const { room, player } = createActiveHumanRoom(30);
  const sent: Array<{ event: string; payload: unknown }> = [];

  room.onLeave({ sessionId: "old-session" });
  room.onJoin(
    {
      sessionId: "new-session",
      send: (event: string, payload: unknown) => sent.push({ event, payload }),
      leave: () => undefined,
    },
    { name: "换名无效", playerToken: "token" },
  );

  await new Promise((resolve) => setTimeout(resolve, 45));

  assert.equal(player.connected, true);
  assert.equal(player.isBot, false);
  assert.equal(player.name, "张阿姨");
  assert.equal(room.botIds.has("seat_0"), false);
  assert.equal(room.seatBySession.get("new-session"), "seat_0");
  assert.equal(sent.some((message) => message.event === "session_token"), true);
  assert.equal(room.state.hostPlayerId, "seat_0");
});

test("a dropped host keeps authority throughout the reconnect grace period", async () => {
  const { room, player } = createActiveHumanRoom(30);
  addSecondOnlineHuman(room);

  room.onLeave({ sessionId: "old-session" }, 1006);

  assert.equal(player.isBot, false);
  assert.equal(room.state.hostPlayerId, "seat_0");

  room.onJoin(
    {
      sessionId: "new-session",
      send: () => undefined,
      leave: () => undefined,
    },
    { name: "张阿姨", playerToken: "token" },
  );
  await new Promise((resolve) => setTimeout(resolve, 45));

  assert.equal(player.connected, true);
  assert.equal(player.isBot, false);
  assert.equal(room.state.hostPlayerId, "seat_0");
});

test("an absent host transfers authority when temporary control begins", async () => {
  const { room, player } = createActiveHumanRoom(20);
  addSecondOnlineHuman(room);

  room.onLeave({ sessionId: "old-session" }, 1006);

  assert.equal(room.state.hostPlayerId, "seat_0");
  await new Promise((resolve) => setTimeout(resolve, 35));

  assert.equal(player.isBot, true);
  assert.equal(room.state.hostPlayerId, "seat_1");
});

test("a confirmed active-game exit transfers authority without waiting", () => {
  const { room, player } = createActiveHumanRoom(30);
  addSecondOnlineHuman(room);

  room.onLeave({ sessionId: "old-session" }, 4000);

  assert.equal(player.isBot, true);
  assert.equal(room.botIds.has("seat_0"), true);
  assert.equal(room.state.hostPlayerId, "seat_1");
});

test("a dropped waiting-room host keeps the room until the seat hold expires", async () => {
  const { room } = createActiveHumanRoom(30);
  room.state.phase = "waiting";
  room.lobbySeatHoldMs = 20;
  addSecondOnlineHuman(room);

  room.onLeave({ sessionId: "old-session" }, 1006);

  assert.equal(room.state.players.has("seat_0"), true);
  assert.equal(room.state.hostPlayerId, "seat_0");
  await new Promise((resolve) => setTimeout(resolve, 35));

  assert.equal(room.state.players.has("seat_0"), false);
  assert.equal(room.state.hostPlayerId, "seat_1");
});

test("a confirmed waiting-room exit releases the seat and host role immediately", () => {
  const { room } = createActiveHumanRoom(30);
  room.state.phase = "waiting";
  room.lobbySeatHoldMs = 60_000;
  addSecondOnlineHuman(room);

  room.onLeave({ sessionId: "old-session" }, 4000);

  assert.equal(room.state.players.has("seat_0"), false);
  assert.equal(room.seatByToken.has("token"), false);
  assert.equal(room.state.hostPlayerId, "seat_1");
  assert.equal(room.state.lastAction, "SEAT_LEFT seat_0");
});

test("a replacement connection explicitly retires the previous live session", () => {
  const { room } = createActiveHumanRoom(30);
  const oldMessages: Array<{ event: string; payload: unknown }> = [];
  const oldLeaves: Array<{ code?: number; reason?: string }> = [];
  room.clients = [
    {
      sessionId: "old-session",
      send: (event: string, payload: unknown) => oldMessages.push({ event, payload }),
      leave: (code?: number, reason?: string) => oldLeaves.push({ code, reason }),
    },
  ];

  room.onJoin(
    {
      sessionId: "new-session",
      send: () => undefined,
      leave: () => undefined,
    },
    { name: "张阿姨", playerToken: "token" },
  );

  assert.equal(oldMessages.some((message) => message.event === "session_replaced"), true);
  assert.deepEqual(oldLeaves, [{ code: 4102, reason: "seat replaced by another session" }]);
  assert.equal(room.seatBySession.has("old-session"), false);
  assert.equal(room.seatBySession.get("new-session"), "seat_0");
});

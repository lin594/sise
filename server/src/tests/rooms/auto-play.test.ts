import assert from "node:assert/strict";
import test from "node:test";
import { FourColorGameRoom } from "../../rooms/GameRoom.js";
import { reclaimSeatStateFlow, startDeclaringFlow } from "../../rooms/flow/match-runtime.js";
import { GameState, PlayerState } from "../../schema/game-state.schema.js";

function createRoom() {
  const room = new FourColorGameRoom() as any;
  room.state = new GameState();
  room.state.phase = "playing";
  room.playerOrder = ["seat_0"];
  room.playerHands = new Map([["seat_0", []]]);
  room.seatBySession = new Map([["session-0", "seat_0"]]);
  room.seatByToken = new Map([["token-0", "seat_0"]]);
  room.baseNameBySeat = new Map([["seat_0", "王阿姨"]]);
  room.botIds = new Set<string>();
  room.configuredBotIds = new Set<string>();
  room.clearBotTimer = () => undefined;
  room.clearCollectiveTimer = () => undefined;
  room.broadcastAvailableActions = () => undefined;
  let botTicks = 0;
  room.tickBots = () => {
    botTicks += 1;
  };

  const player = new PlayerState();
  player.clientId = "seat_0";
  player.seatIndex = 0;
  player.name = "王阿姨";
  player.connected = true;
  player.isBot = false;
  room.state.players.set(player.clientId, player);

  const client = {
    sessionId: "session-0",
    send: () => undefined,
  };
  return { room, player, client, botTicks: () => botTicks };
}

test("a connected human can enable and cancel voluntary auto play without becoming a bot identity", () => {
  const { room, player, client, botTicks } = createRoom();

  room.handleSetAutoPlay(client, { enabled: true });

  assert.equal(player.isAutoPlay, true);
  assert.equal(player.isBot, false);
  assert.equal(room.botIds.has("seat_0"), true);
  assert.equal(room.state.lastAction, "AUTOPLAY_ON seat_0");
  assert.equal(botTicks(), 1);

  room.handleSetAutoPlay(client, { enabled: false });

  assert.equal(player.isAutoPlay, false);
  assert.equal(player.isBot, false);
  assert.equal(room.botIds.has("seat_0"), false);
  assert.equal(room.state.lastAction, "AUTOPLAY_OFF seat_0");
  assert.equal(botTicks(), 2);
});

test("configured computers cannot use the voluntary auto play message", () => {
  const { room, player, client, botTicks } = createRoom();
  player.isBot = true;
  player.isConfiguredBot = true;
  room.botIds.add("seat_0");

  room.handleSetAutoPlay(client, { enabled: false });

  assert.equal(player.isAutoPlay, false);
  assert.equal(player.isBot, true);
  assert.equal(room.botIds.has("seat_0"), true);
  assert.equal(botTicks(), 0);
});

test("enabling auto play during the dealer reveal waits for the real declaration window", () => {
  const { room, player, client, botTicks } = createRoom();
  room.state.phase = "declaring";
  room.state.lastAction = "DEALER_CARD seat_0";
  room.state.responseEndsAt = Date.now() + 2_000;
  let declarations = 0;
  room.submitDefaultDeclaration = () => {
    declarations += 1;
  };

  room.handleSetAutoPlay(client, { enabled: true });

  assert.equal(player.isAutoPlay, true);
  assert.equal(room.botIds.has("seat_0"), true);
  assert.equal(room.state.lastAction, "DEALER_CARD seat_0");
  assert.equal(declarations, 0);
  assert.equal(botTicks(), 0);
});

test("reconnecting preserves a player's explicit auto play preference", () => {
  const { room, player } = createRoom();
  player.connected = false;
  player.isBot = true;
  player.isAutoPlay = true;
  room.botIds.clear();

  const reclaimed = reclaimSeatStateFlow(
    {
      state: room.state,
      baseNameBySeat: room.baseNameBySeat,
      botIds: room.botIds,
      seatBySession: room.seatBySession,
      seatByToken: room.seatByToken,
    },
    "new-session",
    "seat_0",
    "token-0",
    "王阿姨",
  );

  assert.equal(reclaimed, true);
  assert.equal(player.connected, true);
  assert.equal(player.isBot, false);
  assert.equal(player.isAutoPlay, true);
  assert.equal(room.botIds.has("seat_0"), true);
});

test("auto play seats submit their declaration immediately", () => {
  const player = new PlayerState();
  player.clientId = "seat_0";
  player.isAutoPlay = true;
  let submitted = false;

  startDeclaringFlow({
    playerOrder: ["seat_0"],
    getPlayer: () => player,
    submitDeclaration: (seatId, force) => {
      submitted = seatId === "seat_0" && force;
      player.declaredReady = true;
    },
    syncAllPrivateHands: () => undefined,
    broadcastAvailableActions: () => undefined,
    allReady: () => player.declaredReady,
    finishDeclaringPhase: () => undefined,
    scheduleDeclareTimeout: () => assert.fail("auto play must not wait for declaration timeout"),
  });

  assert.equal(submitted, true);
});

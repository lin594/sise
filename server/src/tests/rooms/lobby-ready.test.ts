import assert from "node:assert/strict";
import test from "node:test";
import { FourColorGameRoom } from "../../rooms/GameRoom.js";
import { resetToLobby } from "../../rooms/flow/match-runtime.js";
import { GameState, PlayerState } from "../../schema/game-state.schema.js";

type FakeClient = {
  sessionId: string;
  send: (event: string, payload: unknown) => void;
};

function createReadyRoom() {
  const room = new FourColorGameRoom() as any;
  room.state = new GameState();
  room.state.roomMode = "friends";
  room.state.phase = "waiting";
  room.state.hostPlayerId = "seat_0";
  room.playerOrder = ["seat_0", "seat_1", "seat_2", "seat_3"];
  room.playerHands = new Map(room.playerOrder.map((seatId: string) => [seatId, []]));
  room.botIds = new Set(["seat_2", "seat_3"]);
  room.configuredBotIds = new Set(["seat_2", "seat_3"]);
  room.seatBySession = new Map([
    ["host-session", "seat_0"],
    ["guest-session", "seat_1"],
  ]);
  room.seatByToken = new Map(room.playerOrder.map((seatId: string) => [`token-${seatId}`, seatId]));
  room.baseNameBySeat = new Map();
  room.pendingNameBySession = new Map();
  room.pendingTokenBySession = new Map();
  room.broadcastAvailableActions = () => undefined;

  for (const [index, seatId] of room.playerOrder.entries()) {
    const player = new PlayerState();
    player.clientId = seatId;
    player.seatIndex = index;
    player.name = index === 0 ? "房主" : index === 1 ? "牌友" : `电脑${index}`;
    player.connected = index < 2;
    player.isBot = index >= 2;
    player.isConfiguredBot = index >= 2;
    room.state.players.set(seatId, player);
    room.baseNameBySeat.set(seatId, player.name);
  }

  const sent: Array<{ sessionId: string; event: string; payload: unknown }> = [];
  const client = (sessionId: string): FakeClient => ({
    sessionId,
    send: (event, payload) => sent.push({ sessionId, event, payload }),
  });
  return { room, sent, host: client("host-session"), guest: client("guest-session") };
}

test("friend-room guests explicitly ready before the host may start", () => {
  const { room, sent, host, guest } = createReadyRoom();
  let started = 0;
  room.bootstrapRound = () => {
    started += 1;
  };

  room.handleStartGame(host);
  assert.equal(started, 0);
  assert.equal(
    sent.some(
      (message) =>
        message.event === "lobby_error" &&
        (message.payload as { message?: string }).message === "还有 1 位牌友未准备。",
    ),
    true,
  );

  room.handleSetLobbyReady(guest, { ready: true });
  assert.equal(room.state.players.get("seat_1")?.lobbyReady, true);
  assert.equal(room.friendRoomStartProblem(), "");
  room.handleStartGame(host);
  assert.equal(started, 1);
});

test("host, configured bots, and invalid phases cannot spoof guest readiness", () => {
  const { room, sent, host, guest } = createReadyRoom();
  room.handleSetLobbyReady(host, { ready: true });
  assert.equal(room.state.players.get("seat_0")?.lobbyReady, false);

  const botClient: FakeClient = { sessionId: "bot-session", send: () => undefined };
  room.seatBySession.set(botClient.sessionId, "seat_2");
  room.handleSetLobbyReady(botClient, { ready: true });
  assert.equal(room.state.players.get("seat_2")?.lobbyReady, false);

  room.state.phase = "playing";
  room.handleSetLobbyReady(guest, { ready: true });
  assert.equal(room.state.players.get("seat_1")?.lobbyReady, false);
  assert.equal(sent.filter((message) => message.event === "lobby_error").length, 2);
});

test("brief disconnect preserves readiness but still blocks starting", () => {
  const { room, guest } = createReadyRoom();
  room.handleSetLobbyReady(guest, { ready: true });
  const player = room.state.players.get("seat_1")!;

  player.connected = false;
  assert.equal(player.lobbyReady, true);
  assert.equal(room.friendRoomStartProblem(), "仍有真人玩家离线，请等待其重连或由房主移除。");

  player.connected = true;
  assert.equal(player.lobbyReady, true);
  assert.equal(room.friendRoomStartProblem(), "");
});

test("moving to another lobby seat clears the guest's prior confirmation", () => {
  const { room, guest } = createReadyRoom();
  room.handleSetLobbyReady(guest, { ready: true });
  room.state.players.delete("seat_3");
  room.playerHands.delete("seat_3");
  room.playerOrder = room.playerOrder.filter((seatId: string) => seatId !== "seat_3");
  room.botIds.delete("seat_3");
  room.configuredBotIds.delete("seat_3");

  assert.equal(room.claimSeatForClient(guest, 3, "token-seat_1"), true);
  assert.equal(room.state.players.has("seat_1"), false);
  assert.equal(room.state.players.get("seat_3")?.lobbyReady, false);
});

test("returning to the lobby clears human readiness without clearing friend scores", () => {
  const { room } = createReadyRoom();
  const host = room.state.players.get("seat_0")!;
  const guest = room.state.players.get("seat_1")!;
  host.lobbyReady = true;
  guest.lobbyReady = true;
  host.cumulativeScore = 9;
  guest.cumulativeScore = -9;
  room.state.completedRounds = 2;
  room.state.scoringMode = "cumulative";

  resetToLobby({
    state: room.state,
    playerOrder: room.playerOrder,
    botIds: room.botIds,
    configuredBotIds: room.configuredBotIds,
    playerHands: room.playerHands,
    baseNameBySeat: room.baseNameBySeat,
    seatBySession: room.seatBySession,
    seatByToken: room.seatByToken,
    targetSeats: 4,
    resetRuntime: () => undefined,
    syncAllPrivateHands: () => undefined,
    broadcastAvailableActions: () => undefined,
  });

  assert.equal(host.lobbyReady, false);
  assert.equal(guest.lobbyReady, false);
  assert.equal(host.cumulativeScore, 9);
  assert.equal(guest.cumulativeScore, -9);
  assert.equal(room.state.completedRounds, 2);
});

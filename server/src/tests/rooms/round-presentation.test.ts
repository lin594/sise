import assert from "node:assert/strict";
import test from "node:test";
import { FourColorGameRoom } from "../../rooms/GameRoom.js";
import { GameState, PlayerState } from "../../schema/game-state.schema.js";

test("a new round snapshot reaches clients before the legacy private hand event", () => {
  const room = new FourColorGameRoom() as any;
  room.state = new GameState();
  room.state.roomMode = "practice";
  room.state.phase = "ended";
  room.state.hostPlayerId = "seat_0";
  room.playerOrder = ["seat_0", "seat_1", "seat_2", "seat_3"];
  room.playerHands = new Map(room.playerOrder.map((seatId: string) => [seatId, []]));
  room.botIds = new Set(["seat_1", "seat_2", "seat_3"]);
  room.seatBySession = new Map([["human-session", "seat_0"]]);
  room.seatByToken = new Map([["human-token", "seat_0"]]);
  room.baseNameBySeat = new Map();
  room.openingDealDelayMs = 60_000;
  room.dealerPickIntroMs = 60_000;
  room.dealerRevealIntroMs = 60_000;

  for (const [seatIndex, seatId] of room.playerOrder.entries()) {
    const player = new PlayerState();
    player.clientId = seatId;
    player.seatIndex = seatIndex;
    player.name = seatIndex === 0 ? "玩家" : `机器人${seatIndex}`;
    player.connected = seatIndex === 0;
    player.isBot = seatIndex > 0;
    room.state.players.set(seatId, player);
  }

  const sent: Array<{ event: string; payload: any }> = [];
  room.clients = [{
    sessionId: "human-session",
    send: (event: string, payload: unknown) => sent.push({ event, payload }),
  }];
  room.broadcastAvailableActions = () => {
    room.clients[0].send("room_snapshot", room.buildClientRoomSnapshot("seat_0"));
    room.clients[0].send("available_actions", { items: [] });
  };

  room.bootstrapRound();

  const snapshotIndex = sent.findIndex((message) => message.event === "room_snapshot");
  const privateHandIndex = sent.findIndex((message) => message.event === "private_hand");
  assert.ok(snapshotIndex >= 0, "new-round snapshot should be published");
  assert.ok(privateHandIndex > snapshotIndex, "private_hand must not arrive before the new-round snapshot");

  const snapshot = sent[snapshotIndex].payload;
  assert.equal(snapshot.phase, "declaring");
  assert.equal(snapshot.privateHand.length, 21);
  assert.deepEqual(snapshot.players.map((player: { handCount: number }) => player.handCount).sort((a: number, b: number) => a - b), [20, 20, 20, 21]);

  room.clearDeclareIntroTimer();
});

import assert from "node:assert/strict";
import test from "node:test";
import { FourColorGameRoom } from "../../rooms/GameRoom.js";
import { GameState, PlayerState } from "../../schema/game-state.schema.js";

function createWaitingFriendRoom() {
  const room = new FourColorGameRoom() as any;
  room.state = new GameState();
  room.state.phase = "waiting";
  room.state.roomMode = "friends";
  room.state.hostPlayerId = "seat_0";
  room.seatBySession = new Map([
    ["host-session", "seat_0"],
    ["guest-session", "seat_1"],
  ]);
  room.seatByToken = new Map([
    ["host-token", "seat_0"],
    ["guest-token", "seat_1"],
  ]);

  for (const [seatId, name] of [["seat_0", "房主"], ["seat_1", "牌友"]] as const) {
    const player = new PlayerState();
    player.clientId = seatId;
    player.name = name;
    room.state.players.set(seatId, player);
  }

  const sent: Array<{ sessionId: string; event: string; payload: unknown }> = [];
  room.clients = ["host-session", "guest-session"].map((sessionId) => ({
    sessionId,
    send: (event: string, payload: unknown) => sent.push({ sessionId, event, payload }),
  }));
  const disconnectCodes: number[] = [];
  room.disconnect = async (code: number) => {
    disconnectCodes.push(code);
  };
  return { room, sent, disconnectCodes };
}

test("only the host can dissolve a waiting friend table", async () => {
  const { room, sent, disconnectCodes } = createWaitingFriendRoom();

  await room.handleDissolveRoom({ sessionId: "guest-session", send: () => undefined });

  assert.deepEqual(disconnectCodes, []);
  assert.equal(sent.some((message) => message.event === "room_dissolved"), false);
});

test("dissolving notifies every connection and closes the room with a terminal code", async () => {
  const { room, sent, disconnectCodes } = createWaitingFriendRoom();

  await room.handleDissolveRoom({ sessionId: "host-session", send: () => undefined });

  assert.deepEqual(disconnectCodes, [4110]);
  assert.equal(sent.filter((message) => message.event === "room_dissolved").length, 2);
  assert.equal(
    sent.every((message) => (message.payload as { reason?: string }).reason === "房主已解散本桌，大家已返回模式选择。"),
    true,
  );
  assert.equal(room.seatByToken.size, 0);
});

test("a friend table cannot be dissolved during an active round", async () => {
  const { room, sent, disconnectCodes } = createWaitingFriendRoom();
  room.state.phase = "playing";

  await room.handleDissolveRoom({ sessionId: "host-session", send: () => undefined });

  assert.deepEqual(disconnectCodes, []);
  assert.equal(sent.some((message) => message.event === "room_dissolved"), false);
});

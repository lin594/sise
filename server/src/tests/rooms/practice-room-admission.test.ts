import assert from "node:assert/strict";
import test from "node:test";
import { FourColorGameRoom } from "../../rooms/GameRoom.js";
import { GameState, PlayerState } from "../../schema/game-state.schema.js";

function createWaitingPracticeRoom(): any {
  const room = new FourColorGameRoom() as any;
  room.state = new GameState();
  room.state.phase = "waiting";
  room.state.roomMode = "practice";
  room.clearRoomIdleTimer = () => undefined;
  return room;
}

test("a practice room rejects a second new human without changing seats", () => {
  const room = createWaitingPracticeRoom();
  const player = new PlayerState();
  player.clientId = "seat_0";
  player.name = "先来的玩家";
  player.isBot = false;
  player.isConfiguredBot = false;
  player.connected = true;
  room.state.players.set(player.clientId, player);
  room.playerOrder = [player.clientId];
  room.seatByToken = new Map([["pt_existing", player.clientId]]);
  room.seatBySession = new Map([["existing-session", player.clientId]]);

  const messages: Array<{ event: string; payload: unknown }> = [];
  const leaves: number[] = [];
  const intruder = {
    sessionId: "intruder-session",
    send: (event: string, payload: unknown) => messages.push({ event, payload }),
    leave: (code: number) => leaves.push(code),
  };

  room.onJoin(intruder, { name: "后来的人", playerToken: "pt_new" });

  assert.deepEqual(leaves, [4106]);
  assert.equal(messages.some(({ event }) => event === "join_error"), true);
  assert.equal(room.state.players.size, 1);
  assert.deepEqual(room.playerOrder, ["seat_0"]);
  assert.equal(room.seatByToken.has("pt_new"), false);
});

test("an existing practice token is reclaimed before new-player admission checks", () => {
  const room = createWaitingPracticeRoom();
  room.seatByToken = new Map([["pt_existing", "seat_0"]]);
  let reclaimed = false;
  room.reclaimSeat = (_client: unknown, seatId: string, token: string) => {
    reclaimed = seatId === "seat_0" && token === "pt_existing";
  };
  const returning = {
    sessionId: "returning-session",
    send: () => undefined,
    leave: () => assert.fail("a valid reconnect must not be rejected"),
  };

  room.onJoin(returning, { name: "原玩家", playerToken: "pt_existing" });

  assert.equal(reclaimed, true);
});

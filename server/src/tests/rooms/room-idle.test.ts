import test from "node:test";
import assert from "node:assert/strict";
import { FourColorGameRoom } from "../../rooms/GameRoom.js";
import { GameState } from "../../schema/game-state.schema.js";

test("new rooms arm the business idle timer before the first client joins", () => {
  const room = new FourColorGameRoom() as any;
  let scheduled = 0;

  room.roomId = "idle-create-test";
  room.setState = (state: GameState) => {
    room.state = state;
  };
  room.syncRoomMetadata = () => undefined;
  room.onMessage = () => room;
  room.scheduleRoomIdleIfEmpty = () => {
    scheduled += 1;
  };

  room.onCreate({ roomMode: "friends", hostKey: "host-key" });

  assert.equal(scheduled, 1);
  assert.equal(room.state.phase, "waiting");
  assert.equal(room.state.roomMode, "friends");
  room.onDispose();
});

test("an unjoined waiting room is disconnected after its idle grace period", async () => {
  const room = new FourColorGameRoom() as any;
  const closeCodes: number[] = [];

  room.state = new GameState();
  room.waitingRoomIdleMs = 10;
  room.seatBySession = new Map();
  room.pendingNameBySession = new Map();
  room.roomIdleTimer = null;
  room.disconnect = async (closeCode: number) => {
    closeCodes.push(closeCode);
  };

  room.scheduleRoomIdleIfEmpty();
  await new Promise((resolve) => setTimeout(resolve, 25));

  assert.deepEqual(closeCodes, [4000]);
  assert.equal(room.roomIdleTimer, null);
});

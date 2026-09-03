import assert from "node:assert/strict";
import test from "node:test";
import { createIsolatedPracticeRoomId } from "../../http/practice-room-creation.js";

test("every compatibility practice entry creates a separate room", async () => {
  const calls: Array<{ name: string; options: Record<string, unknown> }> = [];
  let sequence = 0;
  const createRoom = async (name: string, options: Record<string, unknown>) => {
    calls.push({ name, options });
    sequence += 1;
    return { roomId: `practice-${sequence}` };
  };

  const [first, second] = await Promise.all([
    createIsolatedPracticeRoomId(createRoom),
    createIsolatedPracticeRoomId(createRoom),
  ]);

  assert.notEqual(first, second);
  assert.deepEqual(calls, [
    { name: "four-color", options: { roomMode: "practice" } },
    { name: "four-color", options: { roomMode: "practice" } },
  ]);
});

test("practice room creation rejects an invalid matchmaker result", async () => {
  await assert.rejects(
    createIsolatedPracticeRoomId(async () => ({ roomId: "  " })),
    /没有返回房间 ID/,
  );
});

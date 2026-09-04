# Active Room Recovery Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Preserve an authoritative four-player game across server rebuilds and let existing player tokens reclaim the same room, seat and hand.

**Architecture:** Store a versioned, private room snapshot in Redis after completed gameplay mutations. Restore snapshots with their original room IDs before the server starts listening, discard old socket sessions and timers, then rebuild reconnect grace and phase timers from the recovered state.

**Tech Stack:** Node.js 22, TypeScript, Colyseus 0.18, `@colyseus/schema`, Redis 7, Node test runner, Docker Compose.

---

### Task 1: Versioned snapshot store

**Files:**
- Create: `server/src/persistence/room-snapshot-store.ts`
- Create: `server/src/tests/persistence/room-snapshot-store.test.ts`

1. Write tests for save/load/remove, corrupt record cleanup, version rejection and Redis-disabled no-op behavior.
2. Run `npm --prefix server run build` and the focused Node test; expect the new tests to fail before implementation.
3. Implement a store interface, in-memory test store, Redis store with atomic value replacement and an indexed room list.
4. Ensure values expire and raw token values are never used as Redis keys or log text.
5. Run the focused test; expect all cases to pass.

### Task 2: Authoritative room snapshot roundtrip

**Files:**
- Modify: `server/src/rooms/GameRoom.ts`
- Create: `server/src/rooms/room-recovery.ts`
- Create: `server/src/tests/rooms/room-recovery.test.ts`

1. Write a failing test that creates a room in a live response phase, exports it, creates a replacement room, and asserts public state, private hands, deck, pending response, player order and token seat recovery are identical.
2. Add failure cases for incompatible versions and incomplete snapshots; assert no partial restored fields.
3. Implement JSON-safe map/set/card codecs and `exportRecoverySnapshot()`.
4. Let `onCreate({ recoverySnapshot })` validate, set the original roomId, restore `GameState`, replace all private fields, and normalize connection state.
5. Rebuild fresh wait/declare/response timers after creation; never reuse old timer handles or WebSocket sessions.
6. Run focused room tests; expect all cases to pass.

### Task 3: Persistence runtime and server boot

**Files:**
- Create: `server/src/persistence/room-snapshot-runtime.ts`
- Modify: `server/src/rooms/room-registry.ts`
- Modify: `server/src/rooms/GameRoom.ts`
- Modify: `server/src/index.ts`
- Test: `server/src/tests/persistence/room-snapshot-runtime.test.ts`

1. Write failing tests for per-room debounce, last-write wins, forced shutdown flush, normal-dispose delete and shutdown-dispose retain.
2. Schedule snapshots from the authoritative broadcast boundary without awaiting Redis in the room loop.
3. Expose registered rooms for a forced shutdown snapshot pass.
4. Await MatchMaker readiness, restore valid rooms via `matchMaker.createRoom`, and only then call `listen`.
5. In `gameServer.onBeforeShutdown`, retain and flush all room snapshots; in `onShutdown`, close snapshot and guest-profile stores.
6. Run focused persistence tests; expect all cases to pass.

### Task 4: Regression and documentation

**Files:**
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DEPLOYMENT.md`
- Modify: `docs/TESTING.md`

1. Run `npm --prefix server test`; expect the legacy harness and all Node tests to pass.
2. Document the recovery state boundary, Redis TTL, startup order, failure behavior and production backup requirement.
3. Add an operator acceptance recipe: create a live game, record room/seat/hand, restart only the server, wait for reconnect and assert the same decision state.
4. Commit server implementation and canonical documentation separately from unrelated client readability work.

### Task 5: iMac deployment proof

1. Push the verified commits.
2. On `imac`, run `git pull --ff-only` and `docker compose up --build -d` in `~/workspace/lin594/sise`.
3. Open `http://imac.tajuren.cn` in Chrome, enter a practice game, and capture room ID, seat, hand and current target card.
4. Restart only the server container while the page remains open.
5. Assert the page reconnects to the same room and seat, the private hand and target card match, and play can continue.
6. Check container health/logs and confirm no token or private-hand data appears in logs.

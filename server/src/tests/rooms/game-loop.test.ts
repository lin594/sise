import test from "node:test";
import assert from "node:assert/strict";
import { FourColorGameRoom } from "../../rooms/GameRoom.js";
import { getAvailableActionsFlow } from "../../rooms/flow/playing-flow.js";
import { GameState, PlayerState } from "../../schema/game-state.schema.js";
import type { Card } from "../../rules/types.js";

function mkCard(id: string, color: Card["color"], type: Card["type"], source: "upper" | "draw"): Card {
  return { id, color, type, source };
}

function mkRoomWithSeats(seats: string[]) {
  const room = new FourColorGameRoom();
  const state = new GameState();
  for (const seat of seats) {
    const p = new PlayerState();
    p.clientId = seat;
    p.name = seat;
    state.players.set(seat, p);
  }
  (room as any).state = state;
  (room as any).playerOrder = [...seats];
  state.roomMode = "friends";
  state.phase = "playing";
  (room as any).collectiveTimeoutMs = 5;
  (room as any).localTimeoutMs = 5;
  (room as any).operationTimeoutMs = 5;
  return room as any;
}

test("collective order for draw starts from owner then rotates", () => {
  const room = mkRoomWithSeats(["A", "B", "C", "D"]);
  const pending = {
    ownerId: "A",
    card: mkCard("x", "red", "ju", "draw"),
    collectives: new Map(),
  };
  const order = room.getCollectiveOrder(pending);
  assert.deepEqual(order, ["A", "B", "C", "D"]);
});

test("collective order for upper starts from next and includes owner at tail", () => {
  const room = mkRoomWithSeats(["A", "B", "C", "D"]);
  const pending = {
    ownerId: "A",
    card: mkCard("x", "red", "ju", "upper"),
    collectives: new Map(),
  };
  const order = room.getCollectiveOrder(pending);
  assert.deepEqual(order, ["B", "C", "D", "A"]);
});

test("no-response on upper enters local_upper for next player", () => {
  const room = mkRoomWithSeats(["A", "B", "C", "D"]);
  room.pendingResponse = {
    ownerId: "A",
    card: mkCard("x", "red", "ju", "upper"),
    collectives: new Map(),
  };
  room.enterOwnerLocalPhaseAfterNoResponse("A");

  assert.equal(room.state.responsePhase, "local_upper");
  assert.equal(room.state.currentPlayerId, "B");
  assert.equal(room.pendingResponse.ownerId, "B");
});

test("local_upper human gets timeout countdown scheduled", () => {
  const room = mkRoomWithSeats(["A", "B", "C", "D"]);
  room.pendingResponse = {
    ownerId: "B",
    card: mkCard("x", "red", "ju", "upper"),
    collectives: new Map(),
  };
  room.state.responsePhase = "local_upper";
  room.tickBots();

  assert.equal(room.state.responseEndsAt > Date.now(), true);
  assert.equal(Boolean(room.collectiveTimer), true);
  room.clearCollectiveTimer();
});

test("local_upper timeout defaults to pass", async () => {
  const room = mkRoomWithSeats(["A", "B", "C", "D"]);
  room.pendingResponse = {
    ownerId: "B",
    card: mkCard("x", "red", "ju", "upper"),
    collectives: new Map(),
  };
  room.state.responsePhase = "local_upper";
  room.localTimeoutMs = 1;
  let called = false;
  room.executeGrab = (ownerId: string) => {
    called = ownerId === "B";
  };

  room.scheduleCollectiveTimeout();
  await new Promise((resolve) => setTimeout(resolve, 8));

  assert.equal(called, true);
});

test("local_draw timeout auto-discards when awaiting discard", async () => {
  const room = mkRoomWithSeats(["A", "B", "C", "D"]);
  room.pendingResponse = {
    ownerId: "B",
    card: mkCard("x", "red", "ju", "draw"),
    collectives: new Map(),
  };
  room.state.responsePhase = "local_draw";
  room.awaitingDiscardOwnerId = "B";
  room.localTimeoutMs = 1;
  let called = false;
  room.discardFromAndCollective = (ownerId: string) => {
    called = ownerId === "B";
  };

  room.scheduleCollectiveTimeout();
  await new Promise((resolve) => setTimeout(resolve, 8));

  assert.equal(called, true);
});

test("local_draw timeout exposes a special card instead of passing it", async () => {
  const room = mkRoomWithSeats(["A", "B", "C", "D"]);
  room.pendingResponse = {
    ownerId: "B",
    card: mkCard("green_jiang_01", "green", "jiang", "upper"),
    collectives: new Map(),
    responsePhaseAfterNoResponse: "local_draw",
  };
  room.state.responsePhase = "local_draw";
  room.localTimeoutMs = 1;
  let enteredDiscard = false;
  let passedToNext = false;
  room.enterDiscardStage = (ownerId: string, tag: string) => {
    enteredDiscard = ownerId === "B" && tag === "FORCE_TAKE";
  };
  room.executePassToNext = () => {
    passedToNext = true;
  };

  room.scheduleCollectiveTimeout();
  await new Promise((resolve) => setTimeout(resolve, 8));

  const player = room.state.players.get("B");
  assert.ok(player);
  assert.equal(enteredDiscard, true);
  assert.equal(passedToNext, false);
  assert.deepEqual([...player.exposedArea].map((card: Card) => card.id), ["green_jiang_01"]);
  assert.deepEqual([...player.exposedGroupSizes], [1]);
  assert.equal(player.generalArea.length, 0);
  assert.equal(player.wildcardPool.length, 0);
});

test("declaration time extension is available once per connected human", () => {
  const room = mkRoomWithSeats(["A", "B", "C", "D"]);
  room.state.phase = "declaring";
  room.declareTimeoutMs = 1_000;
  room.timeExtensionMs = 5_000;
  room.declareTimerTotalMs = 1_000;
  room.declareDecisionWindowId = 7;
  room.state.declareEndsAt = Date.now() + 1_000;
  room.broadcastAvailableActions = () => undefined;
  for (const seatId of ["A", "B"]) {
    room.state.players.get(seatId).connected = true;
    room.seatBySession.set(`session-${seatId}`, seatId);
  }
  const clientA = { sessionId: "session-A", send: () => undefined };
  const clientB = { sessionId: "session-B", send: () => undefined };
  const decisionKey = room.buildDecisionTimerSnapshot("A").decisionKey;

  const beforeA = room.state.declareEndsAt;
  room.handleRequestMoreTime(clientA, { decisionKey });
  assert.equal(room.buildDecisionTimerSnapshot("A").canRequestMoreTime, false);
  assert.equal(room.buildDecisionTimerSnapshot("B").canRequestMoreTime, true);
  assert.equal(room.buildDecisionTimerSnapshot("A").totalMs, 6_000);
  assert.equal(room.buildDecisionTimerSnapshot("A").endsAt, room.state.declareEndsAt);
  assert.equal(room.state.declareEndsAt >= beforeA + 4_900, true);

  const afterA = room.state.declareEndsAt;
  room.handleRequestMoreTime(clientA, { decisionKey });
  assert.equal(room.state.declareEndsAt, afterA);

  room.handleRequestMoreTime(clientB, { decisionKey });
  assert.equal(room.buildDecisionTimerSnapshot("B").canRequestMoreTime, false);
  assert.equal(room.buildDecisionTimerSnapshot("B").totalMs, 11_000);
  room.clearDeclareTimer();
});

test("stale time-extension request cannot extend the next decision window", () => {
  const room = mkRoomWithSeats(["A", "B", "C", "D"]);
  room.collectiveTimeoutMs = 1_000;
  room.localTimeoutMs = 1_000;
  room.operationTimeoutMs = 1_000;
  room.timeExtensionMs = 5_000;
  room.state.players.get("A").connected = true;
  room.seatBySession.set("session-A", "A");
  room.broadcastAvailableActions = () => undefined;
  const clientA = { sessionId: "session-A", send: () => undefined };

  room.pendingResponse = {
    ownerId: "B",
    card: mkCard("first", "red", "ju", "upper"),
    collectives: new Map(),
  };
  room.state.responsePhase = "collective";
  room.collectiveResponderId = "A";
  room.scheduleCollectiveTimeout();
  const oldDecisionKey = room.buildDecisionTimerSnapshot("A").decisionKey;
  room.handleRequestMoreTime(clientA, { decisionKey: oldDecisionKey });
  assert.equal(room.buildDecisionTimerSnapshot("A").canRequestMoreTime, false);

  room.clearCollectiveTimer();
  room.pendingResponse = {
    ownerId: "A",
    card: mkCard("second", "yellow", "ma", "draw"),
    collectives: new Map(),
  };
  room.state.responsePhase = "local_draw";
  room.awaitingDiscardOwnerId = "A";
  room.scheduleCollectiveTimeout();
  const nextDecision = room.buildDecisionTimerSnapshot("A");
  assert.notEqual(nextDecision.decisionKey, oldDecisionKey);
  assert.equal(nextDecision.canRequestMoreTime, true);

  const beforeStaleRequest = room.state.responseEndsAt;
  room.handleRequestMoreTime(clientA, { decisionKey: oldDecisionKey });
  assert.equal(room.state.responseEndsAt, beforeStaleRequest);
  assert.equal(room.buildDecisionTimerSnapshot("A").canRequestMoreTime, true);

  room.handleRequestMoreTime(clientA, { decisionKey: nextDecision.decisionKey });
  assert.equal(room.state.responseEndsAt >= beforeStaleRequest + 4_900, true);
  assert.equal(room.buildDecisionTimerSnapshot("A").canRequestMoreTime, false);
  assert.equal(room.buildDecisionTimerSnapshot("A").totalMs, 6_000);
  assert.equal(room.buildDecisionTimerSnapshot("A").endsAt, room.state.responseEndsAt);
  room.clearCollectiveTimer();
});

test("bots and disconnected players cannot request more decision time", () => {
  const room = mkRoomWithSeats(["A", "B", "C", "D"]);
  room.state.phase = "declaring";
  room.declareDecisionWindowId = 1;
  room.state.declareEndsAt = Date.now() + 1_000;
  room.state.players.get("A").connected = false;
  room.state.players.get("B").connected = true;
  room.state.players.get("B").isBot = true;
  room.botIds.add("B");

  assert.equal(room.buildDecisionTimerSnapshot("A").canRequestMoreTime, false);
  assert.equal(room.buildDecisionTimerSnapshot("B").canRequestMoreTime, false);
});

test("practice keeps connected human decisions untimed while bot decisions still advance", () => {
  const room = mkRoomWithSeats(["A", "B", "C", "D"]);
  room.state.roomMode = "practice";
  room.state.phase = "declaring";
  room.state.players.get("A").connected = true;
  for (const seatId of ["B", "C", "D"]) {
    room.state.players.get(seatId).isBot = true;
    room.botIds.add(seatId);
  }

  room.startDeclaringPhase();
  const declareTimer = room.buildDecisionTimerSnapshot("A");
  assert.equal(declareTimer.untimed, true);
  assert.equal(declareTimer.canRequestMoreTime, false);
  assert.equal(declareTimer.endsAt, 0);
  assert.equal(room.declareTimer, null);

  room.state.phase = "playing";
  room.pendingResponse = {
    ownerId: "A",
    card: mkCard("human-turn", "green", "ma", "draw"),
    collectives: new Map(),
  };
  room.state.responsePhase = "local_draw";
  room.state.currentPlayerId = "A";
  room.awaitingDiscardOwnerId = "A";
  room.scheduleCollectiveTimeout();
  const humanTurn = room.buildDecisionTimerSnapshot("A");
  assert.equal(humanTurn.untimed, true);
  assert.equal(humanTurn.endsAt, 0);
  assert.equal(room.collectiveTimer, null);

  room.state.players.get("A").connected = false;
  room.state.players.get("A").isBot = true;
  room.botIds.add("A");
  room.scheduleCollectiveTimeout();
  const botTurn = room.buildDecisionTimerSnapshot("A");
  assert.equal(botTurn.untimed, false);
  assert.equal(botTurn.endsAt > Date.now(), true);
  assert.notEqual(room.collectiveTimer, null);
  room.clearCollectiveTimer();
});

test("local_upper action panel does not enable chi via wildcard pool", () => {
  const actions = getAvailableActionsFlow({
    phase: "playing",
    seatId: "A",
    pending: { ownerId: "A", card: mkCard("p1", "red", "ju", "upper") },
    responsePhase: "local_upper",
    collectiveResponderId: null,
    awaitingDiscardOwnerId: null,
    hand: [mkCard("h1", "red", "ma", "upper")],
    wildcardPool: [mkCard("w1", "white", "jiang", "upper")],
    explainHuForSeat: () => ({ valid: false }),
    logHuCheck: () => undefined,
    getHandWithoutPending: (_seat, _pending) => [mkCard("h1", "red", "ma", "upper")],
    getNextPlayerId: () => "A",
  });
  assert.equal(actions.find((x) => x.action === "chi")?.enabled, false);
});

test("collective action panel previews next-player chi without enabling it", () => {
  const actions = getAvailableActionsFlow({
    phase: "playing",
    seatId: "B",
    pending: { ownerId: "A", card: mkCard("p1", "yellow", "pao", "upper") },
    responsePhase: "collective",
    collectiveResponderId: "B",
    awaitingDiscardOwnerId: null,
    hand: [
      mkCard("h1", "yellow", "ju", "upper"),
      mkCard("h2", "yellow", "ma", "upper"),
      mkCard("h3", "yellow", "pao", "upper"),
      mkCard("h4", "yellow", "pao", "upper"),
    ],
    wildcardPool: [],
    explainHuForSeat: () => ({ valid: false }),
    logHuCheck: () => undefined,
    getHandWithoutPending: (_seat, _pending) => [
      mkCard("h1", "yellow", "ju", "upper"),
      mkCard("h2", "yellow", "ma", "upper"),
      mkCard("h3", "yellow", "pao", "upper"),
      mkCard("h4", "yellow", "pao", "upper"),
    ],
    getNextPlayerId: () => "B",
  });
  const chi = actions.find((x) => x.action === "chi");
  assert.equal(chi?.enabled, false);
  assert.equal(chi?.deferred, true);
  assert.equal(chi?.candidates?.some((candidate) => candidate.kind === "jmp"), true);
  const pass = actions.find((x) => x.action === "pass");
  assert.equal(pass?.enabled, true);
  assert.equal(pass?.deferred, true);
});

import test from "node:test";
import assert from "node:assert/strict";
import { FourColorGameRoom } from "../../rooms/GameRoom.js";
import { decideActionDispatch, getAvailableActionsFlow } from "../../rooms/flow/playing-flow.js";
import { applyEnterDiscardStageState } from "../../rooms/flow/support.js";
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
  (room as any).collectiveResponseWindowMs = 5;
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

test("the discard owner cannot interrupt their own upper card", () => {
  const room = mkRoomWithSeats(["A", "B", "C", "D"]);
  room.pendingResponse = {
    ownerId: "A",
    card: mkCard("own-discard", "red", "ju", "upper"),
    collectives: new Map(),
  };
  room.state.responsePhase = "collective";
  room.playerHands.set("A", [
    mkCard("own-ju-1", "red", "ju", "upper"),
    mkCard("own-ju-2", "red", "ju", "upper"),
  ]);

  assert.equal(room.hasCollectiveActionBeyondPass("A"), false);
  assert.equal(
    room.getAvailableActions("A", true).some((entry: { action: string; enabled: boolean }) =>
      entry.action !== "pass" && entry.enabled,
    ),
    false,
  );
});

test("entering discard after a collective meld restores the winner as the displayed turn", () => {
  for (const tag of ["PENG", "KAI"]) {
    const state = new GameState();
    state.responsePhase = "collective";
    state.currentPlayerId = "D";
    state.currentTurnPlayerId = "D";

    applyEnterDiscardStageState(state, "B", tag);

    assert.equal(state.responsePhase, "local_draw");
    assert.equal(state.currentPlayerId, "B");
    assert.equal(state.currentTurnPlayerId, "B");
    assert.equal(state.lastAction, `B ${tag}`);
  }
});

test("all human forced passes share one fairness window without exposing Pass controls", async () => {
  const room = mkRoomWithSeats(["A", "B", "C", "D"]);
  room.collectiveResponseWindowMs = 40;
  room.pendingResponse = {
    ownerId: "A",
    card: mkCard("fair-pass", "red", "ju", "upper"),
    collectives: new Map(),
  };
  room.state.responsePhase = "collective";
  room.collectiveQueue = ["B", "C", "D", "A"];
  room.collectiveCursor = 0;
  room.collectiveResponseEndsAt = Date.now() + 40;
  for (const seat of ["B", "C", "D"]) room.state.players.get(seat).connected = true;
  room.seatBySession.set("session-B", "B");
  let resolved = false;
  room.resolveCollectivePhase = () => {
    resolved = true;
  };
  const sent: Array<{ event: string; payload: any }> = [];
  const client = {
    sessionId: "session-B",
    send: (event: string, payload: any) => sent.push({ event, payload }),
  };

  const startedAt = Date.now();
  room.advanceCollectivePolling();
  assert.equal(room.collectiveResponderId, "B");
  assert.equal(room.pendingResponse.collectives.has("B"), false);
  assert.equal(room.state.responseEndsAt >= startedAt + 30, true);
  assert.equal(room.buildDecisionTimerSnapshot("C").endsAt, room.state.responseEndsAt);
  assert.deepEqual(room.buildClientDecisionView("B").availableActions, []);
  assert.equal(resolved, false);
  assert.equal(room.collectiveCursor, 0);
  assert.equal(sent.some((message) => message.event === "action_received"), false);

  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(resolved, false);
  await new Promise((resolve) => setTimeout(resolve, 45));
  assert.equal(resolved, true);
  assert.equal(room.collectiveCursor, 4);
  assert.equal(
    [...room.pendingResponse.collectives.values()].every((choice: { action: string }) => choice.action === "pass"),
    true,
  );
});

test("collective window is shared and the prepared receiver gets a fresh local timer", async () => {
  const room = mkRoomWithSeats(["A", "B", "C", "D"]);
  room.collectiveResponseWindowMs = 40;
  room.localTimeoutMs = 1_000;
  room.localTransitionDelayMs = 0;
  room.pendingResponse = {
    ownerId: "A",
    card: mkCard("shared-window", "yellow", "pao", "upper"),
    collectives: new Map(),
  };
  room.state.responsePhase = "collective";
  room.state.currentPlayerId = "B";
  room.state.currentTurnPlayerId = "B";
  room.state.pendingReceiverId = "B";
  for (const seatId of ["B", "C", "D"]) {
    room.state.players.get(seatId).connected = true;
  }

  const startedAt = Date.now();
  room.startCollectivePolling();
  const collectiveTimer = room.buildDecisionTimerSnapshot("B");
  const collectiveDecisionKey = collectiveTimer.decisionKey;

  assert.equal(collectiveTimer.totalMs, 40);
  assert.equal(collectiveTimer.endsAt <= startedAt + 55, true);
  assert.equal(room.state.currentTurnPlayerId, "B");
  assert.equal(room.state.pendingReceiverId, "B");
  assert.equal(room.state.activeResponderId, "");

  await new Promise((resolve) => setTimeout(resolve, 65));

  assert.equal(room.state.responsePhase, "local_upper");
  assert.equal(room.state.currentTurnPlayerId, "B");
  const localTimer = room.buildDecisionTimerSnapshot("B");
  assert.equal(localTimer.totalMs, 1_000);
  assert.notEqual(localTimer.decisionKey, collectiveDecisionKey);
  assert.equal(localTimer.endsAt >= Date.now() + 850, true);
  room.clearCollectiveTimer();
});

test("a human discard to three computers does not create an artificial privacy wait", () => {
  const room = mkRoomWithSeats(["A", "B", "C", "D"]);
  room.collectiveResponseWindowMs = 3_000;
  room.state.players.get("A").connected = true;
  for (const seatId of ["B", "C", "D"]) {
    room.state.players.get(seatId).isConfiguredBot = true;
    room.botIds.add(seatId);
  }
  room.pendingResponse = {
    ownerId: "A",
    card: mkCard("bot-table-discard", "white", "shi", "upper"),
    collectives: new Map(),
  };
  room.state.responsePhase = "collective";

  assert.equal(room.currentCollectiveResponseWindowMs(), 0);
});

test("a computer interrupt resolves immediately when no responder can outrank it", () => {
  const room = mkRoomWithSeats(["A", "B", "C", "D"]);
  room.pendingResponse = {
    ownerId: "A",
    card: mkCard("bot-interrupt", "white", "shi", "upper"),
    collectives: new Map(),
  };
  room.state.responsePhase = "collective";
  room.collectiveQueue = ["B", "C", "D", "A"];
  room.collectiveCursor = 0;
  room.collectiveResponderId = "B";
  room.collectiveResponseEndsAt = Date.now() + 3_000;
  room.getAvailableActions = () => [{ action: "pass", enabled: true }];
  let resolvedWinner = "";
  room.executeResponseWinner = (seatId: string) => {
    resolvedWinner = seatId;
  };

  const takenOver = room.acceptBotCollectiveChoice("B", { action: "peng", candidateId: "bot-peng" });

  assert.equal(takenOver, true);
  assert.equal(resolvedWinner, "B");
  assert.equal(room.collectiveResponseEndsAt, 0);
  assert.equal(room.collectiveTimer, null);
});

test("same-priority interrupt waits only for an earlier seat and resolves as soon as it passes", () => {
  const room = mkRoomWithSeats(["A", "B", "C", "D"]);
  room.pendingResponse = {
    ownerId: "A",
    card: mkCard("ordered-hu", "red", "ju", "upper"),
    collectives: new Map([["C", { action: "hu" }]]),
  };
  room.state.responsePhase = "collective";
  room.collectiveResponseEndsAt = Date.now() + 3_000;
  room.getAvailableActions = (seatId: string) => seatId === "B"
    ? [{ action: "hu", enabled: true }, { action: "pass", enabled: true }]
    : [{ action: "pass", enabled: true }];
  let resolvedWinner = "";
  room.executeResponseWinner = (seatId: string) => {
    resolvedWinner = seatId;
  };

  assert.equal(room.tryResolveCollectiveInterrupt(), true);
  assert.equal(resolvedWinner, "");
  assert.deepEqual(room.collectiveQueue, ["B"]);

  room.pendingResponse.collectives.set("B", { action: "pass" });
  assert.equal(room.tryResolveCollectiveInterrupt(), true);
  assert.equal(resolvedWinner, "C");
  assert.equal(room.collectiveResponseEndsAt, 0);
});

test("an earlier same-priority responder's Pass releases the waiting interrupt immediately", () => {
  const room = mkRoomWithSeats(["A", "B", "C", "D"]);
  room.pendingResponse = {
    ownerId: "A",
    card: mkCard("ordered-hu-handle", "red", "ju", "upper"),
    collectives: new Map([["C", { action: "hu" }]]),
  };
  room.state.responsePhase = "collective";
  room.collectiveQueue = ["B"];
  room.collectiveCursor = 0;
  room.collectiveResponderId = "B";
  room.collectiveResponseEndsAt = Date.now() + 3_000;
  room.responseDecisionWindowId = 8;
  room.seatBySession.set("session-B", "B");
  room.getAvailableActions = (seatId: string) => seatId === "B"
    ? [{ action: "hu", enabled: true }, { action: "pass", enabled: true }]
    : [{ action: "pass", enabled: true }];
  let resolvedWinner = "";
  room.executeResponseWinner = (seatId: string) => {
    resolvedWinner = seatId;
  };

  room.handleAction(
    { sessionId: "session-B", send: () => undefined },
    { action: "pass", decisionKey: "play:8" },
  );

  assert.equal(resolvedWinner, "C");
  assert.equal(room.collectiveResponseEndsAt, 0);
  assert.equal(room.collectiveTimer, null);
});

test("collective privacy includes a human draw but skips the public discard owner", () => {
  const room = mkRoomWithSeats(["A", "B", "C", "D"]);
  room.collectiveResponseWindowMs = 3_000;
  room.pendingResponse = {
    ownerId: "A",
    card: mkCard("private-draw", "white", "shi", "draw"),
    collectives: new Map(),
  };
  room.collectiveResponseEndsAt = Date.now() + 3_000;
  assert.equal(room.collectiveResponseRemainingMsForSeat("A") > 2_900, true);

  room.pendingResponse = {
    ownerId: "A",
    card: mkCard("public-discard", "white", "shi", "upper"),
    collectives: new Map(),
  };
  room.state.responsePhase = "collective";
  room.collectiveQueue = ["A"];
  room.collectiveCursor = 0;
  let resolved = false;
  room.resolveCollectivePhase = () => {
    resolved = true;
  };

  room.advanceCollectivePolling();
  assert.equal(room.collectiveResponseRemainingMsForSeat("A"), 0);
  assert.equal(room.pendingResponse.collectives.get("A")?.action, "pass");
  assert.equal(room.collectiveTimer, null);
  assert.equal(resolved, true);
});

test("a private non-pass preselection may resolve immediately when nobody can outrank it", () => {
  const room = mkRoomWithSeats(["A", "B", "C", "D"]);
  room.collectiveResponseWindowMs = 35;
  room.pendingResponse = {
    ownerId: "A",
    card: mkCard("fair-preselect", "red", "ju", "upper"),
    collectives: new Map([["B", { action: "peng", candidateId: "reserved-peng" }]]),
  };
  room.state.responsePhase = "collective";
  room.collectiveQueue = ["B"];
  room.collectiveCursor = 0;
  let resolved = false;
  room.resolveCollectivePhase = () => {
    resolved = true;
  };

  room.advanceCollectivePolling();
  assert.equal(room.collectiveResponderId, null);
  assert.equal(room.collectiveCursor, 1);
  assert.equal(resolved, true);
});

test("an active human pass is held until the collective privacy floor", async () => {
  const room = mkRoomWithSeats(["A", "B", "C", "D"]);
  room.collectiveResponseWindowMs = 150;
  room.playerHands.set("B", [
    mkCard("peng-1", "red", "ju", "upper"),
    mkCard("peng-2", "red", "ju", "upper"),
    mkCard("spare", "green", "ma", "upper"),
  ]);
  room.pendingResponse = {
    ownerId: "A",
    card: mkCard("privacy-target", "red", "ju", "upper"),
    collectives: new Map(),
  };
  room.state.responsePhase = "collective";
  room.collectiveQueue = ["B"];
  room.collectiveCursor = 0;
  room.collectiveResponseEndsAt = Date.now() + 150;
  room.state.players.get("B").connected = true;
  room.seatBySession.set("session-B", "B");
  let resolved = false;
  room.resolveCollectivePhase = () => {
    resolved = true;
  };

  room.advanceCollectivePolling();
  room.handleAction(
    { sessionId: "session-B", send: () => {} },
    { action: "pass", decisionKey: room.buildDecisionTimerSnapshot("B").decisionKey },
  );
  assert.equal(room.pendingResponse.collectives.get("B")?.action, "pass");
  assert.equal(resolved, false);
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(resolved, false);
  await new Promise((resolve) => setTimeout(resolve, 160));
  assert.equal(resolved, true);
});

test("a non-pass interrupt is not held by the privacy floor when nobody can outrank it", () => {
  const room = mkRoomWithSeats(["A", "B", "C", "D"]);
  room.playerHands = new Map([["B", [
    mkCard("peng-1", "red", "ju", "upper"),
    mkCard("peng-2", "red", "ju", "upper"),
  ]]]);
  room.pendingResponse = { ownerId: "A", card: mkCard("target", "red", "ju", "upper"), collectives: new Map() };
  room.state.responsePhase = "collective";
  room.collectiveQueue = ["B", "C", "D", "A"];
  room.collectiveCursor = 0;
  room.collectiveResponderId = "B";
  room.collectiveResponseEndsAt = Date.now() + 3_000;
  room.seatBySession.set("session-B", "B");
  let resolved = false;
  room.resolveCollectivePhase = () => { resolved = true; };
  const candidateId = room.getAvailableActions("B").find((item: any) => item.action === "peng")?.candidates?.[0]?.id;
  room.handleAction({ sessionId: "session-B", send: () => {} }, { action: "peng", candidateId });
  assert.equal(resolved, true);
});

test("a submitted peng waits only for an earlier or higher-priority capable responder", () => {
  const room = mkRoomWithSeats(["A", "B", "C", "D"]);
  room.playerHands = new Map([
    ["B", [mkCard("b1", "red", "ju", "upper"), mkCard("b2", "red", "ju", "upper")]],
    ["C", [mkCard("c1", "red", "ju", "upper"), mkCard("c2", "red", "ju", "upper")]],
  ]);
  room.pendingResponse = { ownerId: "A", card: mkCard("target", "red", "ju", "upper"), collectives: new Map() };
  room.state.responsePhase = "collective";
  room.collectiveQueue = ["B", "C", "D", "A"];
  room.collectiveCursor = 0;
  room.collectiveResponderId = "B";
  room.collectiveResponseEndsAt = Date.now() + 3_000;
  room.seatBySession.set("session-B", "B");
  let resolved = false;
  room.resolveCollectivePhase = () => { resolved = true; };
  const candidateId = room.getAvailableActions("B").find((item: any) => item.action === "peng")?.candidates?.[0]?.id;
  room.handleAction({ sessionId: "session-B", send: () => {} }, { action: "peng", candidateId });
  assert.equal(resolved, false);
  assert.equal(room.collectiveResponderId, "C");
  room.clearCollectiveTimer();
});

test("a hu candidate resolves as soon as an earlier blocker explicitly chooses peng", () => {
  const room = mkRoomWithSeats(["A", "B", "C", "D"]);
  room.playerHands = new Map([
    ["B", [mkCard("b1", "red", "ju", "upper"), mkCard("b2", "red", "ju", "upper")]],
  ]);
  room.pendingResponse = {
    ownerId: "A",
    card: mkCard("target", "red", "ju", "upper"),
    collectives: new Map([["C", { action: "hu" }]]),
  };
  room.state.responsePhase = "collective";
  room.collectiveQueue = ["B", "C", "D", "A"];
  room.collectiveCursor = 0;
  room.collectiveResponderId = "B";
  room.collectiveResponseEndsAt = Date.now() + 3_000;
  room.seatBySession.set("session-B", "B");
  let resolvedWinner = "";
  room.executeResponseWinner = (seatId: string) => {
    resolvedWinner = seatId;
  };
  const actions = room.getAvailableActions("B");
  assert.equal(actions.some((item: any) => item.action === "hu" && item.enabled), true);
  const candidateId = actions.find((item: any) => item.action === "peng")?.candidates?.[0]?.id;

  room.handleAction(
    { sessionId: "session-B", send: () => {} },
    { action: "peng", candidateId },
  );

  assert.equal(resolvedWinner, "C");
  assert.equal(room.collectiveResponseEndsAt, 0);
});

test("a collective responder with a meaningful choice still receives Pass", () => {
  const room = mkRoomWithSeats(["A", "B", "C", "D"]);
  room.collectiveResponseWindowMs = 40;
  room.playerHands.set("B", [
    mkCard("peng-1", "red", "ju", "upper"),
    mkCard("peng-2", "red", "ju", "upper"),
    mkCard("spare", "green", "ma", "upper"),
  ]);
  room.pendingResponse = {
    ownerId: "A",
    card: mkCard("peng-target", "red", "ju", "upper"),
    collectives: new Map(),
  };
  room.state.responsePhase = "collective";
  room.collectiveResponderId = "B";

  const actions = room.buildClientDecisionView("B").availableActions;
  assert.equal(actions.some((entry: { action: string }) => entry.action === "peng"), true);
  assert.equal(actions.some((entry: { action: string }) => entry.action === "pass"), true);
});

test("the prepared receiver sees Chi only after the collective window becomes local", () => {
  const room = mkRoomWithSeats(["A", "B", "C", "D"]);
  room.playerHands.set("B", [
    mkCard("chi-ju", "yellow", "ju", "upper"),
    mkCard("chi-ma", "yellow", "ma", "upper"),
    mkCard("spare", "green", "shi", "upper"),
  ]);
  room.pendingResponse = {
    ownerId: "A",
    card: mkCard("chi-target", "yellow", "pao", "upper"),
    collectives: new Map(),
  };
  room.state.responsePhase = "collective";
  room.collectiveQueue = ["B", "C", "D", "A"];
  room.collectiveResponderId = "B";

  assert.equal(
    room.getAvailableActions("B").find((entry: any) => entry.action === "chi")?.deferred,
    true,
  );
  assert.deepEqual(room.buildClientDecisionView("B").availableActions, []);

  room.enterOwnerLocalPhaseAfterNoResponse("A");
  assert.equal(room.state.responsePhase, "local_upper");
  assert.equal(
    room.buildClientDecisionView("B").availableActions.some((entry: any) => entry.action === "chi"),
    true,
  );
  room.clearCollectiveTimer();
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
  room.localTimeoutMs = 1_000;
  room.pendingResponse = {
    ownerId: "B",
    card: mkCard("x", "red", "ju", "upper"),
    collectives: new Map(),
  };
  room.state.responsePhase = "local_upper";
  const startedAt = Date.now();
  room.tickBots();

  assert.equal(room.state.responseEndsAt >= startedAt + 900, true);
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

test("collective hu is disabled when it would split a declared hidden triplet", () => {
  const room = mkRoomWithSeats(["A", "B", "C", "D"]);
  const player = room.state.players.get("B");
  assert.ok(player);
  player.declaredKongs = 1;
  room.playerHands.set("B", [
    mkCard("yzu1", "yellow", "zu", "upper"),
    mkCard("yzu2", "yellow", "zu", "upper"),
    mkCard("rzu1", "red", "zu", "upper"),
    mkCard("gzu1", "green", "zu", "upper"),
    mkCard("wzu1", "white", "zu", "upper"),
    mkCard("wzu2", "white", "zu", "upper"),
    mkCard("wzu3", "white", "zu", "upper"),
  ]);
  room.pendingResponse = {
    ownerId: "A",
    card: mkCard("rj1", "red", "jiang", "upper"),
    collectives: new Map(),
  };
  room.state.responsePhase = "collective";
  room.collectiveResponderId = "B";

  const hu = room.getAvailableActions("B").find((action: { action: string }) => action.action === "hu");
  assert.equal(hu?.enabled, false);
});

test("a delayed action from an older decision window is ignored", () => {
  const room = mkRoomWithSeats(["A", "B", "C", "D"]);
  room.pendingResponse = {
    ownerId: "A",
    card: mkCard("response", "red", "ju", "upper"),
    collectives: new Map(),
  };
  room.state.responsePhase = "collective";
  room.collectiveResponderId = "B";
  room.responseDecisionWindowId = 12;
  room.seatBySession.set("session-B", "B");
  const sent: Array<{ event: string; payload: any }> = [];
  const client = {
    sessionId: "session-B",
    send: (event: string, payload: any) => sent.push({ event, payload }),
  };

  room.handleAction(client, { action: "pass", decisionKey: "play:11" });

  assert.equal(room.pendingResponse.collectives.size, 0);
  assert.equal(room.collectiveResponderId, "B");
  assert.deepEqual(
    sent.find((message) => message.event === "action_rejected")?.payload,
    {
      reason: "stale_decision",
      decisionKey: "play:12",
      message: "牌局已经继续，操作已为你刷新。",
    },
  );
});

test("a valid action gets an authoritative receipt before the room advances", () => {
  const room = mkRoomWithSeats(["A", "B", "C", "D"]);
  room.pendingResponse = {
    ownerId: "A",
    card: mkCard("response", "red", "ju", "upper"),
    collectives: new Map(),
  };
  room.state.responsePhase = "collective";
  room.collectiveResponderId = "B";
  room.responseDecisionWindowId = 12;
  room.seatBySession.set("session-B", "B");
  room.advanceCollectivePolling = () => undefined;
  const sent: Array<{ event: string; payload: any }> = [];
  const client = {
    sessionId: "session-B",
    send: (event: string, payload: any) => sent.push({ event, payload }),
  };

  room.handleAction(client, { action: "pass", decisionKey: "play:12" });

  assert.deepEqual(room.pendingResponse.collectives.get("B"), { action: "pass", candidateId: undefined });
  assert.deepEqual(
    sent.find((message) => message.event === "action_received")?.payload,
    {
      action: "pass",
      decisionKey: "play:12",
      message: "操作已收到，正在继续牌局。",
    },
  );

  room.handleAction(client, { action: "pass", decisionKey: "play:12" });
  assert.equal(room.pendingResponse.collectives.size, 1);
  assert.equal(
    sent.filter((message) => message.event === "action_received").length,
    1,
  );
  assert.equal(
    sent.at(-1)?.event,
    "available_actions",
  );
  assert.deepEqual(sent.at(-1)?.payload?.items, []);
});

test("a delayed discard from an older decision window cannot remove a card", () => {
  const room = mkRoomWithSeats(["A", "B", "C", "D"]);
  const discard = mkCard("discard", "yellow", "ma", "draw");
  room.playerHands.set("A", [discard]);
  room.pendingResponse = {
    ownerId: "A",
    card: mkCard("draw", "green", "ju", "draw"),
    collectives: new Map(),
  };
  room.state.responsePhase = "local_draw";
  room.state.currentPlayerId = "A";
  room.awaitingDiscardOwnerId = "A";
  room.responseDecisionWindowId = 21;
  room.seatBySession.set("session-A", "A");
  const sent: Array<{ event: string; payload: any }> = [];
  const client = {
    sessionId: "session-A",
    send: (event: string, payload: any) => sent.push({ event, payload }),
  };

  room.handleDiscardCard(client, { cardId: discard.id, decisionKey: "play:20" });

  assert.deepEqual(room.playerHands.get("A")?.map((card: Card) => card.id), [discard.id]);
  assert.equal(room.state.players.get("A")?.discardPile.length, 0);
  assert.equal(
    sent.find((message) => message.event === "action_rejected")?.payload?.message,
    "牌局已经继续，操作已为你刷新。",
  );
});

test("a valid discard gets an authoritative receipt", () => {
  const room = mkRoomWithSeats(["A", "B", "C", "D"]);
  const discard = mkCard("discard", "yellow", "ma", "draw");
  room.playerHands.set("A", [discard]);
  room.pendingResponse = {
    ownerId: "A",
    card: mkCard("draw", "green", "ju", "draw"),
    collectives: new Map(),
  };
  room.state.responsePhase = "local_draw";
  room.state.currentPlayerId = "A";
  room.awaitingDiscardOwnerId = "A";
  room.responseDecisionWindowId = 21;
  room.seatBySession.set("session-A", "A");
  room.clearCollectiveTimer = () => undefined;
  room.beginCollectiveFromDiscard = () => undefined;
  const sent: Array<{ event: string; payload: any }> = [];
  const client = {
    sessionId: "session-A",
    send: (event: string, payload: any) => sent.push({ event, payload }),
  };

  room.handleDiscardCard(client, { cardId: discard.id, decisionKey: "play:21" });

  assert.deepEqual(
    sent.find((message) => message.event === "action_received")?.payload,
    {
      action: "discard",
      decisionKey: "play:21",
      message: "操作已收到，正在继续牌局。",
    },
  );
});

test("practice keeps connected human decisions untimed while bot decisions still advance", () => {
  const room = mkRoomWithSeats(["A", "B", "C", "D"]);
  room.state.roomMode = "practice";
  room.state.phase = "declaring";
  room.state.players.get("A").connected = true;
  room.playerHands.set("A", [
    mkCard("a-kan-1", "red", "ma", "upper"),
    mkCard("a-kan-2", "red", "ma", "upper"),
    mkCard("a-kan-3", "red", "ma", "upper"),
  ]);
  for (const seatId of ["B", "C", "D"]) {
    room.state.players.get(seatId).isBot = true;
    room.botIds.add(seatId);
  }

  room.startDeclaringPhase();
  const declareTimer = room.buildDecisionTimerSnapshot("A");
  assert.equal(declareTimer.untimed, true);
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

  room.pendingResponse = {
    ownerId: "B",
    card: mkCard("collective-target", "red", "ju", "upper"),
    collectives: new Map(),
  };
  room.state.responsePhase = "collective";
  room.collectiveResponderId = "A";
  room.collectiveResponseEndsAt = Date.now() + 3_000;
  room.state.responseEndsAt = room.collectiveResponseEndsAt;
  room.responseTimerTotalMs = 3_000;
  const collectiveTurn = room.buildDecisionTimerSnapshot("A");
  assert.equal(collectiveTurn.untimed, false);
  assert.equal(collectiveTurn.totalMs, 3_000);

  room.state.players.get("A").connected = false;
  room.state.players.get("A").isBot = true;
  room.botIds.add("A");
  room.state.responsePhase = "local_draw";
  room.pendingResponse.ownerId = "A";
  room.scheduleCollectiveTimeout();
  const botTurn = room.buildDecisionTimerSnapshot("A");
  assert.equal(botTurn.untimed, false);
  assert.equal(botTurn.endsAt > Date.now(), true);
  assert.notEqual(room.collectiveTimer, null);
  room.clearCollectiveTimer();
});

test("fish declaration hides faces, removes selected cards, then asks for the exact kong quota", () => {
  const room = mkRoomWithSeats(["A", "B", "C", "D"]);
  room.state.phase = "declaring";
  const fish = [1, 2, 3, 4].map((index) => mkCard(`fish-${index}`, "white", "pao", "upper"));
  const kong = [1, 2, 3].map((index) => mkCard(`kong-${index}`, "red", "ma", "upper"));
  room.playerHands.set("A", [...fish, ...kong]);

  room.submitFishDeclaration("A", { fishCardIds: fish.map((card) => card.id) });

  const player = room.state.players.get("A");
  assert.equal(player.declarationStep, "kong");
  assert.equal(player.declaredReady, false);
  assert.deepEqual(Array.from(player.pendingFishGroupSizes), [4]);
  assert.equal(player.fishArea.length, 0);
  assert.deepEqual(room.playerHands.get("A").map((card: Card) => card.id), kong.map((card) => card.id));
  assert.deepEqual(room.pendingFishDeclarations.get("A").map((card: Card) => card.id), fish.map((card) => card.id));

  room.submitKongDeclaration("A", 0);
  assert.equal(player.declarationStep, "done");
  assert.equal(player.declaredReady, true);
  assert.equal(player.declaredKongs, 0);
});

test("empty declaration steps are skipped without waiting for a client panel", () => {
  const room = mkRoomWithSeats(["A", "B", "C", "D"]);
  room.state.phase = "declaring";
  for (const seatId of ["A", "B", "C", "D"]) room.playerHands.set(seatId, []);

  room.startDeclaringPhase();

  assert.notEqual(room.state.phase, "declaring");
  for (const seatId of ["A", "B", "C", "D"]) {
    const player = room.state.players.get(seatId);
    assert.equal(player.declarationStep, "done");
    assert.equal(player.declaredReady, true);
  }
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

test("a later collective responder can see and queue a valid action early", () => {
  const actions = getAvailableActionsFlow({
    phase: "playing",
    seatId: "C",
    pending: { ownerId: "A", card: mkCard("p1", "red", "ju", "upper") },
    responsePhase: "collective",
    collectiveResponderId: "B",
    allowCollectivePreselection: true,
    awaitingDiscardOwnerId: null,
    hand: [
      mkCard("h1", "red", "ju", "upper"),
      mkCard("h2", "red", "ju", "upper"),
    ],
    wildcardPool: [],
    explainHuForSeat: () => ({ valid: false }),
    logHuCheck: () => undefined,
    getHandWithoutPending: (_seat, _pending) => [],
    getNextPlayerId: () => "B",
  });

  assert.equal(actions.find((item) => item.action === "peng")?.enabled, true);
  assert.equal(actions.find((item) => item.action === "pass")?.enabled, true);
  assert.equal(
    decideActionDispatch({
      pendingOwnerId: "A",
      seatId: "C",
      action: "peng",
      enabledActions: ["peng", "pass"],
      responsePhase: "collective",
      collectiveResponderId: "B",
      canCollectivePreselect: true,
      awaitingDiscardOwnerId: null,
    }),
    "collective_accept",
  );
});

test("a later collective responder cannot act without preselection authority", () => {
  assert.equal(
    decideActionDispatch({
      pendingOwnerId: "A",
      seatId: "C",
      action: "peng",
      enabledActions: ["peng", "pass"],
      responsePhase: "collective",
      collectiveResponderId: "B",
      canCollectivePreselect: false,
      awaitingDiscardOwnerId: null,
    }),
    "ignore",
  );
});

test("online manual hu, kai or peng selects ten seconds; passive multiplayer keeps three", () => {
  const room = mkRoomWithSeats(["A", "B", "C", "D"]);
  room.collectiveResponseWindowMs = undefined;
  room.pendingResponse = { ownerId: "A", card: mkCard("window", "red", "ju", "upper"), collectives: new Map() };
  room.state.responsePhase = "collective";
  for (const id of ["A", "B", "C", "D"]) room.state.players.get(id).connected = id === "A" || id === "B";
  for (const action of ["hu", "kai", "peng"]) {
    room.getAvailableActions = (id: string) => [{ action: id === "B" ? action : "pass", enabled: true }];
    assert.equal(room.currentCollectiveResponseWindowMs(), 10_000, action);
  }
  const b = room.state.players.get("B");
  b.isAutoPlay = true;
  assert.equal(room.currentCollectiveResponseWindowMs(), 3_000);
  b.isAutoPlay = false;
  b.connected = false;
  assert.equal(room.currentCollectiveResponseWindowMs(), 0);
  b.connected = true;
  b.isConfiguredBot = true;
  assert.equal(room.currentCollectiveResponseWindowMs(), 0);
  b.isConfiguredBot = false;
  room.getAvailableActions = () => [{ action: "pass", enabled: true }];
  assert.equal(room.currentCollectiveResponseWindowMs(), 3_000);
  room.playerHands.set("B", [mkCard("ju1", "red", "ju", "upper"), mkCard("ju2", "red", "ju", "upper")]);
});

test("the ten-second window stays fixed across polling and timer rescheduling", () => {
  const room = mkRoomWithSeats(["A", "B", "C", "D"]);
  room.collectiveResponseWindowMs = undefined;
  room.state.responsePhase = "collective";
  room.pendingResponse = { ownerId: "A", card: mkCard("window", "red", "ju", "upper"), collectives: new Map() };
  room.state.players.get("B").connected = true;
  room.playerHands.set("B", [mkCard("ju1", "red", "ju", "upper"), mkCard("ju2", "red", "ju", "upper")]);
  room.startCollectivePolling();
  const end = room.collectiveResponseEndsAt;
  assert.ok(end >= Date.now() + 9_900);
  assert.equal(room.buildDecisionTimerSnapshot("B").totalMs, 10_000);
  room.startCollectivePolling();
  room.scheduleCollectiveTimeout(undefined, true);
  assert.equal(room.collectiveResponseEndsAt, end);
  assert.equal(room.buildDecisionTimerSnapshot("B").totalMs, 10_000);
  room.clearCollectiveTimer();
});

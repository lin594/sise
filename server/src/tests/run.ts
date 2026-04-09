import assert from "node:assert/strict";
import { canChi, canKai, canPeng, findKaiPlan, getChiPlans } from "../rules/actions.js";
import { explainHu, validateHu } from "../rules/hu.js";
import type { Card } from "../rules/types.js";
import { buildRoundResultPlayers } from "../rooms/flow/match-runtime.js";
import { createRoomStateOps } from "../rooms/flow/room-state-ops.js";
import { FourColorGameRoom } from "../rooms/GameRoom.js";
import { GameState, PlayerState } from "../schema/game-state.schema.js";

type TestFn = () => void;

const tests: Array<{ name: string; fn: TestFn }> = [];

function t(name: string, fn: TestFn) {
  tests.push({ name, fn });
}

function c(id: string, color: Card["color"], type: Card["type"], source?: "upper" | "draw"): Card {
  return source ? { id, color, type, source } : { id, color, type };
}

t("actions: kai requires 3 exact cards", () => {
  const response = c("rj", "red", "ju");
  const hand = [c("rj1", "red", "ju"), c("rj2", "red", "ju")];
  const pool = [c("wj", "white", "jiang")];
  assert.equal(canKai(hand, response, pool), false);
});

t("actions: kai exact triplet is valid", () => {
  const response = c("rj", "red", "ju");
  const hand = [c("rj1", "red", "ju"), c("rj2", "red", "ju"), c("rj3", "red", "ju")];
  assert.equal(canKai(hand, response, []), true);
  const plan = findKaiPlan(hand, response, []);
  assert.ok(plan);
  assert.equal(plan!.handCards.length, 3);
  assert.equal(plan!.poolCards.length, 0);
});

t("actions: peng does not consume wildcard", () => {
  const response = c("rj", "red", "ju");
  const hand = [c("rj1", "red", "ju"), c("wj", "white", "jiang")];
  assert.equal(canPeng(hand, response), false);
});

t("room-state-ops: upgrade pair group to triplet in-place", () => {
  const state = new GameState();
  const player = new PlayerState();
  player.clientId = "B";
  player.name = "B";
  state.players.set("B", player);
  const ops = createRoomStateOps(state, new Map(), () => null);
  const p1 = c("rj1", "red", "ju");
  const p2 = c("rj2", "red", "ju");
  const pending = c("rj3", "red", "ju", "upper");
  player.exposedArea.push(ops.toSchemaCard(p1, false, "upper"));
  player.exposedArea.push(ops.toSchemaCard(p2, false, "upper"));
  player.exposedGroupSizes.push(2);

  const ok = ops.upgradeExposedPairToTriplet("B", [p1, p2], pending, true);

  assert.equal(ok, true);
  assert.deepEqual([...player.exposedGroupSizes], [3]);
  assert.equal(player.exposedArea.length, 3);
  assert.equal(player.exposedArea[2].id, "rj3");
});

t("room-state-ops: upgrade targets matching pair when multiple groups exist", () => {
  const state = new GameState();
  const player = new PlayerState();
  player.clientId = "B";
  player.name = "B";
  state.players.set("B", player);
  const ops = createRoomStateOps(state, new Map(), () => null);
  const a1 = c("rj1", "red", "ju");
  const a2 = c("rj2", "red", "ju");
  const b1 = c("gm1", "green", "ma");
  const b2 = c("gm2", "green", "ma");
  const pending = c("gm3", "green", "ma", "upper");
  player.exposedArea.push(ops.toSchemaCard(a1, false, "upper"));
  player.exposedArea.push(ops.toSchemaCard(a2, false, "upper"));
  player.exposedArea.push(ops.toSchemaCard(b1, false, "upper"));
  player.exposedArea.push(ops.toSchemaCard(b2, false, "upper"));
  player.exposedGroupSizes.push(2);
  player.exposedGroupSizes.push(2);

  const ok = ops.upgradeExposedPairToTriplet("B", [b1, b2], pending, true);

  assert.equal(ok, true);
  assert.deepEqual([...player.exposedGroupSizes], [2, 3]);
  assert.equal(player.exposedArea[0].id, "rj1");
  assert.equal(player.exposedArea[1].id, "rj2");
  assert.equal(player.exposedArea[2].id, "gm1");
  assert.equal(player.exposedArea[3].id, "gm2");
  assert.equal(player.exposedArea[4].id, "gm3");
});

t("actions: chi no longer supports wildcard completion", () => {
  const response = c("rj", "red", "ju");
  const hand = [c("rm", "red", "ma")];
  const pool = [c("g1", "gold", "gong")];
  assert.equal(canChi(hand, response, pool), false);
});

t("actions: chi frame cannot consume two wildcards in one group", () => {
  const response = c("rj", "red", "ju");
  const hand: Card[] = [];
  const pool = [c("w1", "white", "jiang"), c("g1", "gold", "gong")];
  assert.equal(canChi(hand, response, pool), false);
});

t("actions: kai still rejects one exact + two wildcards", () => {
  const response = c("rj", "red", "ju");
  const hand = [c("rj1", "red", "ju"), c("w1", "white", "jiang"), c("g1", "gold", "gong")];
  assert.equal(canKai(hand, response, []), false);
});

t("actions: chi pair rejects jiang response", () => {
  const response = c("rj", "red", "jiang");
  const hand = [c("rj2", "red", "jiang")];
  const plans = getChiPlans(hand, response, []);
  assert.equal(plans.some((x) => x.kind === "pair"), false);
});

t("actions: chi single supports jiang response", () => {
  const response = c("rj", "red", "jiang");
  const plans = getChiPlans([], response, []);
  assert.equal(plans.some((x) => x.kind === "single"), true);
});

t("actions: chi single supports gold response", () => {
  const response = c("g1", "gold", "gong");
  const plans = getChiPlans([], response, []);
  assert.equal(plans.some((x) => x.kind === "single"), true);
});

t("actions: chi jsx supports jiang response with shi-xiang in hand", () => {
  const response = c("rj", "red", "jiang");
  const hand = [c("rs1", "red", "shi"), c("rx1", "red", "xiang")];
  const plans = getChiPlans(hand, response, []);
  const jsx = plans.find((x) => x.kind === "jsx");
  assert.ok(jsx);
  assert.equal(jsx!.handCards.length, 2);
});

t("actions: chi pair rejects wildcard substitution from hand", () => {
  const response = c("rj", "red", "ju");
  const hand = [c("wj", "white", "jiang")];
  const plans = getChiPlans(hand, response, []);
  assert.equal(plans.some((x) => x.kind === "pair"), false);
});

t("actions: chi pair rejects wildcard substitution from pool", () => {
  const response = c("rj", "red", "ju");
  const hand: Card[] = [];
  const pool = [c("gold1", "gold", "gong")];
  const plans = getChiPlans(hand, response, pool);
  assert.equal(plans.some((x) => x.kind === "pair"), false);
});

t("actions: chi pair with two exact cards consumes two from hand", () => {
  const response = c("rj", "red", "ju");
  const hand = [c("rj1", "red", "ju"), c("rj2", "red", "ju")];
  const plans = getChiPlans(hand, response, []);
  const pair = plans.find((x) => x.kind === "pair");
  assert.ok(pair);
  assert.equal(pair!.handCards.length, 2);
  assert.equal(pair!.poolCards.length, 0);
});

t("hu: single jiang is valid", () => {
  const result = explainHu([], c("rj", "red", "jiang"));
  assert.equal(result.valid, true);
});

t("hu: jiang+shi+xiang frame is valid (将士象架)", () => {
  const hand = [c("rs", "red", "shi"), c("rx", "red", "xiang")];
  const response = c("rj", "red", "jiang");
  const result = explainHu(hand, response);
  assert.equal(result.valid, true);
  assert.ok(result.groups.includes("FrameJSX"));
});

t("hu: mixed-color jiang+shi+xiang is invalid", () => {
  const hand = [c("rs", "red", "shi"), c("gx", "green", "xiang")];
  const response = c("rj", "red", "jiang");
  const result = explainHu(hand, response);
  assert.equal(result.valid, false);
});

t("hu: wildcard pool no longer participates in substitution", () => {
  const hand = [c("rju", "red", "ju"), c("rma", "red", "ma")];
  const response = c("yzu", "yellow", "zu");
  const wildcardPool = [c("wj", "white", "jiang")];
  const result = explainHu(hand, response, { wildcardPool });
  assert.equal(result.valid, false);
});

t("hu: numeric wildcard option kept but ignored", () => {
  const hand = [c("rju", "red", "ju")];
  const response = c("rma", "red", "ma");
  assert.equal(validateHu(hand, response, 1), false);
});

t("hu: multiple single jiang groups are allowed", () => {
  const result = explainHu([c("rj1", "red", "jiang")], c("rj2", "red", "jiang"));
  assert.equal(result.valid, true);
  assert.equal(result.groups.filter((x) => x === "SingleJiang").length, 2);
});

t("round_result: non-winner exposed triplet still scores", () => {
  const state = new GameState();
  const winner = new PlayerState();
  winner.clientId = "A";
  winner.name = "A";
  const other = new PlayerState();
  other.clientId = "B";
  other.name = "B";
  state.players.set("A", winner);
  state.players.set("B", other);
  const hands = new Map<string, Card[]>([
    ["A", []],
    ["B", []],
  ]);
  const ops = createRoomStateOps(state, hands, () => null);
  other.exposedArea.push(ops.toSchemaCard(c("rj1", "red", "ju"), false, "upper"));
  other.exposedArea.push(ops.toSchemaCard(c("rj2", "red", "ju"), false, "upper"));
  other.exposedArea.push(ops.toSchemaCard(c("rj3", "red", "ju"), false, "upper"));
  other.exposedGroupSizes.push(3);

  const players = buildRoundResultPlayers(
    ["A", "B"],
    state.players,
    hands,
    (card) => ops.toPlainCard(card),
    "A",
    ["SingleJiang"],
  );
  const seatB = players.find((item) => item.clientId === "B");
  assert.ok(seatB);
  assert.equal(seatB!.totalScore, 3);
  assert.equal(seatB!.scoreBreakdown.some((item) => item.key === "Triplet" && item.total === 3), true);
});

function mkRoom(seats: string[]) {
  const room = new FourColorGameRoom() as any;
  const state = new GameState();
  for (const seat of seats) {
    const p = new PlayerState();
    p.clientId = seat;
    p.name = seat;
    state.players.set(seat, p);
  }
  room.state = state;
  room.playerOrder = [...seats];
  room.state.phase = "playing";
  room.collectiveTimeoutMs = 5;
  room.localTimeoutMs = 5;
  room.operationTimeoutMs = 5;
  return room;
}

t("room: collective draw order starts from owner", () => {
  const room = mkRoom(["A", "B", "C", "D"]);
  const order = room.getCollectiveOrder({
    ownerId: "A",
    card: c("x", "red", "ju", "draw"),
    collectives: new Map(),
  });
  assert.deepEqual(order, ["A", "B", "C", "D"]);
});

t("room: collective upper order starts from next and includes owner", () => {
  const room = mkRoom(["A", "B", "C", "D"]);
  const order = room.getCollectiveOrder({
    ownerId: "A",
    card: c("x", "red", "ju", "upper"),
    collectives: new Map(),
  });
  assert.deepEqual(order, ["B", "C", "D", "A"]);
});

t("room: no-response on upper enters local_upper for next player", () => {
  const room = mkRoom(["A", "B", "C", "D"]);
  room.pendingResponse = {
    ownerId: "A",
    card: c("x", "red", "ju", "upper"),
    collectives: new Map(),
  };
  room.enterOwnerLocalPhaseAfterNoResponse("A");
  assert.equal(room.state.responsePhase, "local_upper");
  assert.equal(room.state.currentPlayerId, "B");
});

t("room: collective action probing no longer depends on current responder", () => {
  const room = mkRoom(["A", "B", "C", "D"]);
  room.pendingResponse = {
    ownerId: "A",
    card: c("resp", "red", "ju", "upper"),
    collectives: new Map(),
  };
  room.state.responsePhase = "collective";
  room.collectiveResponderId = null;
  room.playerHands.set("B", [c("rj1", "red", "ju"), c("rj2", "red", "ju")]);
  assert.equal(room.hasCollectiveActionBeyondPass("B"), true);
});

t("room: collective conflict resolves by polling order for same priority", () => {
  const room = mkRoom(["A", "B", "C", "D"]);
  room.pendingResponse = {
    ownerId: "A",
    card: c("x", "red", "ju", "upper"),
    collectives: new Map<string, { action: string }>([
      ["B", { action: "kai" }],
      ["C", { action: "kai" }],
      ["D", { action: "pass" }],
      ["A", { action: "pass" }],
    ]),
  };
  let resolved: { id: string; action: string } | null = null;
  room.executeResponseWinner = (id: string, choice: { action: string }) => {
    resolved = { id, action: choice.action };
  };
  room.resolveCollectivePhase();
  assert.deepEqual(resolved, { id: "B", action: "kai" });
});

t("room: collective priority uses hu over kai/peng", () => {
  const room = mkRoom(["A", "B", "C", "D"]);
  room.pendingResponse = {
    ownerId: "A",
    card: c("x", "red", "ju", "upper"),
    collectives: new Map<string, { action: string }>([
      ["B", { action: "kai" }],
      ["C", { action: "hu" }],
      ["D", { action: "peng" }],
      ["A", { action: "pass" }],
    ]),
  };
  let resolved: { id: string; action: string } | null = null;
  room.executeResponseWinner = (id: string, choice: { action: string }) => {
    resolved = { id, action: choice.action };
  };
  room.resolveCollectivePhase();
  assert.deepEqual(resolved, { id: "C", action: "hu" });
});

t("room: force-take draw wildcard can directly win when no legal discard", () => {
  const room = mkRoom(["A", "B", "C", "D"]);
  room.playerHands.set("A", []);
  room.pendingResponse = {
    ownerId: "A",
    card: c("w1", "white", "jiang", "draw"),
    collectives: new Map(),
  };
  room.enterOwnerLocalPhaseAfterNoResponse("A");
  assert.equal(room.state.phase, "ended");
  assert.match(String(room.state.lastAction), /^A HU$/);
});

t("room: local chi enters manual discard stage instead of auto discard", () => {
  const room = mkRoom(["A", "B", "C", "D"]);
  room.pendingResponse = {
    ownerId: "B",
    card: c("resp", "red", "ju", "upper"),
    collectives: new Map(),
  };
  room.state.responsePhase = "local_upper";
  room.state.currentPlayerId = "B";
  room.playerHands.set("B", [c("rj1", "red", "ju"), c("ym1", "yellow", "ma")]);
  room.seatBySession.set("sessB", "B");
  const client = { sessionId: "sessB", send: () => {} };
  const candidateId = room
    .getAvailableActions("B")
    .find((item: any) => item.action === "chi")
    ?.candidates?.[0]?.id;
  assert.ok(candidateId);

  room.handleAction(client, { action: "chi", candidateId });

  assert.equal(room.awaitingDiscardOwnerId, "B");
  assert.equal(room.state.responsePhase, "local_draw");
  assert.equal(room.state.phase, "playing");
  assert.equal(room.state.players.get("B")?.discardPile.length ?? 0, 0);
});

t("room: local upper pass draws new target without adding to hand", () => {
  const room = mkRoom(["A", "B", "C", "D"]);
  room.pendingResponse = {
    ownerId: "B",
    card: c("resp", "red", "ju", "upper"),
    collectives: new Map(),
  };
  room.state.responsePhase = "local_upper";
  room.playerHands.set("B", [c("ym1", "yellow", "ma")]);
  room.deck = [
    c("draw1", "green", "pao", "draw"),
    c("draw2", "white", "zu", "draw"),
    c("draw3", "red", "ma", "draw"),
    c("draw4", "yellow", "ju", "draw"),
    c("draw5", "green", "zu", "draw"),
    c("draw6", "white", "ju", "draw"),
    c("draw7", "red", "pao", "draw"),
    c("draw8", "yellow", "zu", "draw"),
    c("draw9", "green", "ma", "draw"),
    c("draw10", "white", "ma", "draw"),
  ];
  const before = (room.playerHands.get("B") ?? []).length;

  room.executeGrab("B");

  assert.equal((room.playerHands.get("B") ?? []).length, before);
  assert.equal(room.pendingResponse?.card.id, "draw1");
  assert.equal(room.pendingResponse?.card.source, "upper");
  assert.equal(room.pendingResponse?.ownerId, "B");
  assert.equal(room.pendingResponse?.responsePhaseAfterNoResponse, "local_draw");
  assert.equal(room.state.players.get("B")?.discardPile.length ?? 0, 0);
  assert.equal(room.state.currentPlayerId, "B");
  assert.equal(room.state.responsePhase, "local_draw");
});

t("room: zhua follow-up to single jiang enables local chi candidate", () => {
  const room = mkRoom(["A", "B", "C", "D"]);
  room.pendingResponse = {
    ownerId: "A",
    card: c("draw1", "red", "jiang", "upper"),
    collectives: new Map(),
    responsePhaseAfterNoResponse: "local_draw",
  };
  room.state.responsePhase = "collective";
  room.playerHands.set("B", [c("ym1", "yellow", "ma")]);
  room.enterOwnerLocalPhaseAfterNoResponse("A");

  const chi = room.getAvailableActions("B").find((item: any) => item.action === "chi");
  assert.equal(room.state.responsePhase, "local_draw");
  assert.equal(Boolean(chi?.enabled), true);
  assert.equal(chi?.candidates?.some((item: any) => item.kind === "single"), true);
});

t("room: zhua follow-up to jiang still offers jsx chi candidate", () => {
  const room = mkRoom(["A", "B", "C", "D"]);
  room.pendingResponse = {
    ownerId: "A",
    card: c("draw1", "red", "jiang", "upper"),
    collectives: new Map(),
    responsePhaseAfterNoResponse: "local_draw",
  };
  room.state.responsePhase = "collective";
  room.playerHands.set("B", [c("rs1", "red", "shi"), c("rx1", "red", "xiang")]);
  room.enterOwnerLocalPhaseAfterNoResponse("A");

  const chi = room.getAvailableActions("B").find((item: any) => item.action === "chi");
  assert.equal(chi?.candidates?.some((item: any) => item.kind === "jsx"), true);
});

t("room: local draw pass_to_next keeps recipient as next local upper owner", () => {
  const room = mkRoom(["A", "B", "C", "D"]);
  room.pendingResponse = {
    ownerId: "B",
    card: c("pass1", "white", "ju", "upper"),
    collectives: new Map(),
  };
  room.state.responsePhase = "local_draw";

  room.executePassToNext("B");

  assert.equal(room.pendingResponse?.ownerId, "C");
  assert.equal(room.state.responsePhase, "local_upper");
  assert.equal(room.state.currentPlayerId, "C");
});

t("room: collective kai enters discard stage instead of kong draw", () => {
  const room = mkRoom(["A", "B", "C", "D"]);
  room.pendingResponse = {
    ownerId: "A",
    card: c("resp", "red", "ju", "upper"),
    collectives: new Map(),
  };
  room.state.responsePhase = "collective";
  room.collectiveResponderId = "B";
  room.playerHands.set("B", [c("rj1", "red", "ju"), c("rj2", "red", "ju"), c("rj3", "red", "ju"), c("ym1", "yellow", "ma")]);
  const candidateId = room
    .getAvailableActions("B")
    .find((item: any) => item.action === "kai")
    ?.candidates?.[0]?.id;
  assert.ok(candidateId);

  room.executeResponseWinner("B", { action: "kai", candidateId });

  assert.equal(room.awaitingDiscardOwnerId, "B");
  assert.equal(room.state.responsePhase, "local_draw");
  assert.equal(room.state.currentPlayerId, "B");
  assert.equal(room.state.lastAction, "B KAI");
  assert.equal(room.state.players.get("B")?.discardPile.length ?? 0, 0);
});

t("room: entering discard stage with no legal card ends with winner instead of draw", () => {
  const room = mkRoom(["A", "B", "C", "D"]);
  room.playerHands.set("B", [c("w1", "white", "jiang"), c("rj1", "red", "jiang")]);
  room.enterDiscardStage("B", "CHI");
  assert.equal(room.state.phase, "ended");
  assert.match(String(room.state.lastAction), /^B HU$/);
});

t("room: human discard rejects gold cards", () => {
  const room = mkRoom(["A", "B", "C", "D"]);
  room.pendingResponse = {
    ownerId: "B",
    card: c("resp", "red", "ju", "draw"),
    collectives: new Map(),
  };
  room.state.responsePhase = "local_draw";
  room.awaitingDiscardOwnerId = "B";
  room.playerHands.set("B", [c("g1", "gold", "gong"), c("m1", "red", "ma")]);
  room.seatBySession.set("sessB", "B");
  const client = { sessionId: "sessB", send: () => {} };

  room.handleDiscardCard(client, { cardId: "g1" });

  assert.equal(room.state.players.get("B")?.discardPile.length ?? 0, 0);
  assert.equal((room.playerHands.get("B") ?? []).some((card: Card) => card.id === "g1"), true);
});

t("room: bot auto-discard skips gold cards", () => {
  const room = mkRoom(["A", "B", "C", "D"]);
  room.pendingResponse = {
    ownerId: "B",
    card: c("resp", "red", "ju", "draw"),
    collectives: new Map(),
  };
  room.state.responsePhase = "local_draw";
  room.awaitingDiscardOwnerId = "B";
  room.playerHands.set("B", [c("g1", "gold", "gong"), c("m1", "red", "ma")]);
  room.botIds.add("B");

  room.runBotStepNow();

  const top = room.state.players.get("B")?.discardPile[0];
  assert.ok(top);
  assert.equal(top!.color, "red");
  assert.equal(top!.id, "m1");
});

t("room: local human phase schedules response timeout", () => {
  const room = mkRoom(["A", "B", "C", "D"]);
  room.pendingResponse = {
    ownerId: "B",
    card: c("resp", "red", "ju", "upper"),
    collectives: new Map(),
  };
  room.state.responsePhase = "local_upper";
  room.state.currentPlayerId = "B";

  room.tickBots();

  assert.equal(room.state.responseEndsAt > Date.now(), true);
  assert.equal(Boolean(room.collectiveTimer), true);
  room.clearCollectiveTimer();
});

t("room: human collective peng without candidateId is rejected", () => {
  const room = mkRoom(["A", "B", "C", "D"]);
  room.playerHands.set("B", [c("rj1", "red", "ju"), c("rj2", "red", "ju")]);
  room.pendingResponse = {
    ownerId: "A",
    card: c("resp", "red", "ju", "upper"),
    collectives: new Map(),
  };
  room.state.responsePhase = "collective";
  room.collectiveResponderId = "B";
  room.advanceCollectivePolling = () => {};
  room.seatBySession.set("sessB", "B");
  const sent: Array<{ event: string; payload: any }> = [];
  const client = {
    sessionId: "sessB",
    send: (event: string, payload: any) => sent.push({ event, payload }),
  };

  room.handleAction(client, "peng");

  assert.equal(room.pendingResponse.collectives.has("B"), false);
  assert.equal(sent.some((x) => x.event === "action_rejected" && x.payload?.reason === "candidate_required"), true);
});

t("room: human collective peng with candidateId is accepted", () => {
  const room = mkRoom(["A", "B", "C", "D"]);
  room.playerHands.set("B", [c("rj1", "red", "ju"), c("rj2", "red", "ju")]);
  room.pendingResponse = {
    ownerId: "A",
    card: c("resp", "red", "ju", "upper"),
    collectives: new Map(),
  };
  room.state.responsePhase = "collective";
  room.collectiveResponderId = "B";
  room.advanceCollectivePolling = () => {};
  room.seatBySession.set("sessB", "B");
  const client = { sessionId: "sessB", send: () => {} };
  const candidateId = room
    .getAvailableActions("B")
    .find((item: any) => item.action === "peng")
    ?.candidates?.[0]?.id;
  assert.ok(candidateId);

  room.handleAction(client, { action: "peng", candidateId });

  assert.deepEqual(room.pendingResponse.collectives.get("B"), { action: "peng", candidateId });
});

t("room: human collective peng with invalid candidateId is rejected", () => {
  const room = mkRoom(["A", "B", "C", "D"]);
  room.playerHands.set("B", [c("rj1", "red", "ju"), c("rj2", "red", "ju")]);
  room.pendingResponse = {
    ownerId: "A",
    card: c("resp", "red", "ju", "upper"),
    collectives: new Map(),
  };
  room.state.responsePhase = "collective";
  room.collectiveResponderId = "B";
  room.advanceCollectivePolling = () => {};
  room.seatBySession.set("sessB", "B");
  const sent: Array<{ event: string; payload: any }> = [];
  const client = {
    sessionId: "sessB",
    send: (event: string, payload: any) => sent.push({ event, payload }),
  };

  room.handleAction(client, { action: "peng", candidateId: "bad-id" });

  assert.equal(room.pendingResponse.collectives.has("B"), false);
  assert.equal(sent.some((x) => x.event === "action_rejected" && x.payload?.reason === "invalid_candidate"), true);
});

t("room: bot collective auto-selects first candidate", () => {
  const room = mkRoom(["A", "B", "C", "D"]);
  room.pendingResponse = {
    ownerId: "A",
    card: c("resp", "red", "ju", "upper"),
    collectives: new Map(),
  };
  room.state.responsePhase = "collective";
  room.collectiveResponderId = "B";
  room.botIds.add("B");
  room.advanceCollectivePolling = () => {};
  room.getAvailableActions = () => [
    { action: "hu", enabled: false },
    { action: "kai", enabled: false },
    { action: "peng", enabled: true, candidates: [{ id: "bot-peng-1" }] },
    { action: "chi", enabled: false },
    { action: "pass", enabled: true },
  ];

  room.runBotStepNow();

  const choice = room.pendingResponse.collectives.get("B");
  assert.equal(choice?.action, "peng");
  assert.equal(choice?.candidateId, "bot-peng-1");
});

let failed = 0;
for (const item of tests) {
  try {
    item.fn();
    console.log(`PASS ${item.name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL ${item.name}`);
    console.error(err);
  }
}

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}

console.log(`\n${tests.length} test(s) passed`);

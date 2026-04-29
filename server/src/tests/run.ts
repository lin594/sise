import assert from "node:assert/strict";
import { canChi, canKai, canPeng, findKaiPlan, getChiPlans } from "../rules/actions.js";
import { explainHu, validateHu } from "../rules/hu.js";
import type { Card } from "../rules/types.js";
import {
  buildDeclarationSelection,
  buildDefaultDeclarationPayload,
  buildRoundResultPlayers,
  dealInitialHands,
} from "../rooms/flow/match-runtime.js";
import { createRoomStateOps } from "../rooms/flow/room-state-ops.js";
import { resolveDealerFromAnchorAndCard } from "../rooms/flow/support.js";
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

t("room-state-ops: auto discard prefers preserving complete groups over first available card", () => {
  const state = new GameState();
  const player = new PlayerState();
  player.clientId = "B";
  player.name = "B";
  state.players.set("B", player);
  const hands = new Map<string, Card[]>([
    ["B", [c("rj1", "red", "ju"), c("rj2", "red", "ju"), c("rj3", "red", "ju"), c("ym1", "yellow", "ma")]],
  ]);
  const ops = createRoomStateOps(state, hands, () => null);

  const discard = ops.pickDiscardCard("B");

  assert.ok(discard);
  assert.equal(discard!.id, "ym1");
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

t("hu: chooses highest scoring decomposition when several hu strategies exist", () => {
  const result = explainHu(
    [c("rp1", "red", "pao"), c("rp2", "red", "pao"), c("rp3", "red", "pao")],
    c("rp4", "red", "pao"),
  );
  assert.equal(result.valid, true);
  assert.deepEqual(result.groups, ["Quad"]);
});

t("dealer: public card determines dealer seat and enters dealer hand", () => {
  const order = ["A", "B", "C", "D"];
  assert.equal(resolveDealerFromAnchorAndCard(order, "A", c("dy", "yellow", "ju")), "A");
  assert.equal(resolveDealerFromAnchorAndCard(order, "A", c("dr", "red", "ju")), "B");
  assert.equal(resolveDealerFromAnchorAndCard(order, "A", c("dg", "green", "ju")), "C");
  assert.equal(resolveDealerFromAnchorAndCard(order, "A", c("dw", "white", "ju")), "D");
  assert.equal(resolveDealerFromAnchorAndCard(order, "A", c("dgold", "gold", "zi")), "B");

  const hands = new Map<string, Card[]>();
  const deck = Array.from({ length: 80 }, (_, index) => c(`c${index}`, "red", "ju"));
  dealInitialHands(order, deck, hands);
  for (const seatId of order) {
    assert.equal(hands.get(seatId)?.length ?? 0, 20);
  }
  const dealerCard = c("marker", "white", "ju");
  const dealerId = resolveDealerFromAnchorAndCard(order, "A", dealerCard);
  const dealerHand = hands.get(dealerId) ?? [];
  dealerHand.unshift(dealerCard);
  hands.set(dealerId, dealerHand);
  assert.equal(hands.get("D")?.[0]?.id, "marker");
  assert.equal(hands.get("D")?.length ?? 0, 21);
});

t("declaration: default declares fish and only non-overlapping hidden kans", () => {
  const hand = [
    c("wp1", "white", "pao"),
    c("wp2", "white", "pao"),
    c("wp3", "white", "pao"),
    c("wp4", "white", "pao"),
    c("rj1", "red", "ju"),
    c("rj2", "red", "ju"),
    c("rj3", "red", "ju"),
    c("gs1", "green", "shi"),
    c("gs2", "green", "shi"),
    c("gs3", "green", "shi"),
  ];
  const payload = buildDefaultDeclarationPayload(hand);
  assert.deepEqual(payload.fishCardIds.sort(), ["wp1", "wp2", "wp3", "wp4"]);
  assert.equal(payload.declaredKongs, 2);
});

t("declaration: four identical cards cannot count as both fish and hidden kan", () => {
  const hand = [
    c("wp1", "white", "pao"),
    c("wp2", "white", "pao"),
    c("wp3", "white", "pao"),
    c("wp4", "white", "pao"),
  ];
  const result = buildDeclarationSelection(hand, {
    declaredKongs: 1,
    fishCardIds: ["wp1", "wp2", "wp3", "wp4"],
  });
  assert.equal(result.fishValid, true);
  assert.equal(result.declaredKongs, 0);
});

t("round_result: hu winner collects from all three opponents", () => {
  const state = new GameState();
  for (const seat of ["A", "B", "C", "D"]) {
    const player = new PlayerState();
    player.clientId = seat;
    player.name = seat;
    state.players.set(seat, player);
  }
  const hands = new Map<string, Card[]>([
    ["A", []],
    ["B", []],
    ["C", []],
    ["D", []],
  ]);
  const ops = createRoomStateOps(state, hands, () => null);
  const players = buildRoundResultPlayers(
    ["A", "B", "C", "D"],
    state.players,
    hands,
    (card) => ops.toPlainCard(card),
    "A",
    ["GoldTriplet"],
  );
  const seatA = players.find((item) => item.clientId === "A");
  const seatB = players.find((item) => item.clientId === "B");
  const seatC = players.find((item) => item.clientId === "C");
  const seatD = players.find((item) => item.clientId === "D");
  assert.ok(seatA);
  assert.ok(seatB);
  assert.ok(seatC);
  assert.ok(seatD);
  assert.equal(seatA!.totalScore, 36);
  assert.equal(seatB!.totalScore, -12);
  assert.equal(seatC!.totalScore, -12);
  assert.equal(seatD!.totalScore, -12);
  assert.equal(seatA!.scoreBreakdown.some((item) => item.key.startsWith("HuWin:GoldTriplet") && item.total === 27), true);
  assert.equal(seatA!.scoreBreakdown.some((item) => item.key.startsWith("HuWin:GoldTriplet") && item.label === "金条坎"), true);
  assert.equal(seatB!.scoreBreakdown.some((item) => item.key.startsWith("HuLose:GoldTriplet") && item.label === "A 金条坎"), true);
});

t("round_result: exposed peng no longer counts as kan in mutual settlement", () => {
  const state = new GameState();
  for (const seat of ["A", "B", "C", "D"]) {
    const player = new PlayerState();
    player.clientId = seat;
    player.name = seat;
    state.players.set(seat, player);
  }
  const hands = new Map<string, Card[]>([
    ["A", []],
    ["B", []],
    ["C", []],
    ["D", []],
  ]);
  const ops = createRoomStateOps(state, hands, () => null);
  const seatBPlayer = state.players.get("B");
  assert.ok(seatBPlayer);
  seatBPlayer!.exposedArea.push(ops.toSchemaCard(c("rj1", "red", "ju"), false, "upper"));
  seatBPlayer!.exposedArea.push(ops.toSchemaCard(c("rj2", "red", "ju"), false, "upper"));
  seatBPlayer!.exposedArea.push(ops.toSchemaCard(c("rj3", "red", "ju"), false, "upper"));
  seatBPlayer!.exposedGroupSizes.push(3);

  const players = buildRoundResultPlayers(
    ["A", "B", "C", "D"],
    state.players,
    hands,
    (card) => ops.toPlainCard(card),
    "A",
    ["SingleJiang"],
  );
  const seatA = players.find((item) => item.clientId === "A");
  const seatB = players.find((item) => item.clientId === "B");
  const seatC = players.find((item) => item.clientId === "C");
  const seatD = players.find((item) => item.clientId === "D");
  assert.ok(seatA);
  assert.ok(seatB);
  assert.ok(seatC);
  assert.ok(seatD);
  assert.equal(seatA!.totalScore, 12);
  assert.equal(seatB!.totalScore, -4);
  assert.equal(seatC!.totalScore, -4);
  assert.equal(seatD!.totalScore, -4);
  assert.equal(seatB!.scoreBreakdown.filter((item) => item.key.startsWith("MutualGain:")).reduce((sum, item) => sum + item.total, 0), 0);
  assert.equal(seatB!.scoreBreakdown.some((item) => item.key.startsWith("HuLose:SingleJiang") && item.total === -1), true);
});

t("round_result: undeclared identical triplets settle as peng after declared hidden kans", () => {
  const state = new GameState();
  for (const seat of ["A", "B", "C", "D"]) {
    const player = new PlayerState();
    player.clientId = seat;
    player.name = seat;
    state.players.set(seat, player);
  }
  const owner = state.players.get("A");
  assert.ok(owner);
  owner!.declaredKongs = 2;
  const hands = new Map<string, Card[]>([
    [
      "A",
      [
        c("rj1", "red", "ju"),
        c("rj2", "red", "ju"),
        c("rj3", "red", "ju"),
        c("rj4", "red", "ju"),
        c("rj5", "red", "ju"),
        c("rj6", "red", "ju"),
        c("rj7", "red", "ju"),
        c("rj8", "red", "ju"),
        c("rj9", "red", "ju"),
      ],
    ],
    ["B", []],
    ["C", []],
    ["D", []],
  ]);
  const ops = createRoomStateOps(state, hands, () => null);
  const players = buildRoundResultPlayers(
    ["A", "B", "C", "D"],
    state.players,
    hands,
    (card) => ops.toPlainCard(card),
    null,
    [],
  );
  const seatA = players.find((item) => item.clientId === "A");
  assert.ok(seatA);
  const gains = seatA!.scoreBreakdown.filter((item) => item.key.startsWith("MutualGain:A:"));
  assert.equal(gains.filter((item) => item.label.includes("坎") && item.unit === 3).length, 6);
  assert.equal(gains.filter((item) => item.label.includes("碰") && item.unit === 1).length, 3);
  assert.equal(seatA!.totalScore, 21);
});

t("round_result: winner response gold is shown as winning group and hand leftovers do not inflate hu score", () => {
  const state = new GameState();
  for (const seat of ["A", "B", "C", "D"]) {
    const player = new PlayerState();
    player.clientId = seat;
    player.name = seat;
    state.players.set(seat, player);
  }
  const hands = new Map<string, Card[]>([
    [
      "A",
      [
        c("yj1", "yellow", "jiang"),
        c("yj2", "yellow", "jiang"),
        c("gj1", "green", "jiang"),
        c("wj2", "white", "jiang"),
        c("rz1", "red", "zu"),
        c("gz1", "green", "zu"),
        c("yz1", "yellow", "zu"),
        c("wj1", "white", "jiang"),
        c("ws1", "white", "shi"),
        c("wx1", "white", "xiang"),
      ],
    ],
    ["B", []],
    ["C", []],
    ["D", []],
  ]);
  const ops = createRoomStateOps(state, hands, () => null);
  const seatAPlayer = state.players.get("A");
  assert.ok(seatAPlayer);
  seatAPlayer!.generalArea.push(ops.toSchemaCard(c("rj_open", "red", "jiang"), false, "upper"));
  [
    [c("rs1", "red", "shi"), c("rs2", "red", "shi"), c("rs3", "red", "shi")],
    [c("gx1", "green", "xiang"), c("gx2", "green", "xiang"), c("gx3", "green", "xiang")],
    [c("yj3", "yellow", "ju"), c("yj4", "yellow", "ju"), c("yj5", "yellow", "ju")],
  ].forEach((group) => {
    group.forEach((card) => seatAPlayer!.exposedArea.push(ops.toSchemaCard(card, false, "upper")));
    seatAPlayer!.exposedGroupSizes.push(group.length);
    seatAPlayer!.exposedGroupKinds.push("peng");
  });

  const players = buildRoundResultPlayers(
    ["A", "B", "C", "D"],
    state.players,
    hands,
    (card) => ops.toPlainCard(card),
    "A",
    [],
    c("gold_zi_01", "gold", "zi", "upper"),
  );
  const winner = players.find((item) => item.clientId === "A");
  const loser = players.find((item) => item.clientId === "B");
  assert.ok(winner);
  assert.ok(loser);
  assert.equal(winner!.winningGroups.length, 1);
  assert.equal(winner!.winningGroups[0]?.cards[0]?.type, "zi");
  assert.equal(winner!.resolvedHandGroups.some((group) => group.cards.some((card) => card.type === "zi")), false);
  assert.equal(winner!.totalScore, 48);
  assert.equal(loser!.totalScore, -16);
});

t("round_result: winner response quad scores as kai without double-counting hidden kan", () => {
  const state = new GameState();
  for (const seat of ["A", "B", "C", "D"]) {
    const player = new PlayerState();
    player.clientId = seat;
    player.name = seat;
    state.players.set(seat, player);
  }
  const hands = new Map<string, Card[]>([
    ["A", [c("rp1", "red", "pao"), c("rp2", "red", "pao"), c("rp3", "red", "pao")]],
    ["B", []],
    ["C", []],
    ["D", []],
  ]);
  const ops = createRoomStateOps(state, hands, () => null);
  const players = buildRoundResultPlayers(
    ["A", "B", "C", "D"],
    state.players,
    hands,
    (card) => ops.toPlainCard(card),
    "A",
    [],
    c("rp4", "red", "pao"),
  );
  const winner = players.find((item) => item.clientId === "A");
  assert.ok(winner);
  assert.equal(winner!.winningGroups.some((group) => group.key === "Quad"), true);
  assert.equal(winner!.scoreBreakdown.some((item) => item.key.startsWith("HuWin:Quad") && item.label === "红炮开"), true);
  assert.equal(winner!.scoreBreakdown.some((item) => item.key.startsWith("HuWin:Triplet")), false);
  assert.equal(winner!.totalScore, 54);
});

t("round_result: winner response triplet from two hand cards scores as peng not hidden kan", () => {
  const state = new GameState();
  for (const seat of ["A", "B", "C", "D"]) {
    const player = new PlayerState();
    player.clientId = seat;
    player.name = seat;
    state.players.set(seat, player);
  }
  const hands = new Map<string, Card[]>([
    ["A", [c("wx1", "white", "xiang"), c("wx2", "white", "xiang")]],
    ["B", []],
    ["C", []],
    ["D", []],
  ]);
  const ops = createRoomStateOps(state, hands, () => null);
  const players = buildRoundResultPlayers(
    ["A", "B", "C", "D"],
    state.players,
    hands,
    (card) => ops.toPlainCard(card),
    "A",
    [],
    c("wx3", "white", "xiang"),
  );
  const winner = players.find((item) => item.clientId === "A");
  const loser = players.find((item) => item.clientId === "B");
  assert.ok(winner);
  assert.ok(loser);
  assert.equal(winner!.winningGroups.some((group) => group.key === "Peng"), true);
  assert.equal(winner!.scoreBreakdown.some((item) => item.key.startsWith("HuWin:Peng") && item.label === "白象碰" && item.unit === 1), true);
  assert.equal(winner!.scoreBreakdown.some((item) => item.key.startsWith("HuWin:Triplet")), false);
  assert.equal(winner!.totalScore, 12);
  assert.equal(loser!.totalScore, -4);
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

t("room: declaring finish immediately enters dealer discard stage after declarations", () => {
  const room = mkRoom(["A", "B", "C", "D"]);
  room.state.phase = "declaring";
  room.roundDealerId = "A";
  room.playerHands.set("A", [c("m1", "red", "ma")]);
  room.finishDeclaringPhase();
  assert.equal(room.state.phase, "playing");
  assert.equal(room.state.lastAction, "A OPENING_DISCARD");
  assert.equal(room.awaitingDiscardOwnerId, "A");
  assert.equal(room.pendingResponse?.ownerId, "A");
  assert.equal(room.state.responseEndsAt > 0, true);
  room.onDispose();
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

  assert.equal(room.pendingResponse?.ownerId, "B");
  assert.equal(room.state.responsePhase, "collective");
  assert.equal(room.state.currentPlayerId, "C");
  assert.equal(room.getAvailableActions("C").find((item: any) => item.action === "pass")?.deferred, true);

  room.seatBySession.set("sessC", "C");
  room.handleAction({ sessionId: "sessC", send: () => {} }, "pass");

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

  const discard = room.state.players.get("B")?.discardPile ?? [];
  const top = discard[discard.length - 1];
  assert.ok(top);
  assert.equal(top!.color, "red");
  assert.equal(top!.id, "m1");
});

t("room: bot local chi uses candidate id instead of falling back to pass", () => {
  const room = mkRoom(["A", "B", "C", "D"]);
  room.pendingResponse = {
    ownerId: "B",
    card: c("resp", "red", "jiang", "draw"),
    collectives: new Map(),
    responsePhaseAfterNoResponse: "local_draw",
  };
  room.state.responsePhase = "local_draw";
  room.state.currentPlayerId = "B";
  room.state.currentTurnPlayerId = "B";
  room.botIds.add("B");
  room.playerHands.set("B", [c("m1", "yellow", "ma")]);

  room.runBotStepNow();

  assert.equal(room.state.players.get("B")?.exposedArea.length ?? 0, 1);
  assert.equal(room.state.players.get("B")?.discardPile.length ?? 0, 0);
  assert.equal(room.awaitingDiscardOwnerId, "B");
});

t("room: collective peng consumes source discard from flow", () => {
  const room = mkRoom(["A", "B", "C", "D"]);
  const discard = c("resp", "red", "ju", "upper");
  room.ops.pushDiscard("A", discard);
  room.pendingResponse = {
    ownerId: "A",
    card: discard,
    collectives: new Map(),
  };
  room.state.responsePhase = "collective";
  room.collectiveResponderId = "B";
  room.playerHands.set("B", [c("rj1", "red", "ju"), c("rj2", "red", "ju"), c("m1", "yellow", "ma")]);
  const candidateId = room
    .getAvailableActions("B")
    .find((item: any) => item.action === "peng")
    ?.candidates?.[0]?.id;
  assert.ok(candidateId);

  room.executeResponseWinner("B", { action: "peng", candidateId });

  assert.equal(room.state.players.get("A")?.discardPile.length ?? 0, 0);
  assert.equal(room.state.publicDiscardPile.length, 0);
});

t("room: local chi consumes source discard from original flow after owner rebind", () => {
  const room = mkRoom(["A", "B", "C", "D"]);
  const discard = c("resp", "red", "ju", "upper");
  room.ops.pushDiscard("A", discard);
  room.pendingResponse = {
    ownerId: "B",
    card: discard,
    collectives: new Map(),
    responsePhaseAfterNoResponse: "local_upper",
  };
  room.state.responsePhase = "local_upper";
  room.state.currentPlayerId = "B";
  room.state.currentTurnPlayerId = "B";
  room.state.pollOriginPlayerId = "A";
  room.playerHands.set("B", [c("rj1", "red", "ju"), c("rj2", "red", "ju"), c("m1", "yellow", "ma")]);

  const candidateId = room
    .getAvailableActions("B")
    .find((item: any) => item.action === "chi")
    ?.candidates?.[0]?.id;
  assert.ok(candidateId);

  const ok = room.executeEat("B", candidateId);

  assert.equal(ok, true);
  assert.equal(room.state.players.get("A")?.discardPile.length ?? 0, 0);
  assert.equal(room.state.publicDiscardPile.length, 0);
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

import test from "node:test";
import assert from "node:assert/strict";
import { OfflinePracticeSession } from "../../game-core/offline-practice-session.js";
import { createSeededRandom } from "../../rooms/bot-strategy.js";
import { createPendingResponse } from "../../rooms/flow/support.js";
import { CardSchema } from "../../schema/game-state.schema.js";
import type { Card } from "../../rules/types.js";

function finishHumanDeclaration(session: OfflinePracticeSession): void {
  let view = session.view();
  if (view.phase !== "declaring") return;
  if (view.players[0]?.declarationStep === "fish") {
    const payload = session.gameSession.buildDefaultDeclarationPayload(view.privateHand);
    assert.equal(session.declareFish(payload.fishCardIds), true);
    view = session.view();
  }
  if (view.phase === "declaring" && view.players[0]?.declarationStep === "kong") {
    const maximum = session.gameSession.buildDeclarationSelection(
      view.privateHand,
      { declaredKongs: Number.MAX_SAFE_INTEGER },
    ).declaredKongs;
    assert.equal(session.declareKongs(maximum), true);
  }
}

function playHumanStep(session: OfflinePracticeSession): boolean {
  const view = session.view();
  if (view.decisionTimer.legalDiscardCardIds.length > 0) {
    const discard = session.gameSession.chooseBotDiscard({
      hand: view.privateHand,
      visibleCards: [],
      declaredKongs: Number(view.players[0]?.declaredKongs ?? 0),
      strength: 50,
      random: createSeededRandom(91),
    });
    return session.discard(discard?.id ?? view.decisionTimer.legalDiscardCardIds[0]!);
  }
  if (view.availableActions.length > 0 && view.responseCard) {
    const choice = session.gameSession.chooseBotAction({
      hand: view.privateHand,
      pendingCard: view.responseCard,
      actions: view.availableActions,
      visibleCards: [],
      strength: 50,
      random: createSeededRandom(47),
    });
    return session.submitAction(choice);
  }
  return false;
}

test("offline practice completes a full round and starts the next with the shared GameSession", () => {
  const session = new OfflinePracticeSession("离线玩家", createSeededRandom(20261009));
  session.startRound();
  finishHumanDeclaration(session);

  let steps = 0;
  while (session.view().phase !== "ended" && steps < 50_000) {
    steps += 1;
    if (session.isHumanDecisionPending()) {
      assert.equal(playHumanStep(session), true, `human action missing at step ${steps}`);
    } else {
      assert.equal(session.advanceAutomation(), true, `automation stuck at step ${steps}`);
    }
  }

  const ended = session.view();
  assert.equal(ended.phase, "ended");
  assert.equal(ended.roundResult?.players.length, 4);
  assert.equal(ended.completedRounds, 1);
  assert.ok(steps < 50_000);
  assert.equal(session.advanceAutomation(), false);
  assert.equal(session.view().completedRounds, 1, "settlement is emitted once");

  session.startRound();
  const next = session.view();
  assert.ok(next.phase === "declaring" || next.phase === "playing");
  assert.equal(next.completedRounds, 1);
  assert.equal(next.privateHand.length >= 20, true);
});

test("offline practice applies a downstream deferred Chi when the drawn card reaches the human", () => {
  const session = new OfflinePracticeSession("离线玩家", createSeededRandom(4));
  session.startRound();
  finishHumanDeclaration(session);

  let targetCardId = "";
  for (let steps = 0; steps < 200 && !targetCardId; steps += 1) {
    const view = session.view();
    const deferredChi = view.availableActions.find((action) =>
      action.action === "chi" && action.deferred && action.candidates?.length,
    );
    if (
      deferredChi &&
      view.responsePhase === "collective" &&
      view.currentPlayerId !== session.humanSeatId &&
      view.responseCard?.source === "draw"
    ) {
      targetCardId = view.responseCard.id;
      assert.equal(session.submitAction({
        action: "chi",
        candidateId: deferredChi.candidates![0]!.id,
        deferred: true,
      }), true);
      break;
    }
    assert.equal(
      session.isHumanDecisionPending() ? playHumanStep(session) : session.advanceAutomation(),
      true,
      `game stalled before a downstream deferred Chi at step ${steps}`,
    );
  }

  assert.notEqual(targetCardId, "", "seed should reach a downstream deferred Chi");
  for (let steps = 0; steps < 20; steps += 1) {
    const view = session.view();
    const human = view.players.find((player) => player.clientId === session.humanSeatId) as {
      exposedArea?: Array<{ id?: string }>;
      generalArea?: Array<{ id?: string }>;
    } | undefined;
    if ([...(human?.exposedArea ?? []), ...(human?.generalArea ?? [])]
      .some((card) => card.id === targetCardId)) {
      assert.equal(view.decisionTimer.legalDiscardCardIds.length > 0, true);
      return;
    }
    assert.equal(session.isHumanDecisionPending(), false, "deferred Chi should not require a second click");
    assert.equal(session.advanceAutomation(), true, `deferred Chi stalled at step ${steps}`);
  }
  assert.fail("deferred Chi was not applied after the card reached the human");
});

test("an upstream local Chi expires the offline intent before a later matching card", () => {
  const session = new OfflinePracticeSession("离线玩家");
  const core = session.gameSession.state;
  const humanHand: Card[] = [
    { id: "human-ju", color: "red", type: "ju" },
    { id: "human-pao", color: "red", type: "pao" },
    { id: "human-spare", color: "green", type: "shi" },
  ];
  core.playerHands.set("seat_0", humanHand);
  core.playerHands.set("seat_3", humanHand.map((card) => ({ ...card, id: `bot-${card.id}` })));
  const stageDraw = (id: string) => {
    core.awaitingDiscardOwnerId = null;
    core.pendingResponse = createPendingResponse("seat_3", { id, color: "red", type: "ma" }, "draw");
    for (const seatId of ["seat_1", "seat_2", "seat_3"]) {
      core.pendingResponse.collectives.set(seatId, { action: "pass" });
    }
    session.state.phase = "playing";
    session.state.responsePhase = "collective";
    session.state.currentPlayerId = "seat_3";
    session.state.currentTurnPlayerId = "seat_3";
    session.state.pollOriginPlayerId = "seat_3";
    session.state.responseCard = Object.assign(new CardSchema(), core.pendingResponse.card);
  };
  stageDraw("first-ma");
  const chi = session.view().availableActions.find((entry) => entry.action === "chi" && entry.deferred);
  assert.ok(chi?.candidates?.[0]);
  assert.equal(session.submitAction({ action: "chi", candidateId: chi.candidates[0].id, deferred: true }), true);
  assert.equal(session.view().responsePhase, "collective", "submission must not collapse the response transition");
  assert.equal(session.advanceAutomation(), true);
  assert.equal(session.view().responsePhase, "local_draw");
  // Force only the bot's policy choice; execute the actual local eat transition.
  session.gameSession.chooseBotAction = ({ actions }) => ({
    action: "chi",
    candidateId: actions.find((entry) => entry.action === "chi")?.candidates?.[0]?.id,
  });
  assert.equal(session.advanceAutomation(), true);
  assert.equal(core.awaitingDiscardOwnerId, "seat_3");
  assert.deepEqual(core.playerHands.get("seat_0"), humanHand);

  // The same hand candidate is valid for another physical copy, but it needs
  // fresh consent. The previous target's intent must not eat this card.
  stageDraw("second-ma");
  assert.equal(session.submitAction({ action: "pass" }), true);
  assert.equal(session.advanceAutomation(), true);
  assert.equal(session.view().responsePhase, "local_upper");
  assert.equal(session.view().currentPlayerId, "seat_0");
  assert.equal(core.awaitingDiscardOwnerId, null);
  assert.deepEqual(core.playerHands.get("seat_0"), humanHand);
  assert.equal(session.view().availableActions.some((entry) => entry.action === "chi" && entry.enabled), true);
});

test("deferred Chi publishes the pass and meld as separate automatic units", () => {
  const session = new OfflinePracticeSession("牌友");
  const core = session.gameSession.state;
  core.playerHands.set("seat_0", [
    { id: "ju", color: "red", type: "ju" }, { id: "pao", color: "red", type: "pao" },
    { id: "spare", color: "green", type: "shi" },
  ]);
  core.playerHands.set("seat_3", []);
  const target: Card = { id: "ma", color: "red", type: "ma", source: "draw" };
  core.pendingResponse = createPendingResponse("seat_3", target, "draw");
  for (const id of ["seat_1", "seat_2", "seat_3"]) core.pendingResponse.collectives.set(id, { action: "pass" });
  session.state.phase = "playing";
  session.state.responsePhase = "collective";
  session.state.pollOriginPlayerId = "seat_3";
  session.state.responseCard = Object.assign(new CardSchema(), target);
  const chi = session.view().availableActions.find(entry => entry.action === "chi" && entry.deferred)!;
  assert.equal(session.submitAction({ action: "chi", candidateId: chi.candidates![0]!.id, deferred: true }), true);
  assert.equal(session.advanceAutomation(), true);
  const pass = session.view();
  assert.equal(pass.lastAction, "seat_3 PASS");
  assert.equal(pass.tableTransitions.at(-1)?.kind, "flow");
  assert.equal(core.playerHands.get("seat_0")?.length, 3);
  assert.equal(session.isHumanDecisionPending(), false);
  assert.equal(session.advanceAutomation(), true);
  const eaten = session.view();
  assert.equal(eaten.lastAction, "seat_0 CHI");
  assert.equal(eaten.tableTransitions.at(-1)?.kind, "meld");
  assert.equal(eaten.tableTransitions.at(-1)?.startsAt, pass.presentationUntil);
  assert.equal(core.playerHands.get("seat_0")?.length, 1);
  assert.equal(session.isHumanDecisionPending(), true);
  assert.equal(session.advanceAutomation(), false, "the human discard must not be repeated automatically");
});

test("an invalid queued Chi releases the human decision and can be published", () => {
  const session = new OfflinePracticeSession("牌友");
  const core = session.gameSession.state;
  core.playerHands.set("seat_0", [
    { id: "ju", color: "red", type: "ju" }, { id: "pao", color: "red", type: "pao" },
    { id: "spare", color: "green", type: "shi" },
  ]);
  core.playerHands.set("seat_3", []);
  const target: Card = { id: "ma", color: "red", type: "ma", source: "draw" };
  core.pendingResponse = createPendingResponse("seat_3", target, "draw");
  for (const id of ["seat_1", "seat_2", "seat_3"]) core.pendingResponse.collectives.set(id, { action: "pass" });
  session.state.phase = "playing";
  session.state.responsePhase = "collective";
  session.state.pollOriginPlayerId = "seat_3";
  session.state.responseCard = Object.assign(new CardSchema(), target);
  const chi = session.view().availableActions.find(entry => entry.action === "chi" && entry.deferred)!;
  session.submitAction({ action: "chi", candidateId: chi.candidates![0]!.id, deferred: true });
  session.advanceAutomation();
  core.playerHands.set("seat_0", [{ id: "spare", color: "green", type: "shi" }]);
  assert.equal(session.advanceAutomation(), true, "clearing the obsolete intent is a publishable state change");
  assert.equal(session.isHumanDecisionPending(), true);
  assert.equal(session.view().availableActions.some(entry => entry.action === "pass" && entry.enabled), true);
  assert.equal(session.advanceAutomation(), false);
});

test("a Chi with no remaining discard presents its meld once before automatic Hu settlement", () => {
  const session = new OfflinePracticeSession("牌友");
  const core = session.gameSession.state;
  core.playerHands.set("seat_0", [
    { id: "human-ju", color: "red", type: "ju" },
    { id: "human-pao", color: "red", type: "pao" },
  ]);
  const target: Card = { id: "upper-ma", color: "red", type: "ma", source: "upper" };
  core.pendingResponse = createPendingResponse("seat_0", target, "upper");
  session.state.phase = "playing";
  session.state.responsePhase = "local_upper";
  session.state.currentPlayerId = "seat_0";
  session.state.currentTurnPlayerId = "seat_0";
  session.state.pollOriginPlayerId = "seat_3";
  session.state.responseCard = Object.assign(new CardSchema(), target);

  const chi = session.view().availableActions.find((entry) => entry.action === "chi" && entry.enabled);
  assert.ok(chi?.candidates?.[0], "the real rules must offer the red ju/ma/pao Chi");
  assert.equal(session.submitAction({ action: "chi", candidateId: chi.candidates[0].id }), true);

  const presented = session.view();
  const targetLandings = presented.tableTransitions.filter((event) => event.moves.some((move) =>
    move.card.id === target.id && move.to.zone === "meld",
  ));
  assert.equal(targetLandings.length, 1, "automatic Hu must not move the already melded response again");
  assert.deepEqual(presented.tableTransitions.map((event) => event.kind), ["meld"]);
  assert.equal(targetLandings[0]?.action, "seat_0 CHI");
  assert.equal(targetLandings[0]?.moves.filter((move) => move.card.id === target.id).length, 1);
  assert.equal(presented.privateHand.length, 0);
  assert.equal(presented.lastAction, "seat_0 HU");
  assert.equal(presented.phase, "playing", "settlement must wait for the meld presentation");
  assert.equal(presented.completedRounds, 0);
  assert.equal(presented.roundResult, null);
  assert.equal(presented.presentationUntil, targetLandings[0]?.endsAt);
  assert.equal(session.isHumanDecisionPending(), false);

  assert.equal(session.advanceAutomation(), true);
  const ended = session.view();
  assert.equal(ended.phase, "ended");
  assert.equal(ended.roundResult?.winnerId, "seat_0");
  assert.equal(ended.completedRounds, 1);
  assert.deepEqual(ended.tableTransitions, presented.tableTransitions);
  assert.equal(session.advanceAutomation(), false);
  assert.equal(session.view().completedRounds, 1, "automatic Hu settles only once");
});

test("an explicit Hu still presents one winning movement before settling once", () => {
  const session = new OfflinePracticeSession("牌友");
  const core = session.gameSession.state;
  core.playerHands.set("seat_0", [
    { id: "human-ju", color: "red", type: "ju" },
    { id: "human-pao", color: "red", type: "pao" },
  ]);
  const target: Card = { id: "upper-ma", color: "red", type: "ma", source: "upper" };
  core.pendingResponse = createPendingResponse("seat_3", target, "upper");
  for (const seatId of ["seat_1", "seat_2", "seat_3"]) {
    core.pendingResponse.collectives.set(seatId, { action: "pass" });
  }
  session.state.phase = "playing";
  session.state.responsePhase = "collective";
  session.state.currentPlayerId = "seat_0";
  session.state.currentTurnPlayerId = "seat_0";
  session.state.pollOriginPlayerId = "seat_3";
  session.state.responseCard = Object.assign(new CardSchema(), target);

  assert.equal(session.view().availableActions.some((entry) => entry.action === "hu" && entry.enabled), true);
  assert.equal(session.submitAction({ action: "hu" }), true);
  assert.equal(session.view().tableTransitions.length, 0, "the collective resolves in its next automatic unit");
  assert.equal(session.advanceAutomation(), true);

  const presented = session.view();
  const targetLandings = presented.tableTransitions.filter((event) => event.moves.some((move) =>
    move.card.id === target.id && move.to.zone === "meld",
  ));
  assert.equal(targetLandings.length, 1, "the already-melded guard must retain an explicit Hu movement");
  assert.deepEqual(presented.tableTransitions.map((event) => event.kind), ["hu"]);
  assert.equal(targetLandings[0]?.action, "seat_0 HU");
  assert.equal(targetLandings[0]?.moves.filter((move) => move.card.id === target.id).length, 1);
  assert.equal(presented.phase, "playing", "settlement must wait for the Hu presentation");
  assert.equal(presented.completedRounds, 0);
  assert.equal(presented.roundResult, null);
  assert.equal(presented.presentationUntil, targetLandings[0]?.endsAt);
  assert.equal(session.isHumanDecisionPending(), false);

  assert.equal(session.advanceAutomation(), true);
  const ended = session.view();
  assert.equal(ended.phase, "ended");
  assert.equal(ended.roundResult?.winnerId, "seat_0");
  assert.equal(ended.completedRounds, 1);
  assert.deepEqual(ended.tableTransitions, presented.tableTransitions);
  assert.equal(session.advanceAutomation(), false);
  assert.equal(session.view().completedRounds, 1, "explicit Hu settles only once");
});

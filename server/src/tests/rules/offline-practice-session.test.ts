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
  assert.equal(session.view().responsePhase, "local_upper");
  assert.equal(session.view().currentPlayerId, "seat_0");
  assert.equal(core.awaitingDiscardOwnerId, null);
  assert.deepEqual(core.playerHands.get("seat_0"), humanHand);
  assert.equal(session.view().availableActions.some((entry) => entry.action === "chi" && entry.enabled), true);
});

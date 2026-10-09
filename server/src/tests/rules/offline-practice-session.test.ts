import test from "node:test";
import assert from "node:assert/strict";
import { OfflinePracticeSession } from "../../game-core/offline-practice-session.js";
import { createSeededRandom } from "../../rooms/bot-strategy.js";

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

import { isGeneral, isGold } from "../../rules/deck.js";
import type { Card } from "../../rules/types.js";
import { planLocalPhaseAfterNoResponse } from "./local-phase.js";

type SeatId = string;

export interface PendingOwnerLocal {
  ownerId: SeatId;
  card: Card;
}

export interface EnterOwnerLocalDeps {
  pending: PendingOwnerLocal | null;
  ownerId: SeatId;
  getNextPlayerId: (playerId: SeatId) => SeatId;
  setPendingOwner: (ownerId: SeatId) => void;
  setResponsePhase: (phase: "local_upper" | "local_draw") => void;
  setCurrentPlayer: (ownerId: SeatId) => void;
  setCurrentTurnPlayer: (ownerId: SeatId) => void;
  setLoopStageLocal: () => void;
  clearActiveResponder: () => void;
  clearResponseEndsAt: () => void;
  addWildcardCardToPlayer: (ownerId: SeatId, card: Card, source: "draw") => void;
  setLastAction: (action: string) => void;
  enterDiscardStage: (ownerId: SeatId, tag: string) => void;
  syncAllPrivateHands: () => void;
  tickBots: () => void;
}

export function enterOwnerLocalPhaseAfterNoResponseFlow(deps: EnterOwnerLocalDeps): void {
  const pending = deps.pending;
  if (!pending || pending.ownerId !== deps.ownerId) {
    return;
  }
  const plan = planLocalPhaseAfterNoResponse(deps.ownerId, pending.card.source, deps.getNextPlayerId(deps.ownerId));
  if (plan.rebindPendingOwner) {
    deps.setPendingOwner(plan.localOwnerId);
  }
  deps.setResponsePhase(plan.responsePhase);
  deps.setCurrentPlayer(plan.localOwnerId);
  deps.setCurrentTurnPlayer(plan.localOwnerId);
  deps.setLoopStageLocal();
  deps.clearActiveResponder();
  deps.clearResponseEndsAt();

  if (plan.responsePhase === "local_draw" && (isGeneral(pending.card) || isGold(pending.card))) {
    deps.addWildcardCardToPlayer(plan.localOwnerId, pending.card, "draw");
    deps.setLastAction(`${plan.localOwnerId} FORCE_TAKE`);
    deps.enterDiscardStage(plan.localOwnerId, "FORCE_TAKE");
    return;
  }

  deps.syncAllPrivateHands();
  deps.tickBots();
}

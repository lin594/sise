import type { ActionType, Card } from "../../rules/types.js";
import { getCollectiveOrder, pickCollectiveWinner } from "./collective-logic.js";

type SeatId = string;

interface PendingLike {
  ownerId: SeatId;
  card: Card;
  collectives: Map<SeatId, ActionType>;
}

export interface ResolveCollectiveDeps {
  pending: PendingLike | null;
  playerOrder: SeatId[];
  executeResponseWinner: (winnerId: SeatId, action: ActionType) => void;
  setLastAction: (action: string) => void;
  enterOwnerLocalPhaseAfterNoResponse: (ownerId: SeatId) => void;
}

export function resolveCollectivePhaseFlow(deps: ResolveCollectiveDeps): void {
  const pending = deps.pending;
  if (!pending) {
    return;
  }
  const order = getCollectiveOrder(deps.playerOrder, pending);
  const winner = pickCollectiveWinner(order, pending.collectives);
  if (winner) {
    deps.executeResponseWinner(winner.id, winner.action);
    return;
  }
  deps.setLastAction("NO_RESPONSE");
  deps.enterOwnerLocalPhaseAfterNoResponse(pending.ownerId);
}

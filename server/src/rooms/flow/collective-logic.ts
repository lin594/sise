import type { ActionType } from "../../rules/types.js";
import { iterateFromNext } from "./turn-order.js";

type SeatId = string;

interface PendingLike {
  ownerId: SeatId;
  card: { source?: "upper" | "draw" };
}

export function getCollectiveOrder(playerOrder: SeatId[], pending: PendingLike): SeatId[] {
  if (pending.card.source === "draw") {
    return [pending.ownerId, ...iterateFromNext(playerOrder, pending.ownerId).filter((id) => id !== pending.ownerId)];
  }
  return iterateFromNext(playerOrder, pending.ownerId);
}

export function pickCollectiveWinner(
  order: SeatId[],
  collectives: Map<SeatId, ActionType>,
): { id: SeatId; action: ActionType } | null {
  for (const id of order) {
    if ((collectives.get(id) ?? "pass") === "hu") {
      return { id, action: "hu" };
    }
  }

  for (const id of order) {
    const act = collectives.get(id) ?? "pass";
    if (act === "kai" || act === "peng") {
      return { id, action: act };
    }
  }

  return null;
}

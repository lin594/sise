import { canChi, canKai, canPeng } from "../../rules/actions.js";
import type { ActionType, Card } from "../../rules/types.js";

type SeatId = string;

export interface PendingActionContext {
  ownerId: SeatId;
  card: Card;
}

export interface ActionPanelInput {
  phase: string;
  seatId: SeatId;
  pending: PendingActionContext | null;
  responsePhase: "collective" | "local_upper" | "local_draw";
  collectiveResponderId: SeatId | null;
  awaitingDiscardOwnerId: SeatId | null;
  hand: Card[];
  wildcardPool: Card[];
  explainHuForSeat: (seatId: SeatId, hand: Card[], responseCard: Card) => { valid: boolean };
  logHuCheck: (stage: string, seatId: SeatId, hand: Card[], response: Card, valid: boolean) => void;
  getHandWithoutPending: (seatId: SeatId, pendingCard: Card) => Card[];
}

export function getDisabledPanel(): Array<{ action: ActionType; enabled: boolean }> {
  return [
    { action: "hu", enabled: false },
    { action: "kai", enabled: false },
    { action: "peng", enabled: false },
    { action: "chi", enabled: false },
    { action: "pass", enabled: false },
  ];
}

export function getAvailableActionsFlow(input: ActionPanelInput): Array<{ action: ActionType; enabled: boolean }> {
  if (input.phase === "declaring" || !input.pending) {
    return [];
  }

  const isOwner = input.pending.ownerId === input.seatId;
  const isCollective = input.responsePhase === "collective";

  if (isCollective) {
    if (input.seatId !== input.collectiveResponderId) {
      return getDisabledPanel();
    }
    const huProbe = input.explainHuForSeat(input.seatId, input.hand, input.pending.card);
    input.logHuCheck("collective", input.seatId, input.hand, input.pending.card, huProbe.valid);
    return [
      { action: "hu", enabled: huProbe.valid },
      { action: "kai", enabled: canKai(input.hand, input.pending.card, input.wildcardPool) },
      { action: "peng", enabled: canPeng(input.hand, input.pending.card) },
      { action: "chi", enabled: false },
      { action: "pass", enabled: true },
    ];
  }

  if (!isOwner) {
    return getDisabledPanel();
  }

  if (input.awaitingDiscardOwnerId === input.seatId) {
    return [];
  }

  if (input.responsePhase === "local_upper" || input.responsePhase === "local_draw") {
    const handNoPending = input.getHandWithoutPending(input.seatId, input.pending.card);
    return [
      { action: "hu", enabled: false },
      { action: "kai", enabled: false },
      { action: "peng", enabled: false },
      { action: "chi", enabled: canChi(handNoPending, input.pending.card, input.wildcardPool) },
      { action: "pass", enabled: true },
    ];
  }

  return getDisabledPanel();
}

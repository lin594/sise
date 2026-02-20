import { canChi } from "../../rules/actions.js";
import type { ActionType, Card } from "../../rules/types.js";
import { pickCollectiveBotAction, pickLocalBotAction } from "./bot-strategy.js";

export interface BotRunnerDeps {
  phase: string;
  responsePhase: "collective" | "local_upper" | "local_draw";
  pendingOwnerId: string;
  pendingCard: Card;
  collectiveResponderId: string | null;
  isBot: (seatId: string) => boolean;
  awaitingDiscardOwnerId: string | null;
  getAvailableActions: (seatId: string) => Array<{ action: ActionType; enabled: boolean }>;
  setCollectiveChoice: (seatId: string, action: ActionType) => void;
  advanceCollectivePolling: () => void;
  broadcastAvailableActions: () => void;
  discardFromAndCollective: (ownerId: string) => void;
  getHand: (seatId: string) => Card[];
  getWildcardPoolCards: (seatId: string) => Card[];
  executeEat: (ownerId: string) => void;
  executeGrab: (ownerId: string) => void;
  executePassToNext: (ownerId: string) => void;
}

export function runBotStep(deps: BotRunnerDeps): void {
  if (deps.phase !== "playing") {
    deps.broadcastAvailableActions();
    return;
  }

  if (deps.responsePhase === "collective") {
    const responderId = deps.collectiveResponderId;
    if (!responderId || !deps.isBot(responderId)) {
      deps.broadcastAvailableActions();
      return;
    }
    const choose = pickCollectiveBotAction(deps.getAvailableActions(responderId));
    deps.setCollectiveChoice(responderId, choose);
    deps.advanceCollectivePolling();
    return;
  }

  const ownerId = deps.pendingOwnerId;
  if (!deps.isBot(ownerId)) {
    deps.broadcastAvailableActions();
    return;
  }

  if (deps.awaitingDiscardOwnerId === ownerId) {
    deps.discardFromAndCollective(ownerId);
    return;
  }

  if (deps.responsePhase === "local_upper") {
    const hand = deps.getHand(ownerId);
    const action = pickLocalBotAction("local_upper", canChi(hand, deps.pendingCard, deps.getWildcardPoolCards(ownerId)));
    if (action === "chi") {
      deps.executeEat(ownerId);
    } else {
      deps.executeGrab(ownerId);
    }
    return;
  }

  if (deps.responsePhase === "local_draw") {
    const hand = deps.getHand(ownerId);
    const action = pickLocalBotAction("local_draw", canChi(hand, deps.pendingCard, deps.getWildcardPoolCards(ownerId)));
    if (action === "chi") {
      deps.executeEat(ownerId);
    } else {
      deps.executePassToNext(ownerId);
    }
    return;
  }

  deps.broadcastAvailableActions();
}

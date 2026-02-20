import type { ActionType } from "../../rules/types.js";

export type ActionDecision =
  | "ignore"
  | "collective_accept"
  | "local_chi"
  | "local_pass_upper"
  | "local_pass_draw";

export interface ActionDispatchInput {
  pendingOwnerId: string;
  seatId: string;
  action: ActionType;
  enabledActions: ActionType[];
  responsePhase: "collective" | "local_upper" | "local_draw";
  collectiveResponderId: string | null;
  awaitingDiscardOwnerId: string | null;
}

export function decideActionDispatch(input: ActionDispatchInput): ActionDecision {
  if (!input.enabledActions.includes(input.action)) {
    return "ignore";
  }

  if (input.responsePhase === "collective") {
    return input.seatId === input.collectiveResponderId ? "collective_accept" : "ignore";
  }

  if (input.pendingOwnerId !== input.seatId) {
    return "ignore";
  }
  if (input.awaitingDiscardOwnerId === input.seatId) {
    return "ignore";
  }
  if (input.action === "chi") {
    return "local_chi";
  }
  if (input.action === "pass" && input.responsePhase === "local_upper") {
    return "local_pass_upper";
  }
  if (input.action === "pass" && input.responsePhase === "local_draw") {
    return "local_pass_draw";
  }
  return "ignore";
}

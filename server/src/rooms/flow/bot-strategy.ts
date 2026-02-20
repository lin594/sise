import type { ActionType } from "../../rules/types.js";

interface ActionOption {
  action: ActionType;
  enabled: boolean;
}

export function pickCollectiveBotAction(actions: ActionOption[]): ActionType {
  return (
    actions.find((x) => x.action === "hu" && x.enabled)?.action ??
    actions.find((x) => x.action === "kai" && x.enabled)?.action ??
    actions.find((x) => x.action === "peng" && x.enabled)?.action ??
    actions.find((x) => x.action === "chi" && x.enabled)?.action ??
    actions.find((x) => x.action === "pass" && x.enabled)?.action ??
    "pass"
  );
}

export function pickLocalBotAction(
  responsePhase: "local_upper" | "local_draw",
  canChi: boolean,
): "chi" | "grab" | "pass_to_next" {
  if (canChi) {
    return "chi";
  }
  if (responsePhase === "local_upper") {
    return "grab";
  }
  return "pass_to_next";
}

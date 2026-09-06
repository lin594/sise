export type CardPlacement = "center" | "flow" | "meld" | "hidden";

export interface ResponseCardPlacementInput {
  phase: string;
  responsePhase: string;
  hasResponseCard: boolean;
  currentPlayerId: string;
  viewerPlayerId: string;
}

export function getRoundKey(
  roomId: string | undefined,
  completedRounds: number | undefined,
  phase: string | undefined,
): string {
  const completed = Math.max(0, Number(completedRounds ?? 0));
  const roundNumber = phase === "ended" ? Math.max(1, completed) : completed + 1;
  return `${roomId || "room"}:${roundNumber}`;
}

export function projectResponseCardPlacement(input: ResponseCardPlacementInput): CardPlacement {
  if (!input.hasResponseCard || input.phase !== "playing") {
    return "hidden";
  }
  if (input.responsePhase !== "local_upper") {
    return "center";
  }
  const isReceiver = Boolean(input.viewerPlayerId) && input.currentPlayerId === input.viewerPlayerId;
  return isReceiver ? "center" : "flow";
}

export function isQuietSelfDiscardWait(input: {
  responsePhase: string;
  responseSource?: string;
  originPlayerId?: string;
  viewerPlayerId?: string;
}): boolean {
  return input.responsePhase === "collective" &&
    input.responseSource === "upper" &&
    Boolean(input.viewerPlayerId) &&
    input.originPlayerId === input.viewerPlayerId;
}

export function getDisplayedTurnPlayerId(input: {
  responsePhase?: string;
  pendingReceiverId?: string;
  currentTurnPlayerId?: string;
  currentPlayerId?: string;
  playerIds: string[];
}): string {
  if (input.responsePhase === "collective") {
    const receiverId = String(input.pendingReceiverId || "");
    // 全局响应的指向是公开的下一接牌者；私有响应游标不参与，也禁止无效值回退成本人。
    return input.playerIds.includes(receiverId) ? receiverId : "";
  }
  const currentId = String(input.currentTurnPlayerId || input.currentPlayerId || "");
  return input.playerIds.includes(currentId) ? currentId : "";
}

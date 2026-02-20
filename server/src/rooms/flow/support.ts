import type { MapSchema } from "@colyseus/schema";
import type { ActionType, Card } from "../../rules/types.js";
import type { GameState, PlayerState } from "../../schema/game-state.schema.js";

type SeatId = string;

export function iterateFromNext(playerOrder: SeatId[], startId: SeatId): SeatId[] {
  const idx = playerOrder.indexOf(startId);
  if (idx < 0) {
    return [...playerOrder];
  }
  const ordered: SeatId[] = [];
  for (let i = 1; i <= playerOrder.length; i += 1) {
    ordered.push(playerOrder[(idx + i) % playerOrder.length]);
  }
  return ordered;
}

export function getNextPlayerId(playerOrder: SeatId[], playerId: SeatId): SeatId {
  const idx = playerOrder.indexOf(playerId);
  if (idx < 0) {
    return playerOrder[0];
  }
  return playerOrder[(idx + 1) % playerOrder.length];
}

export function getPreviousPlayerId(playerOrder: SeatId[], playerId: SeatId): SeatId {
  const idx = playerOrder.indexOf(playerId);
  if (idx < 0) {
    return playerOrder[0];
  }
  return playerOrder[(idx - 1 + playerOrder.length) % playerOrder.length];
}

interface PendingOrderLike {
  ownerId: SeatId;
  card: { source?: "upper" | "draw" };
}

export function getCollectiveOrder(playerOrder: SeatId[], pending: PendingOrderLike): SeatId[] {
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

export interface CollectiveCursorInput {
  queue: SeatId[];
  cursor: number;
  hasResponded: (seatId: SeatId) => boolean;
  hasActionBeyondPass: (seatId: SeatId) => boolean;
}

export interface CollectiveCursorResult {
  nextCursor: number;
  responderId: SeatId | null;
  forcedPassIds: SeatId[];
}

export function resolveNextCollectiveResponder(input: CollectiveCursorInput): CollectiveCursorResult {
  let cursor = input.cursor;
  const forcedPassIds: SeatId[] = [];
  while (cursor < input.queue.length) {
    const seatId = input.queue[cursor];
    if (input.hasResponded(seatId)) {
      cursor += 1;
      continue;
    }
    if (!input.hasActionBeyondPass(seatId)) {
      forcedPassIds.push(seatId);
      cursor += 1;
      continue;
    }
    return { nextCursor: cursor, responderId: seatId, forcedPassIds };
  }
  return { nextCursor: cursor, responderId: null, forcedPassIds };
}

export interface LocalPhasePlan {
  localOwnerId: SeatId;
  responsePhase: "local_upper" | "local_draw";
  rebindPendingOwner: boolean;
}

export function planLocalPhaseAfterNoResponse(
  ownerId: SeatId,
  cardSource: "upper" | "draw" | undefined,
  nextPlayerId: SeatId,
): LocalPhasePlan {
  const fromDraw = cardSource === "draw";
  return {
    localOwnerId: fromDraw ? ownerId : nextPlayerId,
    responsePhase: fromDraw ? "local_draw" : "local_upper",
    rebindPendingOwner: !fromDraw,
  };
}

export function shouldEndDrawAfterUpperPass(deckCount: number): boolean {
  return deckCount <= 8;
}

export function normalizeDiscardCardId(payload: { cardId?: string } | string): string {
  return typeof payload === "string" ? payload : String(payload?.cardId ?? "");
}

export interface DiscardRequestInput {
  hasPending: boolean;
  phase: string;
  pendingOwnerId: string;
  seatId: string;
  awaitingDiscardOwnerId: string | null;
  responsePhase: "collective" | "local_upper" | "local_draw";
}

export function canAcceptDiscardRequest(input: DiscardRequestInput): boolean {
  if (!input.hasPending || input.phase !== "playing") {
    return false;
  }
  if (input.pendingOwnerId !== input.seatId) {
    return false;
  }
  if (input.awaitingDiscardOwnerId !== input.seatId) {
    return false;
  }
  if (input.responsePhase === "collective") {
    return false;
  }
  return true;
}

export function applyTurnTransitionState(state: GameState, ownerId: string): void {
  state.currentPlayerId = ownerId;
  state.currentTurnPlayerId = ownerId;
  state.loopStage = "transition";
}

export function applyCollectivePollState(
  state: GameState,
  ownerId: string,
  previousPlayerId: string,
  pollOriginPlayerId: string,
  lastAction: string,
): void {
  state.responsePhase = "collective";
  state.currentPlayerId = ownerId;
  state.currentTurnPlayerId = ownerId;
  state.previousPlayerId = previousPlayerId;
  state.loopStage = "global_poll";
  state.activeResponderId = "";
  state.pollOriginPlayerId = pollOriginPlayerId;
  state.responseEndsAt = 0;
  state.lastAction = lastAction;
}

export function applyPlayingStartAfterDeclaring(
  state: GameState,
  dealerId: string,
  previousPlayerId: string,
): void {
  state.dealerId = dealerId;
  state.declareEndsAt = 0;
  state.phase = "playing";
  state.responsePhase = "local_draw";
  state.currentPlayerId = dealerId;
  state.currentTurnPlayerId = dealerId;
  state.previousPlayerId = previousPlayerId;
  state.loopStage = "transition";
  state.activeResponderId = "";
  state.pollOriginPlayerId = "";
  state.responseEndsAt = 0;
  state.lastAction = `DEALER ${dealerId}`;
}

export function applyEnterDiscardStageState(state: GameState, ownerId: string, tag: string): void {
  state.responsePhase = "local_draw";
  state.currentPlayerId = ownerId;
  state.lastAction = `${ownerId} ${tag}`;
}

export function normalizeAction(action: ActionType): ActionType {
  if (action === "open") {
    return "kai";
  }
  if (action === "eat") {
    return "chi";
  }
  if (action === "grab") {
    return "pass";
  }
  return action;
}

export function normalizeName(input: unknown): string {
  const name = String(input ?? "").trim();
  return name.slice(0, 24);
}

export function normalizeToken(input: unknown): string {
  return String(input ?? "").trim().slice(0, 128);
}

export function generateToken(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function pickRandomDealerId(playerOrder: string[]): string {
  if (!playerOrder.length) {
    return "";
  }
  const idx = Math.floor(Math.random() * playerOrder.length);
  return playerOrder[idx];
}

export function getStateActionKeyword(action: string): string {
  const parts = action.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "";
  }
  if (parts[0].startsWith("seat_") || parts[0].startsWith("bot_")) {
    return parts[1] ?? "";
  }
  return parts[0];
}

export function shouldLogStateSnapshot(
  stateLogMode: "off" | "all" | "compact",
  lastAction: string,
  compactActions: Set<string>,
): boolean {
  if (stateLogMode === "off") {
    return false;
  }
  if (stateLogMode === "all") {
    return true;
  }
  return compactActions.has(getStateActionKeyword(lastAction));
}

export function summarizeCards(cards: Card[]): string {
  if (!cards.length) {
    return "-";
  }
  const counter = new Map<string, number>();
  for (const c of cards) {
    const key = `${c.color}:${c.type}`;
    counter.set(key, (counter.get(key) ?? 0) + 1);
  }
  return [...counter.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, n]) => `${k}x${n}`)
    .join(",");
}

function summarizeSchemaCards(cards: Iterable<{ color: string; type: string }>): string {
  const list = [...cards];
  if (!list.length) {
    return "-";
  }
  const counter = new Map<string, number>();
  for (const c of list) {
    const key = `${c.color}:${c.type}`;
    counter.set(key, (counter.get(key) ?? 0) + 1);
  }
  return [...counter.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, n]) => `${k}x${n}`)
    .join(",");
}

export function summarizeAllPlayersCards(
  playerOrder: string[],
  playerHands: Map<string, Card[]>,
  players: MapSchema<PlayerState>,
): string {
  const parts: string[] = [];
  for (const seatId of playerOrder) {
    const hand = playerHands.get(seatId) ?? [];
    const p = players.get(seatId);
    const exposed = p?.exposedArea ?? [];
    const discard = p?.discardPile ?? [];
    const generals = p?.generalArea ?? [];
    const fish = p?.fishArea ?? [];
    parts.push(
      `${seatId}{h=${summarizeCards(hand)}|e=${summarizeSchemaCards(exposed)}|g=${summarizeSchemaCards(generals)}|d=${summarizeSchemaCards(discard)}|f=${summarizeSchemaCards(fish)}}`,
    );
  }
  return parts.join(" ; ");
}

export function buildHuSummaryBySeat(
  playerOrder: string[],
  huChecksBySeat: Map<string, { total: number; valid: number }>,
): string {
  return playerOrder
    .map((seatId) => {
      const s = huChecksBySeat.get(seatId) ?? { total: 0, valid: 0 };
      return `${seatId}:${s.valid}/${s.total}`;
    })
    .join(",");
}

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

export interface PendingResponseSnapshot {
  ownerId: string;
  card: Card;
  collectives: Map<string, ActionType>;
}

export function createPendingResponse(
  ownerId: string,
  card: Card,
  source: "upper" | "draw",
): PendingResponseSnapshot {
  return {
    ownerId,
    card: { ...card, source },
    collectives: new Map(),
  };
}

import type { MapSchema } from "@colyseus/schema";
import type { ActionType, Card } from "../../rules/types.js";
import type { GameState, PlayerState } from "../../schema/game-state.schema.js";

type SeatId = string;

/**
 * 纯工具聚合层：提供回合顺序、状态写入助手、输入归一化与日志摘要工具。
 * 关键输入/输出：输入基础状态参数，输出可复用的计算结果或直接写入 `GameState`。
 * 副作用：仅 `apply*State` 族函数会修改 `GameState`，其余函数保持无副作用。
 */

/**
 * 作用：从指定玩家的下家开始，生成完整一圈顺序。
 * 关键输入/输出：输入座位顺序和起点，输出轮询顺序数组。
 * 副作用：无。
 */
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

/**
 * 作用：根据当前座位获取下家。
 * 关键输入/输出：输入座位顺序与当前座位，输出下家座位。
 * 副作用：无。
 */
export function getNextPlayerId(playerOrder: SeatId[], playerId: SeatId): SeatId {
  const idx = playerOrder.indexOf(playerId);
  if (idx < 0) {
    return playerOrder[0];
  }
  return playerOrder[(idx + 1) % playerOrder.length];
}

/**
 * 作用：根据当前座位获取上家。
 * 关键输入/输出：输入座位顺序与当前座位，输出上家座位。
 * 副作用：无。
 */
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

/**
 * 作用：构造 collective 阶段的应答顺序。
 * 关键输入/输出：输入座位顺序和待响应牌来源，输出轮询顺序。
 * 副作用：无。
 */
export function getCollectiveOrder(playerOrder: SeatId[], pending: PendingOrderLike): SeatId[] {
  // 设计原因：摸牌(`draw`)时先给牌主本人响应；上家来牌(`upper`)时从下家开始轮询。
  if (pending.card.source === "draw") {
    return [pending.ownerId, ...iterateFromNext(playerOrder, pending.ownerId).filter((id) => id !== pending.ownerId)];
  }
  return iterateFromNext(playerOrder, pending.ownerId);
}

/**
 * 作用：按优先级从 collective 响应结果中选出胜出动作。
 * 关键输入/输出：输入轮询顺序与各家响应，输出首个生效的玩家与动作。
 * 副作用：无。
 */
export function pickCollectiveWinner(
  order: SeatId[],
  collectives: Map<SeatId, { action: ActionType; candidateId?: string }>,
): { id: SeatId; choice: { action: ActionType; candidateId?: string } } | null {
  for (const id of order) {
    const choice = collectives.get(id) ?? { action: "pass" as ActionType };
    if (choice.action === "hu") {
      return { id, choice };
    }
  }
  for (const id of order) {
    const choice = collectives.get(id) ?? { action: "pass" as ActionType };
    if (choice.action === "kai" || choice.action === "peng") {
      return { id, choice };
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

/**
 * 作用：推进 collective 游标并找到下一位实际需要决策的玩家。
 * 关键输入/输出：输入队列、游标与判定函数，输出下一游标、响应者、强制 pass 列表。
 * 副作用：无。
 */
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

/**
 * 作用：在 collective 无人响应后，规划进入 local 阶段的归属与相位。
 * 关键输入/输出：输入当前牌主、牌来源和下家，输出本地阶段规划。
 * 副作用：无。
 */
export function planLocalPhaseAfterNoResponse(
  ownerId: SeatId,
  cardSource: "upper" | "draw" | undefined,
  nextPlayerId: SeatId,
  responsePhaseOverride?: "local_upper" | "local_draw",
): LocalPhasePlan {
  if (responsePhaseOverride) {
    return {
      localOwnerId: cardSource === "draw" ? ownerId : nextPlayerId,
      responsePhase: responsePhaseOverride,
      rebindPendingOwner: cardSource !== "draw",
    };
  }
  const fromDraw = cardSource === "draw";
  return {
    localOwnerId: fromDraw ? ownerId : nextPlayerId,
    responsePhase: fromDraw ? "local_draw" : "local_upper",
    rebindPendingOwner: !fromDraw,
  };
}

/**
 * 作用：判断上家来牌无人吃时是否直接流局。
 * 关键输入/输出：输入剩余牌堆数量，输出是否结束本局。
 * 副作用：无。
 */
export function shouldEndDrawAfterUpperPass(deckCount: number): boolean {
  // 设计原因：牌堆<=8 视为“收尾保留牌”，上家 pass 后不再继续补摸，直接 DRAW_GAME。
  return deckCount <= 8;
}

/**
 * 作用：统一 `discard_card` 入参格式。
 * 关键输入/输出：输入字符串或对象，输出标准 cardId 字符串。
 * 副作用：无。
 */
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

/**
 * 作用：校验客户端当前是否允许执行弃牌请求。
 * 关键输入/输出：输入当前阶段上下文，输出可否受理。
 * 副作用：无。
 */
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

/**
 * 作用：写入回合切换到 transition 阶段的公共状态字段。
 * 关键输入/输出：输入 `GameState` 与牌主，输出无返回值。
 * 副作用：修改 `currentPlayerId/currentTurnPlayerId/loopStage`。
 */
export function applyTurnTransitionState(state: GameState, ownerId: string): void {
  state.currentPlayerId = ownerId;
  state.currentTurnPlayerId = ownerId;
  state.loopStage = "transition";
}

/**
 * 作用：写入进入 collective 轮询阶段的公共状态字段。
 * 关键输入/输出：输入 `GameState` 与轮询上下文，输出无返回值。
 * 副作用：修改 `responsePhase/currentPlayerId/previousPlayerId/loopStage` 等字段。
 */
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

/**
 * 作用：声明阶段结束后初始化 playing 起始状态。
 * 关键输入/输出：输入庄家与上家，输出无返回值。
 * 副作用：重置并写入 playing 阶段主循环状态字段。
 */
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

/**
 * 作用：写入进入待弃牌阶段时的关键状态。
 * 关键输入/输出：输入牌主和动作标签，输出无返回值。
 * 副作用：修改 `responsePhase/currentPlayerId/lastAction`。
 */
export function applyEnterDiscardStageState(state: GameState, ownerId: string, tag: string): void {
  state.responsePhase = "local_draw";
  state.currentPlayerId = ownerId;
  state.lastAction = `${ownerId} ${tag}`;
}

/**
 * 作用：兼容旧动作协议，归一化动作名称。
 * 关键输入/输出：输入客户端动作，输出当前语义动作。
 * 副作用：无。
 */
export function normalizeAction(action: string): ActionType | null {
  if (action === "open") {
    return "kai";
  }
  if (action === "eat") {
    return "chi";
  }
  if (action === "grab" || action === "zhua") {
    return "pass";
  }
  if (action === "hu" || action === "kai" || action === "peng" || action === "chi" || action === "pass") {
    return action;
  }
  return null;
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

export function resolveDealerFromAnchorAndCard(playerOrder: string[], anchorSeatId: string, card: Card): string {
  if (!playerOrder.length || !anchorSeatId) {
    return "";
  }
  const startIndex = playerOrder.indexOf(anchorSeatId);
  if (startIndex < 0) {
    return anchorSeatId;
  }
  const offsetMap: Record<string, number> = {
    yellow: 0,
    red: 1,
    gold: 1,
    green: 2,
    white: 3,
  };
  const offset = offsetMap[card.color] ?? 0;
  return playerOrder[(startIndex + offset) % playerOrder.length];
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

/**
 * 作用：生成机器人在 collective 阶段的默认动作选择。
 * 关键输入/输出：输入可选动作面板，输出单个动作。
 * 副作用：无。
 */
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

/**
 * 作用：生成机器人在 local 阶段的默认动作选择。
 * 关键输入/输出：输入 local 相位与是否可吃，输出 `chi/zhua/pass_to_next`。
 * 副作用：无。
 */
export function pickLocalBotAction(
  responsePhase: "local_upper" | "local_draw",
  canChi: boolean,
): "chi" | "zhua" | "pass_to_next" {
  if (canChi) {
    return "chi";
  }
  if (responsePhase === "local_upper") {
    return "zhua";
  }
  return "pass_to_next";
}

export interface PendingResponseSnapshot {
  ownerId: string;
  card: Card;
  collectives: Map<string, { action: ActionType; candidateId?: string }>;
  responsePhaseAfterNoResponse?: "local_upper" | "local_draw";
}

/**
 * 作用：创建统一的 pendingResponse 快照对象。
 * 关键输入/输出：输入牌主、目标牌与来源，输出带 collectives 的快照。
 * 副作用：无。
 */
export function createPendingResponse(
  ownerId: string,
  card: Card,
  source: "upper" | "draw",
  responsePhaseAfterNoResponse?: "local_upper" | "local_draw",
): PendingResponseSnapshot {
  return {
    ownerId,
    card: { ...card, source },
    collectives: new Map(),
    responsePhaseAfterNoResponse,
  };
}

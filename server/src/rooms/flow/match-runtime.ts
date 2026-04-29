import type { MapSchema } from "@colyseus/schema";
import { CardSchema, GameState, PlayerState } from "../../schema/game-state.schema.js";
import { explainHu } from "../../rules/hu.js";
import type { Card } from "../../rules/types.js";

/**
 * 对局阶段管理层：负责等待/声明/结算等阶段切换与开局准备。
 * 关键输入/输出：输入房间状态与运行时容器，输出阶段决策或状态重置结果。
 * 副作用：会批量修改 `GameState`、座位集合与玩家局内区域。
 */

export type StartGameDecision =
  | { ok: true }
  | { ok: false; reason: "not_waiting" | "not_host" | "not_enough_players" };

/**
 * 作用：校验是否允许开始新局。
 * 关键输入/输出：输入发起者、阶段、房主与人数，输出可执行与失败原因。
 * 副作用：无。
 */
export function decideStartGame(
  seatId: string | undefined,
  phase: string,
  hostPlayerId: string,
  humanCount: number,
  minPlayersToStart: number,
): StartGameDecision {
  if (!seatId) {
    return { ok: false, reason: "not_host" };
  }
  if (phase !== "waiting") {
    return { ok: false, reason: "not_waiting" };
  }
  if (seatId !== hostPlayerId) {
    return { ok: false, reason: "not_host" };
  }
  const requiredHumans = Math.max(1, Number(minPlayersToStart) || 1);
  // 当前已开放模式只有单人练习：即使部署时 MIN_PLAYERS 被误设为 >1，也允许 1 名真人开局并补齐 BOT。
  if (humanCount < requiredHumans && humanCount !== 1) {
    return { ok: false, reason: "not_enough_players" };
  }
  return { ok: true };
}

/**
 * 作用：校验 ended 阶段是否允许“下一局”。
 * 关键输入/输出：输入发起者和当前阶段，输出布尔值。
 * 副作用：无。
 */
export function canStartNextRound(seatId: string | undefined, phase: string, hostPlayerId: string): boolean {
  if (!seatId || phase !== "ended") {
    return false;
  }
  return seatId === hostPlayerId;
}

/**
 * 作用：校验 ended 阶段是否允许返回大厅。
 * 关键输入/输出：输入发起者与阶段，输出布尔值。
 * 副作用：无。
 */
export function canReturnLobby(seatId: string | undefined, phase: string): boolean {
  return Boolean(seatId && phase === "ended");
}

export interface FreshLobbyContext {
  state: GameState;
  targetSeats: number;
  clearBotTimer: () => void;
  clearDeclareTimer: () => void;
  resetCollectivePolling: () => void;
  setDeck: (deck: Card[]) => void;
  setPendingResponseNull: () => void;
  setPublicGeneralPool: (cards: Card[]) => void;
  setAwaitingDiscardOwnerNull: () => void;
  setRoundDealerNull: () => void;
  clearPlayerHands: () => void;
  setPlayerOrder: (order: string[]) => void;
  clearBotIds: () => void;
  clearSeatBySession: () => void;
  clearSeatByToken: () => void;
  clearBaseNameBySeat: () => void;
  broadcastAvailableActions: () => void;
}

/**
 * 作用：在“最后一位真人离开房间”时重置为全新大厅状态。
 * 关键输入/输出：输入房间运行时上下文，输出无返回值。
 * 副作用：清空牌局缓存、座位映射、玩家列表与计时器。
 */
export function resetToFreshLobbyFlow(ctx: FreshLobbyContext): void {
  ctx.clearBotTimer();
  ctx.clearDeclareTimer();
  ctx.resetCollectivePolling();
  ctx.setDeck([]);
  ctx.setPendingResponseNull();
  ctx.setPublicGeneralPool([]);
  ctx.setAwaitingDiscardOwnerNull();
  ctx.setRoundDealerNull();

  ctx.clearPlayerHands();
  ctx.setPlayerOrder([]);
  ctx.clearBotIds();
  ctx.clearSeatBySession();
  ctx.clearSeatByToken();
  ctx.clearBaseNameBySeat();

  ctx.state.players.clear();
  ctx.state.publicDiscardPile.clear();
  ctx.state.phase = "waiting";
  ctx.state.responsePhase = "collective";
  ctx.state.currentPlayerId = "";
  ctx.state.hostPlayerId = "";
  ctx.state.dealerId = "";
  ctx.state.dealerPickerId = "";
  ctx.state.deckCount = 0;
  ctx.state.declareEndsAt = 0;
  ctx.state.targetCard = new CardSchema();
  ctx.state.isMoCard = false;
  ctx.state.previousPlayerId = "";
  ctx.state.currentTurnPlayerId = "";
  ctx.state.loopStage = "";
  ctx.state.activeResponderId = "";
  ctx.state.pollOriginPlayerId = "";
  ctx.state.responseEndsAt = 0;
  ctx.state.responseCard = new CardSchema();
  ctx.state.dealerCard = new CardSchema();
  ctx.state.lastAction = `LOBBY 0/${ctx.targetSeats}`;
  ctx.broadcastAvailableActions();
}

export interface SeatCreateContext {
  state: GameState;
  seatByTokenSize: number;
  playerOrder: string[];
  playerHands: Map<string, Card[]>;
  baseNameBySeat: Map<string, string>;
  seatByToken: Map<string, string>;
  seatBySession: Map<string, string>;
  botIds: Set<string>;
}

/**
 * 作用：创建真人座位并写入基础索引。
 * 关键输入/输出：输入 session/token/name，输出新 seatId。
 * 副作用：修改 players/playerOrder/playerHands/seat 映射与 host。
 */
export function createHumanSeatFlow(
  ctx: SeatCreateContext,
  sessionId: string,
  token: string,
  rawName: string,
): string {
  const seatId = `seat_${ctx.seatByTokenSize + 1}`;
  const name = rawName || `玩家${ctx.seatByTokenSize + 1}`;

  const player = new PlayerState();
  player.clientId = seatId;
  player.name = name;
  player.isBot = false;
  player.connected = true;
  ctx.state.players.set(seatId, player);

  ctx.playerOrder.push(seatId);
  ctx.playerHands.set(seatId, []);
  ctx.baseNameBySeat.set(seatId, name);
  ctx.seatByToken.set(token, seatId);
  ctx.seatBySession.set(sessionId, seatId);
  ctx.botIds.delete(seatId);

  if (!ctx.state.hostPlayerId) {
    ctx.state.hostPlayerId = seatId;
  }

  return seatId;
}

export interface SeatReclaimContext {
  state: GameState;
  baseNameBySeat: Map<string, string>;
  botIds: Set<string>;
  seatBySession: Map<string, string>;
  seatByToken: Map<string, string>;
}

/**
 * 作用：处理断线后凭 token 重连，回收原座位控制权。
 * 关键输入/输出：输入 session/seat/token/name，输出是否成功。
 * 副作用：更新玩家在线态、机器人态与会话映射。
 */
export function reclaimSeatStateFlow(
  ctx: SeatReclaimContext,
  sessionId: string,
  seatId: string,
  token: string,
  rawName: string,
): boolean {
  const player = ctx.state.players.get(seatId);
  if (!player) {
    return false;
  }

  const name = rawName || ctx.baseNameBySeat.get(seatId) || player.name;
  ctx.baseNameBySeat.set(seatId, name);
  player.name = name;
  player.connected = true;
  player.isBot = false;
  ctx.botIds.delete(seatId);
  ctx.seatBySession.set(sessionId, seatId);
  ctx.seatByToken.set(token, seatId);
  return true;
}

/**
 * 作用：开局前补齐机器人到目标座位数。
 * 关键输入/输出：输入当前玩家容器与目标人数，输出无返回值。
 * 副作用：新增/更新机器人玩家与 botIds。
 */
export function ensureBotSeatsForStart(
  state: GameState,
  playerOrder: string[],
  playerHands: Map<string, Card[]>,
  botIds: Set<string>,
  targetSeats: number,
): void {
  while (playerOrder.length < targetSeats) {
    const seatId = `bot_${playerOrder.length + 1}`;
    if (state.players.has(seatId)) {
      continue;
    }
    const bot = new PlayerState();
    bot.clientId = seatId;
    bot.name = `BOT_${playerOrder.length + 1}`;
    bot.isBot = true;
    bot.connected = false;
    state.players.set(seatId, bot);
    playerOrder.push(seatId);
    playerHands.set(seatId, []);
    botIds.add(seatId);
  }

  for (const seatId of playerOrder) {
    const player = state.players.get(seatId);
    if (!player) {
      continue;
    }
    if (player.isBot) {
      botIds.add(seatId);
    } else {
      botIds.delete(seatId);
    }
  }
}

/**
 * 作用：每局开始前清理所有玩家的局内声明与展示区域。
 * 关键输入/输出：输入状态与座位顺序，输出无返回值。
 * 副作用：清空 discard/exposed/general/wildcard/fish 与公共弃牌。
 */
export function resetRoundPlayers(
  state: GameState,
  playerOrder: string[],
): void {
  for (const seatId of playerOrder) {
    const player = state.players.get(seatId);
    if (!player) {
      continue;
    }
    player.declaredKongs = 0;
    player.declaredReady = false;
    player.discardPile.clear();
    player.exposedArea.clear();
    player.exposedGroupSizes.clear();
    player.exposedGroupKinds.clear();
    player.generalArea.clear();
    player.wildcardPool.clear();
    player.fishArea.clear();
  }
  state.publicDiscardPile.clear();
}

/**
 * 作用：按规则发起手牌（庄家 21，其余 20）。
 * 关键输入/输出：输入座位顺序、庄家与牌堆，输出无返回值。
 * 副作用：消费 deck 并写入 playerHands。
 */
export function dealInitialHands(
  playerOrder: string[],
  deck: Card[],
  playerHands: Map<string, Card[]>,
): void {
  for (const seatId of playerOrder) {
    const count = 20;
    const hand: Card[] = [];
    for (let i = 0; i < count; i += 1) {
      const card = deck.shift();
      if (card) {
        hand.push(card);
      }
    }
    playerHands.set(seatId, hand);
  }
}

/**
 * 作用：判断声明阶段是否全员 ready。
 * 关键输入/输出：输入座位顺序和玩家读取函数，输出布尔值。
 * 副作用：无。
 */
export function areAllDeclarationsReady(playerOrder: string[], getPlayer: (seatId: string) => PlayerState | undefined): boolean {
  return playerOrder.every((seatId) => getPlayer(seatId)?.declaredReady);
}

function validateFishSelection(cards: Card[]): boolean {
  if (!cards.length) {
    return true;
  }

  let goldCount = 0;
  const nonGoldFaceCount = new Map<string, number>();
  for (const card of cards) {
    if (card.color === "gold") {
      goldCount += 1;
      continue;
    }
    const key = `${card.color}:${card.type}`;
    nonGoldFaceCount.set(key, (nonGoldFaceCount.get(key) ?? 0) + 1);
  }

  for (const count of nonGoldFaceCount.values()) {
    if (count !== 4) {
      return false;
    }
  }
  return goldCount === 0 || goldCount === 4 || goldCount === 5;
}

function countHiddenKansFromCards(cards: Card[]): number {
  const counter = new Map<string, number>();
  for (const card of cards) {
    const key = card.color === "gold" ? "gold" : `${card.color}:${card.type}`;
    counter.set(key, (counter.get(key) ?? 0) + 1);
  }
  return [...counter.values()].reduce((sum, count) => sum + Math.floor(count / 3), 0);
}

function pickCardsByIdsFromHand(hand: Card[], ids: string[]): Card[] {
  const wanted = new Set(ids);
  const selected: Card[] = [];
  for (const card of hand) {
    if (wanted.has(card.id)) {
      selected.push(card);
    }
  }
  return selected;
}

function buildDefaultFishCards(hand: Card[]): Card[] {
  const byFace = new Map<string, Card[]>();
  const goldCards: Card[] = [];
  for (const card of hand) {
    if (card.color === "gold") {
      goldCards.push(card);
      continue;
    }
    const key = `${card.color}:${card.type}`;
    const list = byFace.get(key) ?? [];
    list.push(card);
    byFace.set(key, list);
  }

  const selected: Card[] = [];
  for (const cards of byFace.values()) {
    if (cards.length >= 4) {
      selected.push(...cards.slice(0, 4));
    }
  }
  if (goldCards.length >= 5) {
    selected.push(...goldCards.slice(0, 5));
  } else if (goldCards.length >= 4) {
    selected.push(...goldCards.slice(0, 4));
  }
  return selected;
}

export interface DeclarationSelection {
  declaredKongs: number;
  selectedCards: Card[];
  idMatch: boolean;
  fishValid: boolean;
}

/**
 * 作用：构建并校验单个玩家声明输入（杠数与亮鱼牌）。
 * 关键输入/输出：输入手牌和声明 payload，输出选择结果与合法性。
 * 副作用：无。
 */
export function buildDeclarationSelection(hand: Card[], payload: { declaredKongs?: number; fishCardIds?: string[] }): DeclarationSelection {
  const fishIds = Array.isArray(payload?.fishCardIds) ? payload.fishCardIds.map(String).filter(Boolean) : [];
  const uniqueFishIds = [...new Set(fishIds)];
  const selectedCards = pickCardsByIdsFromHand(hand, uniqueFishIds);
  const idMatch = uniqueFishIds.length === selectedCards.length;
  const fishValid = validateFishSelection(selectedCards);
  const selectedIds = new Set(selectedCards.map((card) => card.id));
  const remainingAfterFish = hand.filter((card) => !selectedIds.has(card.id));
  const maxKongs = countHiddenKansFromCards(remainingAfterFish);
  const declaredKongs = Math.min(Math.max(0, Number(payload?.declaredKongs) || 0), maxKongs);
  return {
    declaredKongs,
    selectedCards,
    idMatch,
    fishValid,
  };
}

export function buildDefaultDeclarationPayload(hand: Card[]): { declaredKongs: number; fishCardIds: string[] } {
  const selectedCards = buildDefaultFishCards(hand);
  const selectedIds = new Set(selectedCards.map((card) => card.id));
  const declaredKongs = countHiddenKansFromCards(hand.filter((card) => !selectedIds.has(card.id)));
  return {
    declaredKongs,
    fishCardIds: selectedCards.map((card) => card.id),
  };
}

type SeatId = string;

export interface StartDeclaringDeps {
  playerOrder: SeatId[];
  getPlayer: (seatId: SeatId) => PlayerState | undefined;
  submitDeclaration: (seatId: SeatId, force: boolean) => void;
  syncAllPrivateHands: () => void;
  broadcastAvailableActions: () => void;
  allReady: () => boolean;
  finishDeclaringPhase: () => void;
  scheduleDeclareTimeout: () => void;
}

/**
 * 作用：进入声明阶段后自动处理机器人声明并安排超时。
 * 关键输入/输出：输入声明阶段依赖，输出无返回值。
 * 副作用：可能触发 `submitDeclaration/finishDeclaringPhase/scheduleDeclareTimeout`。
 */
export function startDeclaringFlow(deps: StartDeclaringDeps): void {
  for (const seatId of deps.playerOrder) {
    const player = deps.getPlayer(seatId);
    if (!player || player.declaredReady) {
      continue;
    }
    if (player.isBot) {
      deps.submitDeclaration(seatId, true);
    }
  }
  deps.syncAllPrivateHands();
  deps.broadcastAvailableActions();
  if (deps.allReady()) {
    deps.finishDeclaringPhase();
    return;
  }
  deps.scheduleDeclareTimeout();
}

export interface TimeoutDeclaringDeps {
  playerOrder: SeatId[];
  getPlayer: (seatId: SeatId) => PlayerState | undefined;
  submitDeclaration: (seatId: SeatId, force: boolean) => void;
  allReady: () => boolean;
  finishDeclaringPhase: () => void;
}

/**
 * 作用：声明超时后强制补齐未声明玩家。
 * 关键输入/输出：输入声明阶段依赖，输出无返回值。
 * 副作用：会对未声明玩家执行强制声明并可能结束声明阶段。
 */
export function runDeclaringTimeoutFlow(deps: TimeoutDeclaringDeps): void {
  for (const seatId of deps.playerOrder) {
    const player = deps.getPlayer(seatId);
    if (!player || player.declaredReady) {
      continue;
    }
    deps.submitDeclaration(seatId, true);
  }
  if (deps.allReady()) {
    deps.finishDeclaringPhase();
  }
}

export interface LobbyResetContext {
  state: GameState;
  playerOrder: string[];
  botIds: Set<string>;
  playerHands: Map<string, Card[]>;
  baseNameBySeat: Map<string, string>;
  seatBySession: Map<string, string>;
  seatByToken: Map<string, string>;
  targetSeats: number;
  resetRuntime: () => void;
  syncAllPrivateHands: () => void;
  broadcastAvailableActions: () => void;
}

/**
 * 作用：对局结束后回到大厅并保留真人座位。
 * 关键输入/输出：输入大厅重置上下文，输出无返回值。
 * 副作用：移除 bot 座位、重置局内字段并刷新动作面板。
 */
export function resetToLobby(context: LobbyResetContext): void {
  context.resetRuntime();

  const humanSeats = context.playerOrder.filter((seatId) => !context.botIds.has(seatId));
  const humanSet = new Set(humanSeats);

  for (const seatId of context.playerOrder) {
    if (humanSet.has(seatId)) {
      continue;
    }
    context.state.players.delete(seatId);
    context.playerHands.delete(seatId);
    context.baseNameBySeat.delete(seatId);
  }

  context.playerOrder.length = 0;
  context.playerOrder.push(...humanSeats);
  context.botIds.clear();

  const onlineSeatSet = new Set([...context.seatBySession.values()]);
  for (const seatId of context.playerOrder) {
    const player = context.state.players.get(seatId);
    if (!player) {
      continue;
    }
    player.declaredKongs = 0;
    player.declaredReady = false;
    player.discardPile.clear();
    player.exposedArea.clear();
    player.exposedGroupSizes.clear();
    player.exposedGroupKinds.clear();
    player.generalArea.clear();
    player.wildcardPool.clear();
    player.fishArea.clear();
    context.playerHands.set(seatId, []);
    player.connected = onlineSeatSet.has(seatId);
    player.isBot = false;
    player.name = context.baseNameBySeat.get(seatId) ?? player.name;
  }

  if (!context.state.players.has(context.state.hostPlayerId) && context.playerOrder.length > 0) {
    context.state.hostPlayerId = context.playerOrder[0];
  }

  context.state.phase = "waiting";
  context.state.dealerId = "";
  context.state.dealerPickerId = "";
  context.state.currentPlayerId = "";
  context.state.responsePhase = "collective";
  context.state.deckCount = 0;
  context.state.declareEndsAt = 0;
  context.state.targetCard = new CardSchema();
  context.state.isMoCard = false;
  context.state.previousPlayerId = "";
  context.state.currentTurnPlayerId = "";
  context.state.loopStage = "";
  context.state.activeResponderId = "";
  context.state.pollOriginPlayerId = "";
  context.state.responseEndsAt = 0;
  context.state.publicDiscardPile.clear();
  context.state.responseCard = new CardSchema();
  context.state.dealerCard = new CardSchema();
  context.state.lastAction = `LOBBY ${context.seatByToken.size}/${context.targetSeats}`;
  context.syncAllPrivateHands();
  context.broadcastAvailableActions();
}

export interface RoundEndContext<RoundResultPlayer> {
  state: GameState;
  resetCollectivePolling: () => void;
  clearBotTimer: () => void;
  setPendingResponseNull: () => void;
  setAwaitingDiscardOwnerNull: () => void;
  broadcast: (event: string, payload: unknown) => void;
  buildRoundResultPlayers: (winnerId: string | null, groups: string[]) => RoundResultPlayer[];
  buildRemainingDeckPreview: () => Card[];
  broadcastAvailableActions: () => void;
}

/**
 * 作用：统一执行回合结束状态落地与结算广播。
 * 关键输入/输出：输入结算上下文、结算动作、赢家与番型，输出无返回值。
 * 副作用：切换 `phase=ended`，清空轮询运行态并广播结果。
 */
export function endRoundFlow<RoundResultPlayer>(
  context: RoundEndContext<RoundResultPlayer>,
  lastAction: string,
  winnerId: string | null = null,
  groups: string[] = [],
): void {
  const roundResultPlayers = context.buildRoundResultPlayers(winnerId, groups);
  const remainingDeck = context.buildRemainingDeckPreview();
  context.state.phase = "ended";
  context.state.lastAction = lastAction;
  context.setPendingResponseNull();
  context.setAwaitingDiscardOwnerNull();
  context.resetCollectivePolling();
  context.clearBotTimer();
  context.state.loopStage = "";
  context.state.activeResponderId = "";
  context.state.pollOriginPlayerId = "";
  context.state.responseEndsAt = 0;

  if (winnerId) {
    context.broadcast("hu_result", { winnerId, groups });
  }

  context.broadcast("round_result", {
    winnerId,
    groups,
    players: roundResultPlayers,
    remainingDeck,
  });

  context.broadcastAvailableActions();
}

export interface ScoreBreakdownItem {
  key: string;
  label: string;
  count: number;
  unit: number;
  total: number;
}

export interface RoundResultPlayer {
  clientId: string;
  name: string;
  hand: Card[];
  declaredKongs: number;
  huType?: "small" | "big" | null;
  winningGroups: Array<{
    key: string;
    cards: Card[];
  }>;
  resolvedHandGroups: Array<{
    key: string;
    cards: Card[];
  }>;
  exposedArea: Card[];
  exposedGroupSizes: number[];
  exposedGroupKinds: string[];
  generalArea: Card[];
  fishArea: Card[];
  discardCount: number;
  scoreBreakdown: ScoreBreakdownItem[];
  totalScore: number;
}

interface RoundResultView {
  clientId: string;
  name: string;
  hand: Card[];
  declaredKongs: number;
  huType: "small" | "big" | null;
  winningGroups: Array<{
    key: string;
    cards: Card[];
  }>;
  resolvedHandGroups: Array<{
    key: string;
    cards: Card[];
  }>;
  exposedArea: Card[];
  exposedGroupSizes: number[];
  exposedGroupKinds: string[];
  generalArea: Card[];
  fishArea: Card[];
  discardCount: number;
  exposedGroupDetails: SettlementGroupDetail[];
  generalGroupDetails: SettlementGroupDetail[];
  fishGroupDetails: SettlementGroupDetail[];
  winningGroupDetails: SettlementGroupDetail[];
  resolvedHandGroupDetails: SettlementGroupDetail[];
}

interface SettlementGroupDetail {
  key: string;
  label: string;
  unit: number;
  cards: Card[];
}

function getScoreRules(): Record<string, { label: string; unit: number }> {
  return {
    Pair: { label: "对子", unit: 0 },
    Peng: { label: "碰", unit: 1 },
    FrameJMP: { label: "车马炮架", unit: 1 },
    FrameJSX: { label: "将士象架", unit: 1 },
    TripleZu: { label: "三兵组", unit: 1 },
    QuadZu: { label: "四兵组", unit: 2 },
    Triplet: { label: "坎", unit: 3 },
    Quad: { label: "开", unit: 6 },
    JiangTriplet: { label: "将坎", unit: 3 },
    JiangQuad: { label: "将开", unit: 6 },
    GoldTriplet: { label: "金条坎", unit: 9 },
    GoldQuad: { label: "金条开", unit: 18 },
    Fish: { label: "普通鱼", unit: 8 },
    GoldFish: { label: "金条鱼", unit: 24 },
    SingleJiang: { label: "单将组", unit: 1 },
    SingleGold: { label: "单金条组", unit: 3 },
  };
}

function splitCardGroups(cards: Card[], sizes: number[]): Card[][] {
  const groups: Card[][] = [];
  let offset = 0;
  for (const size of sizes) {
    if (!Number.isFinite(size) || size <= 0) {
      continue;
    }
    const chunk = cards.slice(offset, offset + size);
    offset += size;
    if (chunk.length === size) {
      groups.push(chunk);
    }
  }
  return groups;
}

const COLOR_LABELS: Record<string, string> = {
  red: "红",
  yellow: "黄",
  green: "绿",
  white: "白",
};

const FACE_LABELS: Record<string, string> = {
  jiang: "将",
  shi: "士",
  xiang: "相",
  ju: "车",
  ma: "马",
  pao: "炮",
  zu: "卒",
  gong: "公",
  hou: "侯",
  bo: "伯",
  zi: "子",
  nan: "男",
};

function faceLabelForColorType(color: string, type: string): string {
  if (color === "red" || color === "yellow") {
    const south: Record<string, string> = {
      jiang: "将",
      shi: "仕",
      xiang: "相",
      ju: "车",
      ma: "马",
      pao: "炮",
      zu: "兵",
    };
    return south[type] ?? FACE_LABELS[type] ?? type;
  }
  if (color === "green" || color === "white") {
    const north: Record<string, string> = {
      jiang: "将",
      shi: "士",
      xiang: "象",
      ju: "车",
      ma: "马",
      pao: "包",
      zu: "卒",
    };
    return north[type] ?? FACE_LABELS[type] ?? type;
  }
  return FACE_LABELS[type] ?? type;
}

function faceLabelForCard(card: Card): string {
  return faceLabelForColorType(card.color, card.type);
}

function cardShortLabel(card: Card): string {
  const face = faceLabelForCard(card);
  if (card.color === "gold") {
    return face;
  }
  return `${COLOR_LABELS[card.color] ?? card.color}${face}`;
}

function isSameFaceGroup(cards: Card[]): boolean {
  if (cards.length === 0) {
    return false;
  }
  const head = cards[0];
  return cards.every((card) => card.color === head.color && card.type === head.type);
}

function classifyExposedGroup(cards: Card[]): string[] {
  if (!cards.length) {
    return [];
  }
  if (cards.every((card) => card.color === "gold")) {
    if (cards.length >= 4) {
      return ["GoldQuad"];
    }
    if (cards.length === 3) {
      return ["GoldTriplet"];
    }
    if (cards.length === 1) {
      return ["SingleGold"];
    }
    return [];
  }

  if (isSameFaceGroup(cards)) {
    const type = cards[0].type;
    if (type === "jiang") {
      if (cards.length >= 4) {
        return ["JiangQuad"];
      }
      if (cards.length === 3) {
        return ["JiangTriplet"];
      }
      if (cards.length === 1) {
        return ["SingleJiang"];
      }
      if (cards.length === 2) {
        return ["Pair"];
      }
      return [];
    }
    if (cards.length >= 4) {
      return ["Quad"];
    }
    if (cards.length === 3) {
      return ["Triplet"];
    }
    if (cards.length === 2) {
      return ["Pair"];
    }
    return [];
  }

  if (cards.length === 3) {
    const color = cards[0].color;
    const sameColor = cards.every((card) => card.color === color);
    const types = new Set(cards.map((card) => card.type));
    if (sameColor && types.has("ju") && types.has("ma") && types.has("pao")) {
      return ["FrameJMP"];
    }
    if (sameColor && types.has("jiang") && types.has("shi") && types.has("xiang")) {
      return ["FrameJSX"];
    }
    if (cards.every((card) => card.type === "zu") && new Set(cards.map((card) => card.color)).size === 3) {
      return ["TripleZu"];
    }
  }

  if (cards.length === 4 && cards.every((card) => card.type === "zu") && new Set(cards.map((card) => card.color)).size === 4) {
    return ["QuadZu"];
  }

  return [];
}

function scoreUnitForKey(key: string): number {
  return getScoreRules()[key]?.unit ?? 0;
}

function describeGroupLabel(key: string, cards: Card[]): string {
  const head = cards[0];
  if (!head) {
    return key;
  }
  switch (key) {
    case "GoldTriplet":
      return "金条坎";
    case "GoldQuad":
      return "金条开";
    case "Peng":
      return `${cardShortLabel(head)}碰`;
    case "Triplet":
    case "JiangTriplet":
      return `${cardShortLabel(head)}坎`;
    case "Quad":
    case "JiangQuad":
      return `${cardShortLabel(head)}开`;
    case "FrameJMP":
      return `${COLOR_LABELS[head.color] ?? head.color}车马炮架`;
    case "FrameJSX":
      return `${COLOR_LABELS[head.color] ?? head.color}${["jiang", "shi", "xiang"]
        .map((type) => faceLabelForColorType(head.color, type))
        .join("")}架`;
    case "TripleZu":
      return "三卒组";
    case "QuadZu":
      return "四卒组";
    case "Fish":
      return `${cardShortLabel(head)}鱼`;
    case "GoldFish":
      return "金条鱼";
    case "SingleJiang":
      return `${cardShortLabel(head)}单张`;
    case "SingleGold":
      return `金条单张（${faceLabelForCard(head)}）`;
    case "Pair":
      return `${cardShortLabel(head)}对子`;
    default:
      return `${cardShortLabel(head)}组`;
  }
}

function toGroupDetails(groups: Card[][]): SettlementGroupDetail[] {
  const details: SettlementGroupDetail[] = [];
  for (const cards of groups) {
    for (const key of classifyExposedGroup(cards)) {
      details.push({
        key,
        label: describeGroupLabel(key, cards),
        unit: scoreUnitForKey(key),
        cards,
      });
    }
  }
  return details;
}

function splitExposedGroupsWithKinds(cards: Card[], sizes: number[], kinds: string[]): Array<{ cards: Card[]; kind: string }> {
  const groups: Array<{ cards: Card[]; kind: string }> = [];
  let offset = 0;
  for (let index = 0; index < sizes.length; index += 1) {
    const size = sizes[index];
    if (!Number.isFinite(size) || size <= 0) {
      continue;
    }
    const chunk = cards.slice(offset, offset + size);
    offset += size;
    if (chunk.length === size) {
      groups.push({ cards: chunk, kind: kinds[index] ?? "" });
    }
  }
  return groups;
}

function detailFromKey(key: string, cards: Card[]): SettlementGroupDetail {
  return {
    key,
    label: describeGroupLabel(key, cards),
    unit: scoreUnitForKey(key),
    cards,
  };
}

function fallbackGroupLabelForKey(key: string): string {
  switch (key) {
    case "GoldTriplet":
      return "金条坎";
    case "GoldQuad":
      return "金条开";
    case "GoldFish":
      return "金条鱼";
    case "SingleGold":
      return "金条单张";
    default:
      return getScoreRules()[key]?.label ?? key;
  }
}

function classifyChiLikeGroup(cards: Card[]): SettlementGroupDetail[] {
  if (!cards.length) {
    return [];
  }
  if (cards.every((card) => card.color === "gold")) {
    return cards.length === 1 ? [detailFromKey("SingleGold", cards)] : [];
  }
  if (isSameFaceGroup(cards)) {
    const head = cards[0];
    if (head.type === "jiang") {
      if (cards.length === 1) {
        return [detailFromKey("SingleJiang", cards)];
      }
      return [detailFromKey("Pair", cards)];
    }
    if (cards.length >= 2) {
      return [detailFromKey("Pair", cards)];
    }
    return [];
  }
  return toGroupDetails([cards]);
}

function classifyExposedGroupByKind(cards: Card[], kind: string): SettlementGroupDetail[] {
  if (!cards.length) {
    return [];
  }
  const head = cards[0];
  const normalizedKind = kind || "";
  if (normalizedKind === "kai" || (!normalizedKind && isSameFaceGroup(cards) && cards.length >= 4)) {
    if (cards.every((card) => card.color === "gold")) {
      return [detailFromKey("GoldQuad", cards)];
    }
    if (head.type === "jiang") {
      return [detailFromKey("JiangQuad", cards)];
    }
    return [detailFromKey("Quad", cards)];
  }
  if (normalizedKind === "peng" || (!normalizedKind && isSameFaceGroup(cards) && cards.length === 3 && head.type !== "jiang" && head.color !== "gold")) {
    return [
      {
        key: "Peng",
        label: `${cardShortLabel(head)}碰`,
        unit: scoreUnitForKey("Peng"),
        cards,
      },
    ];
  }
  return classifyChiLikeGroup(cards);
}

function buildExposedVisibleGroupDetails(
  exposedArea: Card[],
  exposedGroupSizes: number[],
  exposedGroupKinds: string[],
): SettlementGroupDetail[] {
  return splitExposedGroupsWithKinds(exposedArea, exposedGroupSizes, exposedGroupKinds).flatMap((group) =>
    classifyExposedGroupByKind(group.cards, group.kind),
  );
}

function buildGeneralGroupDetails(generalArea: Card[]): SettlementGroupDetail[] {
  return generalArea.flatMap((card) => classifyChiLikeGroup([card]));
}

function buildFishGroupDetails(fishArea: Card[]): SettlementGroupDetail[] {
  if (!fishArea.length) {
    return [];
  }
  if (fishArea.every((card) => card.color === "gold") && (fishArea.length === 4 || fishArea.length === 5)) {
    return [
      {
        key: "GoldFish",
        label: "金条鱼",
        unit: scoreUnitForKey("GoldFish"),
        cards: [...fishArea],
      },
    ];
  }
  const counter = new Map<string, Card[]>();
  for (const card of fishArea) {
    const groupKey = `${card.color}:${card.type}`;
    const list = counter.get(groupKey) ?? [];
    list.push(card);
    counter.set(groupKey, list);
  }
  const details: SettlementGroupDetail[] = [];
  for (const cards of counter.values()) {
    if (cards.length === 4) {
      details.push({
        key: "Fish",
        label: `${cardShortLabel(cards[0])}鱼`,
        unit: scoreUnitForKey("Fish"),
        cards,
      });
    }
  }
  return details;
}

function buildResolvedHandGroupDetails(
  groups: Array<{
    key: string;
    cards: Card[];
  }>,
): SettlementGroupDetail[] {
  return groups.map((group) => detailFromKey(group.key, group.cards));
}

function splitWinnerResponseGroups(
  groups: Array<{
    key: string;
    cards: Card[];
  }>,
  winnerResponseCard: Card | null,
): {
  winningGroups: Array<{
    key: string;
    cards: Card[];
  }>;
  remainingGroups: Array<{
    key: string;
    cards: Card[];
  }>;
} {
  if (!winnerResponseCard?.id) {
    return {
      winningGroups: [],
      remainingGroups: groups,
    };
  }
  const winningGroups: Array<{ key: string; cards: Card[] }> = [];
  const remainingGroups: Array<{ key: string; cards: Card[] }> = [];
  groups.forEach((group) => {
    if (group.cards.some((card) => card.id === winnerResponseCard.id)) {
      winningGroups.push(group);
      return;
    }
    remainingGroups.push(group);
  });
  return { winningGroups, remainingGroups };
}

function normalizeWinningResponseGroups(
  groups: Array<{
    key: string;
    cards: Card[];
  }>,
  winnerResponseCard: Card | null,
): Array<{
  key: string;
  cards: Card[];
}> {
  if (!winnerResponseCard?.id) {
    return groups;
  }
  return groups.map((group) => {
    if (
      group.key === "Triplet" &&
      group.cards.length === 3 &&
      group.cards.some((card) => card.id === winnerResponseCard.id) &&
      isSameFaceGroup(group.cards) &&
      group.cards[0]?.color !== "gold" &&
      group.cards[0]?.type !== "jiang"
    ) {
      return { ...group, key: "Peng" };
    }
    return group;
  });
}

function buildPrivateTripletDetailsFromHand(hand: Card[], declaredKongs: number): SettlementGroupDetail[] {
  const counter = new Map<string, Card[]>();
  for (const card of hand) {
    const key = card.color === "gold" ? "gold" : `${card.color}:${card.type}`;
    const list = counter.get(key) ?? [];
    list.push(card);
    counter.set(key, list);
  }
  const details: SettlementGroupDetail[] = [];
  let remainingDeclaredKongs = Math.max(0, Math.floor(Number(declaredKongs) || 0));
  for (const cards of counter.values()) {
    const fullTriplets = Math.floor(cards.length / 3);
    for (let index = 0; index < fullTriplets; index += 1) {
      const chunk = cards.slice(index * 3, index * 3 + 3);
      if (chunk.length < 3) {
        continue;
      }
      if (remainingDeclaredKongs <= 0) {
        details.push(detailFromKey("Peng", chunk));
        continue;
      }
      remainingDeclaredKongs -= 1;
      if (chunk.every((card) => card.color === "gold")) {
        details.push(detailFromKey("GoldTriplet", chunk));
        continue;
      }
      if (chunk[0].type === "jiang") {
        details.push(detailFromKey("JiangTriplet", chunk));
        continue;
      }
      details.push(detailFromKey("Triplet", chunk));
    }
  }
  return details;
}

const CHI_DETAIL_KEYS = new Set(["FrameJMP", "FrameJSX", "TripleZu", "QuadZu", "Pair"]);
const PENG_DETAIL_KEYS = new Set(["Peng"]);
const HIDDEN_KAN_DETAIL_KEYS = new Set(["Triplet", "JiangTriplet", "GoldTriplet"]);
const KAI_DETAIL_KEYS = new Set(["Quad", "JiangQuad", "GoldQuad"]);
const FISH_DETAIL_KEYS = new Set(["Fish", "GoldFish"]);
const SINGLE_DETAIL_KEYS = new Set(["SingleJiang", "SingleGold"]);

interface WinnerHuBreakdown {
  huType: "small" | "big";
  perOpponent: number;
  subtotal: number;
  itemsForWinner: ScoreBreakdownItem[];
  itemsForLoser: ScoreBreakdownItem[];
}

/**
 * 作用：将番型列表聚合成可展示的分项计分。
 * 关键输入/输出：输入番型 key 列表，输出分项与总分。
 * 副作用：无。
 */
export function buildScoreBreakdown(groups: string[]): { items: ScoreBreakdownItem[]; total: number } {
  const rules = getScoreRules();
  const counter = new Map<string, number>();
  for (const group of groups) {
    counter.set(group, (counter.get(group) ?? 0) + 1);
  }

  const items: ScoreBreakdownItem[] = [];
  let total = 0;
  for (const [key, count] of counter.entries()) {
    const rule = rules[key];
    const unit = rule?.unit ?? 0;
    const label = rule?.label ?? key;
    const lineTotal = unit * count;
    total += lineTotal;
    items.push({
      key,
      label,
      count,
      unit,
      total: lineTotal,
    });
  }
  items.sort((a, b) => b.total - a.total || b.unit - a.unit || a.key.localeCompare(b.key));
  return { items, total };
}

function sortSettlementBreakdown(items: ScoreBreakdownItem[]): ScoreBreakdownItem[] {
  return [...items].sort(
    (a, b) =>
      Math.abs(b.total) - Math.abs(a.total) ||
      b.total - a.total ||
      Math.abs(b.unit) - Math.abs(a.unit) ||
      a.key.localeCompare(b.key),
  );
}

function buildWinnerHuBreakdown(view: RoundResultView, payerCount: number): WinnerHuBreakdown {
  const winningCardIds = new Set(view.winningGroupDetails.flatMap((detail) => detail.cards.map((card) => card.id)));
  const handCardsForHiddenKan = view.hand.filter((card) => !winningCardIds.has(card.id));
  const lineDetails = [
    ...view.exposedGroupDetails.filter((detail) => CHI_DETAIL_KEYS.has(detail.key) || PENG_DETAIL_KEYS.has(detail.key) || KAI_DETAIL_KEYS.has(detail.key) || SINGLE_DETAIL_KEYS.has(detail.key)),
    ...view.generalGroupDetails.filter((detail) => SINGLE_DETAIL_KEYS.has(detail.key)),
    ...view.fishGroupDetails.filter((detail) => FISH_DETAIL_KEYS.has(detail.key)),
    ...view.winningGroupDetails.filter((detail) => detail.unit > 0),
    ...view.resolvedHandGroupDetails.filter((detail) => CHI_DETAIL_KEYS.has(detail.key) || SINGLE_DETAIL_KEYS.has(detail.key)),
    ...buildPrivateTripletDetailsFromHand(handCardsForHiddenKan, view.declaredKongs).filter(
      (detail) => HIDDEN_KAN_DETAIL_KEYS.has(detail.key) || PENG_DETAIL_KEYS.has(detail.key),
    ),
  ].filter((detail) => detail.unit > 0);

  const subtotal = 3 + lineDetails.reduce((sum, detail) => sum + detail.unit, 0);
  const huType: "small" | "big" =
    lineDetails.some((detail) => KAI_DETAIL_KEYS.has(detail.key) || FISH_DETAIL_KEYS.has(detail.key)) ? "big" : "small";
  const perOpponent = huType === "big" ? subtotal * 2 : subtotal;
  const itemsForWinner: ScoreBreakdownItem[] = [];
  const itemsForLoser: ScoreBreakdownItem[] = [];

  if (payerCount > 0) {
    itemsForWinner.push({
      key: "HuBase",
      label: "胡底",
      count: payerCount,
      unit: 3,
      total: 3 * payerCount,
    });
    itemsForLoser.push({
      key: "HuBase",
      label: "胡底",
      count: 1,
      unit: -3,
      total: -3,
    });
  }

  lineDetails.forEach((detail, index) => {
    if (payerCount <= 0) {
      return;
    }
    itemsForWinner.push({
      key: `HuWin:${detail.key}:${index}`,
      label: detail.label,
      count: payerCount,
      unit: detail.unit,
      total: detail.unit * payerCount,
    });
    itemsForLoser.push({
      key: `HuLose:${detail.key}:${index}`,
      label: detail.label,
      count: 1,
      unit: -detail.unit,
      total: -detail.unit,
    });
  });

  if (huType === "big" && subtotal > 0 && payerCount > 0) {
    itemsForWinner.push({
      key: "HuBigMultiplier",
      label: "大胡翻倍",
      count: payerCount,
      unit: subtotal,
      total: subtotal * payerCount,
    });
    itemsForLoser.push({
      key: "HuBigMultiplier",
      label: "大胡翻倍",
      count: 1,
      unit: -subtotal,
      total: -subtotal,
    });
  }

  return { huType, perOpponent, subtotal, itemsForWinner, itemsForLoser };
}

function buildWinnerHuBreakdownFromKeys(groups: string[], payerCount: number): WinnerHuBreakdown {
  const lineDetails = groups
    .map((key) => ({
      key,
      label: fallbackGroupLabelForKey(key),
      unit: scoreUnitForKey(key),
      cards: [] as Card[],
    }))
    .filter((detail) => detail.unit > 0);
  const subtotal = 3 + lineDetails.reduce((sum, detail) => sum + detail.unit, 0);
  const huType: "small" | "big" =
    lineDetails.some((detail) => KAI_DETAIL_KEYS.has(detail.key) || FISH_DETAIL_KEYS.has(detail.key)) ? "big" : "small";
  const perOpponent = huType === "big" ? subtotal * 2 : subtotal;
  const itemsForWinner: ScoreBreakdownItem[] = [];
  const itemsForLoser: ScoreBreakdownItem[] = [];
  if (payerCount > 0) {
    itemsForWinner.push({
      key: "HuBase",
      label: "胡底",
      count: payerCount,
      unit: 3,
      total: 3 * payerCount,
    });
    itemsForLoser.push({
      key: "HuBase",
      label: "胡底",
      count: 1,
      unit: -3,
      total: -3,
    });
  }
  lineDetails.forEach((detail, index) => {
    if (payerCount <= 0) {
      return;
    }
    itemsForWinner.push({
      key: `HuWin:${detail.key}:${index}`,
      label: detail.label,
      count: payerCount,
      unit: detail.unit,
      total: detail.unit * payerCount,
    });
    itemsForLoser.push({
      key: `HuLose:${detail.key}:${index}`,
      label: detail.label,
      count: 1,
      unit: -detail.unit,
      total: -detail.unit,
    });
  });
  if (huType === "big" && subtotal > 0 && payerCount > 0) {
    itemsForWinner.push({
      key: "HuBigMultiplier",
      label: "大胡翻倍",
      count: payerCount,
      unit: subtotal,
      total: subtotal * payerCount,
    });
    itemsForLoser.push({
      key: "HuBigMultiplier",
      label: "大胡翻倍",
      count: 1,
      unit: -subtotal,
      total: -subtotal,
    });
  }
  return { huType, perOpponent, subtotal, itemsForWinner, itemsForLoser };
}

function buildMutualSettlementDetails(view: RoundResultView): SettlementGroupDetail[] {
  return [
    ...buildPrivateTripletDetailsFromHand(view.hand, view.declaredKongs),
    ...view.exposedGroupDetails.filter((detail) => KAI_DETAIL_KEYS.has(detail.key)),
  ];
}

function buildSettlementLines(
  view: RoundResultView,
  allViews: RoundResultView[],
  winnerId: string | null,
  winnerHuBreakdown: WinnerHuBreakdown | null,
): { items: ScoreBreakdownItem[]; total: number } {
  const items: ScoreBreakdownItem[] = [];
  const nonWinnerViews = winnerId ? allViews.filter((player) => player.clientId !== winnerId) : allViews;

  if (winnerId && winnerHuBreakdown) {
    if (view.clientId === winnerId) {
      items.push(...winnerHuBreakdown.itemsForWinner);
    } else {
      const winnerName = allViews.find((player) => player.clientId === winnerId)?.name ?? winnerId;
      items.push(
        ...winnerHuBreakdown.itemsForLoser.map((item) => ({
          ...item,
          key: `${item.key}:${view.clientId}`,
          label: `${winnerName} ${item.label}`,
        })),
      );
    }
  }

  if (!winnerId || view.clientId !== winnerId) {
    for (const owner of nonWinnerViews) {
      for (const [index, detail] of buildMutualSettlementDetails(owner).entries()) {
        if (detail.unit <= 0) {
          continue;
        }
        if (owner.clientId === view.clientId) {
          for (const other of nonWinnerViews) {
            if (other.clientId === owner.clientId) {
              continue;
            }
            items.push({
              key: `MutualGain:${owner.clientId}:${other.clientId}:${detail.key}:${index}`,
              label: `${other.name}付 ${detail.label}`,
              count: 1,
              unit: detail.unit,
              total: detail.unit,
            });
          }
        } else {
          items.push({
            key: `MutualLose:${owner.clientId}:${view.clientId}:${detail.key}:${index}`,
            label: `${owner.name} ${detail.label}`,
            count: 1,
            unit: -detail.unit,
            total: -detail.unit,
          });
        }
      }
    }
  }

  const total = items.reduce((sum, item) => sum + item.total, 0);
  return { items: sortSettlementBreakdown(items), total };
}

/**
 * 作用：构建 round_result 玩家视图（手牌/明牌/得分）。
 * 关键输入/输出：输入座位顺序、玩家容器与赢家信息，输出可广播数组。
 * 副作用：无。
 */
export function buildRoundResultPlayers(
  playerOrder: string[],
  players: MapSchema<PlayerState>,
  playerHands: Map<string, Card[]>,
  toPlainCard: (card: { id: string; color: string; type: string; source?: string }) => Card,
  winnerId: string | null,
  groups: string[],
  winnerResponseCard: Card | null = null,
): RoundResultPlayer[] {
  const views: RoundResultView[] = [];
  for (const seatId of playerOrder) {
    const player = players.get(seatId);
    const hand = playerHands.get(seatId) ?? [];
    const exposedArea = [...(player?.exposedArea ?? [])].map((card) => toPlainCard(card));
    const exposedGroupSizes = [...(player?.exposedGroupSizes ?? [])];
    const exposedGroupKinds = [...(player?.exposedGroupKinds ?? [])];
    const generalArea = [...(player?.generalArea ?? [])].map((card) => toPlainCard(card));
    const fishArea = [...(player?.fishArea ?? [])].map((card) => toPlainCard(card));
    const declaredKongs = Math.max(0, Math.floor(Number(player?.declaredKongs ?? 0) || 0));
    const discardCount = player?.discardPile.length ?? 0;
    const resolvedGroups =
      winnerId && seatId === winnerId && winnerResponseCard
        ? (explainHu(hand, winnerResponseCard).details ?? []).map((detail) => ({
            key: detail.key,
            cards: detail.cards,
          }))
        : [];
    const splitGroups =
      winnerId && seatId === winnerId ? splitWinnerResponseGroups(resolvedGroups, winnerResponseCard) : { winningGroups: [], remainingGroups: resolvedGroups };
    const winningGroups =
      winnerId && seatId === winnerId
        ? normalizeWinningResponseGroups(splitGroups.winningGroups, winnerResponseCard)
        : splitGroups.winningGroups;
    const resolvedHandGroups = splitGroups.remainingGroups;
    const exposedGroupDetails = buildExposedVisibleGroupDetails(exposedArea, exposedGroupSizes, exposedGroupKinds);
    const generalGroupDetails = buildGeneralGroupDetails(generalArea);
    const fishGroupDetails = buildFishGroupDetails(fishArea);
    const winningGroupDetails = buildResolvedHandGroupDetails(winningGroups);
    const resolvedHandGroupDetails = buildResolvedHandGroupDetails(resolvedHandGroups);
    views.push({
      clientId: seatId,
      name: player?.name ?? seatId,
      hand: hand.map((card) => toPlainCard(card)),
      declaredKongs,
      huType: null,
      winningGroups,
      resolvedHandGroups,
      exposedArea,
      exposedGroupSizes,
      exposedGroupKinds,
      generalArea,
      fishArea,
      discardCount,
      exposedGroupDetails,
      generalGroupDetails,
      fishGroupDetails,
      winningGroupDetails,
      resolvedHandGroupDetails,
    });
  }

  const winnerView = winnerId ? views.find((view) => view.clientId === winnerId) ?? null : null;
  const payerCount = Math.max(0, views.filter((view) => view.clientId !== winnerId).length);
  const winnerHuBreakdown = winnerView
    ? (() => {
        const computed = buildWinnerHuBreakdown(winnerView, payerCount);
        if (computed.subtotal > 3 || groups.length === 0) {
          return computed;
        }
        return buildWinnerHuBreakdownFromKeys(groups, payerCount);
      })()
    : null;
  if (winnerView && winnerHuBreakdown) {
    winnerView.huType = winnerHuBreakdown.huType;
  }

  return views.map((view) => {
    const settlement = buildSettlementLines(view, views, winnerId, winnerHuBreakdown);
    return {
      clientId: view.clientId,
      name: view.name,
      hand: view.hand,
      declaredKongs: view.declaredKongs,
      huType: view.huType,
      winningGroups: view.winningGroups,
      resolvedHandGroups: view.resolvedHandGroups,
      exposedArea: view.exposedArea,
      exposedGroupSizes: view.exposedGroupSizes,
      exposedGroupKinds: view.exposedGroupKinds,
      generalArea: view.generalArea,
      fishArea: view.fishArea,
      discardCount: view.discardCount,
      scoreBreakdown: settlement.items,
      totalScore: settlement.total,
    };
  });
}

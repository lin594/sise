import type { MapSchema } from "@colyseus/schema";
import { CardSchema, GameState, PlayerState } from "../../schema/game-state.schema.js";
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
  if (humanCount < minPlayersToStart) {
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
  dealerId: string,
  deck: Card[],
  playerHands: Map<string, Card[]>,
): void {
  for (const seatId of playerOrder) {
    const count = seatId === dealerId ? 21 : 20;
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
  const declaredKongs = Math.max(0, Number(payload?.declaredKongs) || 0);
  const fishIds = Array.isArray(payload?.fishCardIds) ? payload.fishCardIds.map(String).filter(Boolean) : [];
  const uniqueFishIds = [...new Set(fishIds)];
  const selectedCards = pickCardsByIdsFromHand(hand, uniqueFishIds);
  const idMatch = uniqueFishIds.length === selectedCards.length;
  const fishValid = validateFishSelection(selectedCards);
  return {
    declaredKongs,
    selectedCards,
    idMatch,
    fishValid,
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
    players: context.buildRoundResultPlayers(winnerId, groups),
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
  exposedArea: Card[];
  exposedGroupSizes: number[];
  generalArea: Card[];
  fishArea: Card[];
  discardCount: number;
  scoreBreakdown: ScoreBreakdownItem[];
  totalScore: number;
}

function getScoreRules(): Record<string, { label: string; unit: number }> {
  return {
    Pair: { label: "对子", unit: 0 },
    FrameJMP: { label: "车马炮架", unit: 1 },
    FrameJSX: { label: "将士象架", unit: 1 },
    TripleZu: { label: "三兵组", unit: 1 },
    QuadZu: { label: "四兵组", unit: 2 },
    Triplet: { label: "坎", unit: 3 },
    JiangTriplet: { label: "将坎", unit: 3 },
    JiangQuad: { label: "将开", unit: 6 },
    GoldTriplet: { label: "金条坎", unit: 9 },
    GoldQuad: { label: "金条开", unit: 18 },
    SingleJiang: { label: "单将组", unit: 1 },
    SingleGold: { label: "单金条组", unit: 3 },
  };
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
): RoundResultPlayer[] {
  const winnerScore = winnerId ? buildScoreBreakdown(groups) : { items: [], total: 0 };
  const result: RoundResultPlayer[] = [];
  for (const seatId of playerOrder) {
    const player = players.get(seatId);
    const hand = playerHands.get(seatId) ?? [];
    const exposedArea = [...(player?.exposedArea ?? [])].map((card) => toPlainCard(card));
    const exposedGroupSizes = [...(player?.exposedGroupSizes ?? [])];
    const generalArea = [...(player?.generalArea ?? [])].map((card) => toPlainCard(card));
    const fishArea = [...(player?.fishArea ?? [])].map((card) => toPlainCard(card));
    const discardCount = player?.discardPile.length ?? 0;
    const isWinner = winnerId === seatId;
    result.push({
      clientId: seatId,
      name: player?.name ?? seatId,
      hand: hand.map((card) => toPlainCard(card)),
      exposedArea,
      exposedGroupSizes,
      generalArea,
      fishArea,
      discardCount,
      scoreBreakdown: isWinner ? winnerScore.items : [],
      totalScore: isWinner ? winnerScore.total : 0,
    });
  }
  return result;
}

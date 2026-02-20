import type { MapSchema } from "@colyseus/schema";
import { CardSchema, GameState, PlayerState } from "../../schema/game-state.schema.js";
import type { Card } from "../../rules/types.js";

export type StartGameDecision =
  | { ok: true }
  | { ok: false; reason: "not_waiting" | "not_host" | "not_enough_players" };

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

export function canStartNextRound(seatId: string | undefined, phase: string, hostPlayerId: string): boolean {
  if (!seatId || phase !== "ended") {
    return false;
  }
  return seatId === hostPlayerId;
}

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
    GoldTriplet: { label: "金条坎", unit: 9 },
    SingleJiang: { label: "单将组", unit: 1 },
    SingleGold: { label: "单金条组", unit: 3 },
  };
}

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

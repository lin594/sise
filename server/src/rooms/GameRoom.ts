import { Room, Client } from "colyseus";
import { GameState, PlayerState, CardSchema } from "../schema/game-state.schema.js";
import { createDeck, isDiscardRestricted, isGeneral, isGold, isSameFace, shuffle } from "../rules/deck.js";
import { canChi, canKai, canPeng, findKaiPlan, getChiPlans } from "../rules/actions.js";
import { explainHu } from "../rules/hu.js";
import type { ActionType, Card } from "../rules/types.js";

interface PendingResponse {
  ownerId: string;
  card: Card;
  collectives: Map<string, ActionType>;
}

interface DeclareSetupPayload {
  declaredKongs?: number;
  fishCardIds?: string[];
}

interface RoundResultPlayer {
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

interface ScoreBreakdownItem {
  key: string;
  label: string;
  count: number;
  unit: number;
  total: number;
}

type HuLogMode = "off" | "all" | "success" | "fail";
type StateLogMode = "off" | "all" | "compact";

const COMPACT_STATE_ACTIONS = new Set<string>([
  "LOBBY",
  "TAKEOVER",
  "DEALER",
  "TURN_START",
  "KONG_DRAW",
  "DISCARD",
  "KAI",
  "PENG",
  "CHI",
  "PASS",
  "NO_DISCARD",
  "NO_RESPONSE",
  "HU",
  "HU_INVALID",
  "DECK_EMPTY",
]);

export class FourColorGameRoom extends Room<GameState> {
  maxClients = 4;

  private readonly minPlayersToStart = Math.max(1, Number(process.env.MIN_PLAYERS ?? 1));
  private readonly targetSeats = 4;

  private deck: Card[] = [];
  private playerHands = new Map<string, Card[]>(); // seatId -> cards
  private playerOrder: string[] = []; // seatIds in round order
  private botIds = new Set<string>(); // currently bot-controlled seatIds
  private seatBySession = new Map<string, string>(); // sessionId -> seatId
  private seatByToken = new Map<string, string>(); // token -> seatId
  private baseNameBySeat = new Map<string, string>(); // seatId -> human display name
  private pendingResponse: PendingResponse | null = null;
  private publicGeneralPool: Card[] = [];
  private awaitingDiscardOwnerId: string | null = null;
  private readonly botThinkMinMs = Math.max(
    0,
    Number(process.env.BOT_THINK_MIN_MS ?? process.env.BOT_THINK_MS ?? 1200),
  );
  private readonly botThinkMaxMs = Math.max(
    this.botThinkMinMs,
    Number(process.env.BOT_THINK_MAX_MS ?? this.botThinkMinMs + 1000),
  );
  private readonly collectiveTimeoutMs = Math.max(1000, Number(process.env.COLLECTIVE_TIMEOUT_MS ?? 8000));
  private readonly declareTimeoutMs = Math.max(1000, Number(process.env.DECLARE_TIMEOUT_MS ?? 30000));
  private readonly logEnabled = (process.env.ROOM_LOG ?? "1") !== "0";
  private readonly roomLogCards = (process.env.ROOM_LOG_CARDS ?? "0") === "1";
  private readonly huLogEnabled = (process.env.HU_LOG ?? "1") !== "0";
  private readonly huLogCards = (process.env.HU_LOG_CARDS ?? "0") !== "0";
  private readonly huLogMode: HuLogMode =
    ((process.env.HU_LOG_MODE ?? "success") as HuLogMode) || "success";
  private readonly stateLogMode: StateLogMode =
    ((process.env.ROOM_STATE_LOG_MODE ?? "compact") as StateLogMode) || "compact";
  private lastTerminalFingerprint = "";
  private readonly huLogDedup = new Set<string>();
  private huChecksTotal = 0;
  private huChecksValid = 0;
  private readonly huChecksBySeat = new Map<string, { total: number; valid: number }>();
  private botTimer: ReturnType<typeof setTimeout> | null = null;
  private declareTimer: ReturnType<typeof setTimeout> | null = null;
  private collectiveTimer: ReturnType<typeof setTimeout> | null = null;
  private collectiveQueue: string[] = [];
  private collectiveCursor = 0;
  private collectiveResponderId: string | null = null;
  private debugSeq = 0;
  private roundDealerId: string | null = null;

  onCreate(): void {
    this.setState(new GameState());

    this.onMessage("start_game", (client) => {
      this.handleStartGame(client);
    });

    this.onMessage("next_round", (client) => {
      this.handleNextRound(client);
    });

    this.onMessage("return_lobby", (client) => {
      this.handleReturnLobby(client);
    });

    this.onMessage("declare_kongs", (client, value: number) => {
      const seatId = this.seatBySession.get(client.sessionId);
      if (!seatId || this.state.phase !== "declaring") {
        return;
      }
      this.submitDeclaration(seatId, { declaredKongs: value, fishCardIds: [] });
    });

    this.onMessage("declare_setup", (client, payload: DeclareSetupPayload) => {
      const seatId = this.seatBySession.get(client.sessionId);
      if (!seatId || this.state.phase !== "declaring") {
        return;
      }
      this.submitDeclaration(seatId, payload ?? {});
    });

    this.onMessage("action", (client, action: ActionType) => {
      this.handleAction(client, action);
    });

    this.onMessage("discard_card", (client, payload: { cardId?: string } | string) => {
      this.handleDiscardCard(client, payload);
    });

    this.onMessage("debug_setup", (client, scenario: string) => {
      const seatId = this.seatBySession.get(client.sessionId);
      const ok = seatId ? this.applyDebugScenario(seatId, scenario) : false;
      client.send("debug_applied", { scenario, ok, ts: Date.now() });
    });
  }

  onJoin(client: Client, options: { name?: string; playerToken?: string }): void {
    const inputName = this.normalizeName(options?.name);
    const inputToken = this.normalizeToken(options?.playerToken);

    if (inputToken && this.seatByToken.has(inputToken)) {
      const seatId = this.seatByToken.get(inputToken)!;
      this.reclaimSeat(client, seatId, inputToken, inputName);
      return;
    }

    if (this.state.phase !== "waiting") {
      client.send("join_error", { message: "游戏已开始，当前仅支持重连玩家进入。" });
      client.leave(4100);
      return;
    }

    if (this.seatByToken.size >= this.targetSeats) {
      client.send("join_error", { message: "房间已满（最多4名真人玩家）。" });
      client.leave(4101);
      return;
    }

    const token = inputToken || this.generateToken();
    const seatId = this.createHumanSeat(client, token, inputName);
    this.sendSessionToken(client, seatId, token, false);
    this.state.lastAction = `LOBBY ${this.seatByToken.size}/${this.targetSeats}`;
    this.broadcastAvailableActions();
  }

  onLeave(client: Client): void {
    const seatId = this.seatBySession.get(client.sessionId);
    if (!seatId) {
      return;
    }
    this.seatBySession.delete(client.sessionId);

    // Single-room mode: when no human session remains, reset room to fresh lobby.
    if (this.seatBySession.size === 0) {
      this.resetToFreshLobby();
      return;
    }

    const player = this.state.players.get(seatId);
    if (!player) {
      return;
    }

    // Disconnect => immediate bot takeover; seat is always reclaimable by token.
    player.connected = false;
    player.isBot = true;
    const baseName = this.baseNameBySeat.get(seatId) ?? player.name;
    player.name = `${baseName} [BOT]`;
    this.botIds.add(seatId);
    this.state.lastAction = `TAKEOVER ${seatId}`;

    if (this.state.phase === "declaring" && !player.declaredReady) {
      this.submitDeclaration(seatId, { declaredKongs: 0, fishCardIds: [] }, true);
    }

    if (this.state.phase === "playing" || this.state.phase === "declaring") {
      this.tickBots();
    } else {
      this.broadcastAvailableActions();
    }
  }

  onDispose(): void {
    this.clearBotTimer();
    this.clearDeclareTimer();
    this.clearCollectiveTimer();
  }

  private resetToFreshLobby(): void {
    this.clearBotTimer();
    this.clearDeclareTimer();
    this.resetCollectivePolling();
    this.deck = [];
    this.pendingResponse = null;
    this.publicGeneralPool = [];
    this.awaitingDiscardOwnerId = null;
    this.roundDealerId = null;

    this.playerHands.clear();
    this.playerOrder = [];
    this.botIds.clear();
    this.seatBySession.clear();
    this.seatByToken.clear();
    this.baseNameBySeat.clear();

    this.state.players.clear();
    this.state.publicDiscardPile.clear();
    this.state.phase = "waiting";
    this.state.responsePhase = "collective";
    this.state.currentPlayerId = "";
    this.state.hostPlayerId = "";
    this.state.dealerId = "";
    this.state.deckCount = 0;
    this.state.declareEndsAt = 0;
    this.state.targetCard = new CardSchema();
    this.state.isMoCard = false;
    this.state.previousPlayerId = "";
    this.state.currentTurnPlayerId = "";
    this.state.loopStage = "";
    this.state.activeResponderId = "";
    this.state.pollOriginPlayerId = "";
    this.state.responseEndsAt = 0;
    this.state.responseCard = new CardSchema();
    this.state.lastAction = `LOBBY 0/${this.targetSeats}`;
    this.broadcastAvailableActions();
  }

  private handleStartGame(client: Client): void {
    const seatId = this.seatBySession.get(client.sessionId);
    if (!seatId) {
      return;
    }
    if (this.state.phase !== "waiting") {
      client.send("join_error", { message: "当前不在等待阶段，无法开始。" });
      return;
    }
    if (seatId !== this.state.hostPlayerId) {
      client.send("join_error", { message: "仅房主可开始游戏。" });
      return;
    }
    if (this.seatByToken.size < this.minPlayersToStart) {
      client.send("join_error", { message: `至少需要 ${this.minPlayersToStart} 名真人玩家。` });
      return;
    }

    this.ensureBotSeatsForStart();
    this.bootstrapRound();
  }

  private handleNextRound(client: Client): void {
    const seatId = this.seatBySession.get(client.sessionId);
    if (!seatId || this.state.phase !== "ended") {
      return;
    }
    if (seatId !== this.state.hostPlayerId) {
      return;
    }
    this.ensureBotSeatsForStart();
    this.bootstrapRound();
  }

  private handleReturnLobby(client: Client): void {
    const seatId = this.seatBySession.get(client.sessionId);
    if (!seatId || this.state.phase !== "ended") {
      return;
    }
    this.backToLobby();
  }

  private createHumanSeat(client: Client, token: string, rawName: string): string {
    const seatId = `seat_${this.seatByToken.size + 1}`;
    const name = rawName || `玩家${this.seatByToken.size + 1}`;

    const player = new PlayerState();
    player.clientId = seatId;
    player.name = name;
    player.isBot = false;
    player.connected = true;
    this.state.players.set(seatId, player);

    this.playerOrder.push(seatId);
    this.playerHands.set(seatId, []);
    this.baseNameBySeat.set(seatId, name);
    this.seatByToken.set(token, seatId);
    this.seatBySession.set(client.sessionId, seatId);
    this.botIds.delete(seatId);

    if (!this.state.hostPlayerId) {
      this.state.hostPlayerId = seatId;
    }
    return seatId;
  }

  private reclaimSeat(client: Client, seatId: string, token: string, rawName: string): void {
    for (const [sessionId, mappedSeat] of this.seatBySession.entries()) {
      if (mappedSeat !== seatId || sessionId === client.sessionId) {
        continue;
      }
      this.seatBySession.delete(sessionId);
      const oldClient = this.clients.find((c) => c.sessionId === sessionId);
      oldClient?.leave(4102);
    }

    const player = this.state.players.get(seatId);
    if (!player) {
      client.send("join_error", { message: "重连失败：座位不存在。" });
      client.leave(4103);
      return;
    }

    const name = rawName || this.baseNameBySeat.get(seatId) || player.name;
    this.baseNameBySeat.set(seatId, name);
    player.name = name;
    player.connected = true;
    player.isBot = false;
    this.botIds.delete(seatId);
    this.seatBySession.set(client.sessionId, seatId);
    this.seatByToken.set(token, seatId);

    this.sendSessionToken(client, seatId, token, true);
    this.syncAllPrivateHands();
    this.broadcastAvailableActions();
    this.tickBots();
  }

  private sendSessionToken(client: Client, seatId: string, token: string, reclaimed: boolean): void {
    client.send("session_token", {
      playerToken: token,
      seatId,
      hostPlayerId: this.state.hostPlayerId,
      roomId: this.roomId,
      reclaimed,
    });
  }

  private ensureBotSeatsForStart(): void {
    while (this.playerOrder.length < this.targetSeats) {
      const seatId = `bot_${this.playerOrder.length + 1}`;
      if (this.state.players.has(seatId)) {
        continue;
      }
      const bot = new PlayerState();
      bot.clientId = seatId;
      bot.name = `BOT_${this.playerOrder.length + 1}`;
      bot.isBot = true;
      bot.connected = false;
      this.state.players.set(seatId, bot);
      this.playerOrder.push(seatId);
      this.playerHands.set(seatId, []);
      this.botIds.add(seatId);
    }

    for (const seatId of this.playerOrder) {
      const player = this.state.players.get(seatId);
      if (!player) {
        continue;
      }
      if (player.isBot) {
        this.botIds.add(seatId);
      } else {
        this.botIds.delete(seatId);
      }
    }
  }

  private bootstrapRound(): void {
    this.clearDeclareTimer();
    this.state.phase = "declaring";
    this.deck = shuffle(createDeck());
    this.publicGeneralPool = [];
    this.pendingResponse = null;
    this.awaitingDiscardOwnerId = null;
    this.huLogDedup.clear();
    this.huChecksTotal = 0;
    this.huChecksValid = 0;
    this.huChecksBySeat.clear();

    for (const seatId of this.playerOrder) {
      const player = this.state.players.get(seatId);
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
    this.state.publicDiscardPile.clear();

    const dealerId = this.pickRandomDealerId();
    this.roundDealerId = dealerId;
    this.state.dealerId = dealerId;
    for (const seatId of this.playerOrder) {
      const count = seatId === dealerId ? 21 : 20;
      const hand: Card[] = [];
      for (let i = 0; i < count; i += 1) {
        const card = this.deck.shift();
        if (card) {
          hand.push(card);
        }
      }
      this.playerHands.set(seatId, hand);
    }

    // Rule v1.0: dealer flips one shared public general card from deck top.
    const publicGeneral = this.deck.shift();
    if (publicGeneral) {
      this.publicGeneralPool.push(publicGeneral);
      this.addWildcardCardToPlayer(dealerId, publicGeneral, "upper");
    }

    this.state.deckCount = this.deck.length;
    this.state.currentPlayerId = dealerId;
    this.state.responsePhase = "collective";
    this.state.declareEndsAt = Date.now() + this.declareTimeoutMs;
    this.state.lastAction = `DECLARING ${this.declareTimeoutMs}ms`;
    this.syncAllPrivateHands();
    this.startDeclaringPhase();
  }

  private startDeclaringPhase(): void {
    for (const seatId of this.playerOrder) {
      const player = this.state.players.get(seatId);
      if (!player || player.declaredReady) {
        continue;
      }
      if (player.isBot) {
        this.submitDeclaration(seatId, { declaredKongs: 0, fishCardIds: [] }, true);
      }
    }

    this.syncAllPrivateHands();
    this.broadcastAvailableActions();
    if (this.areAllDeclarationsReady()) {
      this.finishDeclaringPhase();
      return;
    }
    this.scheduleDeclareTimeout();
  }

  private scheduleDeclareTimeout(): void {
    this.clearDeclareTimer();
    this.declareTimer = setTimeout(() => {
      this.declareTimer = null;
      if (this.state.phase !== "declaring") {
        return;
      }
      for (const seatId of this.playerOrder) {
        const player = this.state.players.get(seatId);
        if (!player || player.declaredReady) {
          continue;
        }
        this.submitDeclaration(seatId, { declaredKongs: 0, fishCardIds: [] }, true);
      }
      if (this.areAllDeclarationsReady()) {
        this.finishDeclaringPhase();
      }
    }, this.declareTimeoutMs);
  }

  private clearDeclareTimer(): void {
    if (this.declareTimer) {
      clearTimeout(this.declareTimer);
      this.declareTimer = null;
    }
  }

  private areAllDeclarationsReady(): boolean {
    return this.playerOrder.every((seatId) => this.state.players.get(seatId)?.declaredReady);
  }

  private finishDeclaringPhase(): void {
    this.clearDeclareTimer();
    const dealerId = this.roundDealerId && this.state.players.has(this.roundDealerId)
      ? this.roundDealerId
      : this.playerOrder[0];
    this.state.dealerId = dealerId;
    this.state.declareEndsAt = 0;
    this.state.phase = "playing";
    this.state.responsePhase = "self_grab";
    this.state.currentPlayerId = dealerId;
    this.state.currentTurnPlayerId = dealerId;
    this.state.previousPlayerId = this.getPreviousPlayerId(dealerId);
    this.state.loopStage = "transition";
    this.state.activeResponderId = "";
    this.state.pollOriginPlayerId = "";
    this.state.responseEndsAt = 0;
    this.state.lastAction = `DEALER ${dealerId}`;
    this.syncAllPrivateHands();
    this.startTurn(dealerId, "TURN_START");
  }

  private validateFishSelection(cards: Card[]): boolean {
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

    if (goldCount !== 0 && goldCount !== 4 && goldCount !== 5) {
      return false;
    }
    return true;
  }

  private pickCardsByIdsFromHand(hand: Card[], ids: string[]): Card[] {
    const wanted = new Set(ids);
    const selected: Card[] = [];
    for (const card of hand) {
      if (wanted.has(card.id)) {
        selected.push(card);
      }
    }
    return selected;
  }

  private submitDeclaration(seatId: string, payload: DeclareSetupPayload, force = false): void {
    if (this.state.phase !== "declaring") {
      return;
    }
    const player = this.state.players.get(seatId);
    if (!player || player.declaredReady) {
      return;
    }

    const hand = this.playerHands.get(seatId) ?? [];
    const declaredKongs = Math.max(0, Number(payload?.declaredKongs) || 0);
    const fishIds = Array.isArray(payload?.fishCardIds) ? payload.fishCardIds.map(String).filter(Boolean) : [];
    const uniqueFishIds = [...new Set(fishIds)];
    const selectedCards = this.pickCardsByIdsFromHand(hand, uniqueFishIds);
    const idMatch = uniqueFishIds.length === selectedCards.length;
    const fishValid = this.validateFishSelection(selectedCards);

    if (!force && (!idMatch || !fishValid)) {
      const target = this.clients.find((c) => this.seatBySession.get(c.sessionId) === seatId);
      target?.send("declare_rejected", { reason: "亮鱼组合不合法或牌不在手中" });
      return;
    }

    player.declaredKongs = declaredKongs;
    player.declaredReady = true;

    if (idMatch && fishValid && selectedCards.length > 0) {
      const removeIds = new Set(selectedCards.map((card) => card.id));
      const nextHand = hand.filter((card) => !removeIds.has(card.id));
      this.playerHands.set(seatId, nextHand);
      for (const card of selectedCards) {
        player.fishArea.push(this.toSchemaCard(card, true, card.source ?? "upper"));
      }
    }

    this.syncAllPrivateHands();
    this.broadcastAvailableActions();

    if (this.areAllDeclarationsReady()) {
      this.finishDeclaringPhase();
    }
  }

  private startTurn(ownerId: string, tag: string): void {
    if (this.state.phase !== "playing") {
      return;
    }
    this.resetCollectivePolling();
    this.state.currentPlayerId = ownerId;
    this.state.currentTurnPlayerId = ownerId;
    this.state.loopStage = "transition";
    this.drawForOwner(ownerId, tag);
  }

  private drawForOwner(ownerId: string, tag: string): void {
    if (this.state.phase !== "playing") {
      return;
    }

    const drawn = this.deck.shift();
    this.state.deckCount = this.deck.length;
    if (!drawn) {
      this.endRound("DECK_EMPTY");
      return;
    }

    this.pendingResponse = {
      ownerId,
      card: { ...drawn, source: "draw" },
      collectives: new Map(),
    };
    this.awaitingDiscardOwnerId = null;
    this.state.responsePhase = "collective";
    this.setResponseCard(drawn, "draw");
    this.state.currentTurnPlayerId = ownerId;
    this.state.previousPlayerId = this.getPreviousPlayerId(ownerId);
    this.state.loopStage = "global_poll";
    this.state.activeResponderId = "";
    this.state.pollOriginPlayerId = ownerId;
    this.state.responseEndsAt = 0;
    this.state.lastAction = `${ownerId} ${tag}`;
    this.syncAllPrivateHands();
    this.startCollectivePolling();
  }

  private exposeGeneralCard(ownerId: string, card: Card): void {
    this.publicGeneralPool.push(card);
    this.addWildcardCardToPlayer(ownerId, card, "draw");
    this.state.lastAction = `${ownerId} DRAW_GENERAL`;
  }

  private addWildcardCardToPlayer(ownerId: string, card: Card, source: "upper" | "draw"): void {
    const player = this.state.players.get(ownerId);
    if (!player) {
      return;
    }
    const schemaCard = this.toSchemaCard(card, true, source);
    player.generalArea.unshift(schemaCard);
    player.wildcardPool.unshift(this.toSchemaCard(card, true, source));
  }

  private discardFromAndCollective(ownerId: string): void {
    this.awaitingDiscardOwnerId = null;
    const discard = this.pickDiscardCard(ownerId);
    if (!discard) {
      this.endRound(`${ownerId} NO_DISCARD`);
      return;
    }

    this.pushDiscard(ownerId, discard);
    this.beginCollectiveFromDiscard(ownerId, discard);
  }

  private beginCollectiveFromDiscard(ownerId: string, discard: Card): void {
    this.pendingResponse = {
      ownerId,
      card: { ...discard, source: "upper" },
      collectives: new Map(),
    };
    this.awaitingDiscardOwnerId = null;
    this.state.responsePhase = "collective";
    this.state.currentPlayerId = ownerId;
    this.setResponseCard(discard, "upper");
    this.state.currentTurnPlayerId = ownerId;
    this.state.previousPlayerId = ownerId;
    this.state.loopStage = "global_poll";
    this.state.activeResponderId = "";
    this.state.pollOriginPlayerId = ownerId;
    this.state.responseEndsAt = 0;
    this.state.lastAction = `${ownerId} DISCARD`;
    this.syncAllPrivateHands();
    this.startCollectivePolling();
  }

  private getHandWithoutPending(ownerId: string, pendingCard: Card): Card[] {
    const hand = this.playerHands.get(ownerId) ?? [];
    let removed = false;
    return hand.filter((card) => {
      if (!removed && card.id === pendingCard.id) {
        removed = true;
        return false;
      }
      return true;
    });
  }

  private handleAction(client: Client, action: ActionType): void {
    if (!this.pendingResponse || this.state.phase !== "playing") {
      return;
    }

    const seatId = this.seatBySession.get(client.sessionId);
    if (!seatId) {
      return;
    }

    const pending = this.pendingResponse;
    const isOwner = pending.ownerId === seatId;
    action = this.normalizeAction(action);
    const enabledActions = this.getAvailableActions(seatId).filter((x) => x.enabled).map((x) => x.action);
    if (!enabledActions.includes(action)) {
      return;
    }

    if (this.state.responsePhase === "collective") {
      if (seatId !== this.collectiveResponderId) {
        return;
      }
      this.clearCollectiveTimer();
      pending.collectives.set(seatId, action === "pass" ? "pass" : action);
      this.collectiveCursor += 1;
      if (this.state.responsePhase === "collective" && this.pendingResponse === pending) {
        this.advanceCollectivePolling();
      }
      return;
    }

    if (!isOwner) {
      return;
    }

    if (this.awaitingDiscardOwnerId === seatId) {
      return;
    }

    if (this.state.responsePhase === "self_eat" || this.state.responsePhase === "self_grab") {
      if (action === "chi") {
        this.executeEat(seatId);
        return;
      }
      if (action === "pass") {
        if (this.state.responsePhase === "self_eat") {
          this.executeGrab(seatId);
        } else {
          this.executePassToNext(seatId);
        }
      }
      return;
    }
  }

  private handleDiscardCard(client: Client, payload: { cardId?: string } | string): void {
    if (!this.pendingResponse || this.state.phase !== "playing") {
      return;
    }

    const seatId = this.seatBySession.get(client.sessionId);
    if (!seatId) {
      return;
    }

    const pending = this.pendingResponse;
    if (pending.ownerId !== seatId || this.awaitingDiscardOwnerId !== seatId || this.state.responsePhase === "collective") {
      return;
    }

    const cardId = typeof payload === "string" ? payload : String(payload?.cardId ?? "");
    if (!cardId) {
      return;
    }

    const discard = this.discardCardById(seatId, cardId);
    if (!discard) {
      return;
    }

    this.pushDiscard(seatId, discard);
    this.beginCollectiveFromDiscard(seatId, discard);
  }

  private enterDiscardStage(ownerId: string, tag: string): void {
    const hand = this.playerHands.get(ownerId) ?? [];
    const fallback = hand.find((card) => !isDiscardRestricted(card));
    if (!fallback) {
      this.endRound(`${ownerId} NO_DISCARD`);
      return;
    }

    this.pendingResponse = {
      ownerId,
      card: { ...fallback, source: "draw" },
      collectives: new Map(),
    };
    this.awaitingDiscardOwnerId = ownerId;
    this.resetCollectivePolling();
    this.state.responsePhase = "self_grab";
    this.state.currentPlayerId = ownerId;
    this.state.responseCard = new CardSchema();
    this.state.lastAction = `${ownerId} ${tag}`;
    this.syncAllPrivateHands();
    this.tickBots();
  }

  private resolveCollectivePhase(): void {
    const pending = this.pendingResponse;
    if (!pending) {
      return;
    }

    const order = this.getCollectiveOrder(pending);
    let winner: { id: string; action: ActionType } | null = null;

    for (const id of order) {
      if ((pending.collectives.get(id) ?? "pass") === "hu") {
        winner = { id, action: "hu" };
        break;
      }
    }

    if (!winner) {
      for (const id of order) {
        const act = pending.collectives.get(id) ?? "pass";
        if (act === "kai" || act === "peng") {
          winner = { id, action: act };
          break;
        }
      }
    }

    if (winner) {
      this.executeResponseWinner(winner.id, winner.action);
      return;
    }

    this.state.lastAction = "NO_RESPONSE";
    this.enterOwnerLocalPhaseAfterNoResponse(pending.ownerId);
  }

  private isCollectiveReady(pending: PendingResponse): boolean {
    let responded = 0;
    for (const seatId of this.playerOrder) {
      if (pending.collectives.has(seatId)) {
        responded += 1;
      }
    }
    return responded >= this.playerOrder.length;
  }

  private hasCollectiveActionBeyondPass(seatId: string): boolean {
    const acts = this.getAvailableActions(seatId);
    return acts.some((item) => item.enabled && item.action !== "pass");
  }

  private autoFillForcedCollectivePasses(): void {
    const pending = this.pendingResponse;
    if (!pending || this.state.responsePhase !== "collective") {
      return;
    }

    for (const seatId of this.playerOrder) {
      if (pending.collectives.has(seatId)) {
        continue;
      }

      // If a seat has no legal response except pass, skip manual click.
      if (!this.hasCollectiveActionBeyondPass(seatId)) {
        pending.collectives.set(seatId, "pass");
      }
    }
  }

  private isEatResponder(ownerId: string, responderId: string): boolean {
    // Rule v1.0: only one adjacent player can eat discarded card.
    return this.getPreviousPlayerId(ownerId) === responderId;
  }

  private executeResponseWinner(winnerId: string, action: ActionType): void {
    const pending = this.pendingResponse;
    if (!pending) {
      return;
    }

    const winnerHand = this.playerHands.get(winnerId) ?? [];
    const response = pending.card;

    if (action === "hu") {
      const hu = this.explainHuForSeat(winnerId, winnerHand, response);
      this.logHuCheck("collective_winner_hu", winnerId, winnerHand, response, hu.valid);
      if (!hu.valid) {
        this.state.lastAction = "HU_INVALID";
        this.enterNoResponsePath();
        return;
      }
      this.endRound(`${winnerId} HU`, winnerId, hu.groups);
      return;
    }

    if (action === "kai") {
      const plan = findKaiPlan(winnerHand, response, this.getWildcardPoolCards(winnerId));
      if (!plan) {
        const nextId = this.getNextPlayerId(pending.ownerId);
        this.startTurn(nextId, "TURN_DRAW");
        return;
      }
      const taken = this.consumePlanCards(winnerId, plan.handCards, plan.poolCards);
      this.pushExposedGroup(winnerId, [response, ...taken], true);
      this.state.lastAction = `${winnerId} KAI`;
      this.startTurn(winnerId, "KONG_DRAW");
      return;
    }

    if (action === "peng") {
      const taken = this.takeMatchingCards(winnerId, response, 2);
      this.pushExposedGroup(winnerId, [response, ...taken], true);
      this.enterDiscardStage(winnerId, "PENG");
      return;
    }

    if (action === "chi") {
      if (!this.isEatResponder(pending.ownerId, winnerId)) {
        const nextId = this.getNextPlayerId(pending.ownerId);
        this.startTurn(nextId, "TURN_DRAW");
        return;
      }
      const hand = this.playerHands.get(winnerId) ?? [];
      const plans = getChiPlans(hand, response, this.getWildcardPoolCards(winnerId));
      if (plans.length === 0) {
        const nextId = this.getNextPlayerId(pending.ownerId);
        this.startTurn(nextId, "TURN_DRAW");
        return;
      }
      const picked = plans[0];
      const taken = this.consumePlanCards(winnerId, picked.handCards, picked.poolCards);
      this.pushExposedGroup(winnerId, [response, ...taken], true);
      this.enterDiscardStage(winnerId, "CHI");
      return;
    }

    const nextId = this.getNextPlayerId(pending.ownerId);
    this.startTurn(nextId, "TURN_DRAW");
  }

  private enterNoResponsePath(): void {
    const ownerId = this.pendingResponse?.ownerId;
    if (!ownerId) {
      return;
    }
    this.state.lastAction = "NO_RESPONSE";
    this.enterOwnerLocalPhaseAfterNoResponse(ownerId);
  }

  private enterOwnerLocalPhaseAfterNoResponse(ownerId: string): void {
    const pending = this.pendingResponse;
    if (!pending || pending.ownerId !== ownerId) {
      return;
    }
    const fromDraw = pending.card.source === "draw";
    const localOwnerId = fromDraw ? ownerId : this.getNextPlayerId(ownerId);
    if (!fromDraw) {
      pending.ownerId = localOwnerId;
      this.state.currentPlayerId = localOwnerId;
    }
    this.state.responsePhase = fromDraw ? "self_grab" : "self_eat";
    this.state.currentPlayerId = localOwnerId;
    this.state.currentTurnPlayerId = localOwnerId;
    this.state.loopStage = "local_poll";
    this.state.activeResponderId = "";
    this.state.responseEndsAt = 0;

    // Drawn wildcard cannot be passed in local phase; owner must take it.
    if (fromDraw && (isGeneral(pending.card) || isGold(pending.card))) {
      this.addWildcardCardToPlayer(localOwnerId, pending.card, "draw");
      this.state.lastAction = `${localOwnerId} FORCE_TAKE`;
      this.enterDiscardStage(localOwnerId, "FORCE_TAKE");
      return;
    }

    this.syncAllPrivateHands();
    this.tickBots();
  }

  private executeEat(ownerId: string): void {
    const pending = this.pendingResponse;
    if (!pending) {
      return;
    }
    const hand = this.playerHands.get(ownerId) ?? [];
    const plans = getChiPlans(hand, pending.card, this.getWildcardPoolCards(ownerId));
    if (plans.length === 0) {
      return;
    }

    const picked = plans[0];
    const taken = this.consumePlanCards(ownerId, picked.handCards, picked.poolCards);
    this.pushExposedGroup(ownerId, [pending.card, ...taken], true);
    this.state.lastAction = `${ownerId} CHI`;
    this.finalizeWithDiscardFrom(ownerId);
  }

  private executeGrab(ownerId: string): void {
    const pending = this.pendingResponse;
    if (!pending) {
      return;
    }
    this.pushDiscard(ownerId, pending.card);

    // Rule (new loop): when passing on an upper card, deck reaching 8 triggers draw end.
    if (this.deck.length <= 8) {
      this.endRound("DECK_EMPTY");
      return;
    }

    const newCard = this.deck.shift();
    this.state.deckCount = this.deck.length;
    if (!newCard) {
      this.endRound("DECK_EMPTY");
      return;
    }

    const hand = this.playerHands.get(ownerId) ?? [];
    hand.push(newCard);
    this.playerHands.set(ownerId, hand);

    this.pendingResponse = {
      ownerId,
      card: { ...newCard, source: "draw" },
      collectives: new Map(),
    };
    this.state.responsePhase = "collective";
    this.setResponseCard(newCard, "draw");
    this.state.currentTurnPlayerId = ownerId;
    this.state.previousPlayerId = ownerId;
    this.state.loopStage = "global_poll";
    this.state.activeResponderId = "";
    this.state.pollOriginPlayerId = ownerId;
    this.state.responseEndsAt = 0;
    this.state.lastAction = `${ownerId} PASS`;
    this.syncAllPrivateHands();
    this.startCollectivePolling();
  }

  private executePassToNext(ownerId: string): void {
    const pending = this.pendingResponse;
    if (!pending) {
      return;
    }
    this.pushDiscard(ownerId, pending.card);
    this.state.lastAction = `${ownerId} PASS`;
    this.advanceToNextOwner(ownerId, pending.card);
  }

  private finalizeWithDiscardFrom(playerId: string): void {
    const discard = this.pickDiscardCard(playerId);
    if (!discard) {
      this.endRound(`${playerId} NO_DISCARD`);
      return;
    }
    this.pushDiscard(playerId, discard);
    this.advanceToNextOwner(playerId, discard);
  }

  private advanceToNextOwner(currentOwnerId: string, cardToNext: Card): void {
    const nextId = this.getNextPlayerId(currentOwnerId);
    this.pendingResponse = {
      ownerId: nextId,
      card: { ...cardToNext, source: "upper" },
      collectives: new Map(),
    };
    this.state.currentPlayerId = nextId;
    this.state.responsePhase = "collective";
    this.setResponseCard(cardToNext, "upper");
    this.state.currentTurnPlayerId = nextId;
    this.state.previousPlayerId = currentOwnerId;
    this.state.loopStage = "global_poll";
    this.state.activeResponderId = "";
    this.state.pollOriginPlayerId = currentOwnerId;
    this.state.responseEndsAt = 0;
    this.syncAllPrivateHands();
    this.startCollectivePolling();
  }

  private pickDiscardCard(playerId: string): Card | null {
    const hand = this.playerHands.get(playerId) ?? [];
    const idx = hand.findIndex((card) => !isDiscardRestricted(card));
    if (idx < 0) {
      return null;
    }
    const [discard] = hand.splice(idx, 1);
    this.playerHands.set(playerId, hand);
    return discard;
  }

  private discardCardById(playerId: string, cardId: string): Card | null {
    const hand = this.playerHands.get(playerId) ?? [];
    const idx = hand.findIndex((card) => card.id === cardId);
    if (idx < 0) {
      return null;
    }
    const discard = hand[idx];
    if (isDiscardRestricted(discard)) {
      return null;
    }
    hand.splice(idx, 1);
    this.playerHands.set(playerId, hand);
    return discard;
  }

  private consumeMatchingCards(playerId: string, target: Card, count: number): void {
    this.takeMatchingCards(playerId, target, count);
  }

  private takeMatchingCards(playerId: string, target: Card, count: number): Card[] {
    const hand = this.playerHands.get(playerId) ?? [];
    let rest = count;
    const removed: Card[] = [];
    for (let i = hand.length - 1; i >= 0 && rest > 0; i -= 1) {
      if (isSameFace(hand[i], target)) {
        removed.push(...hand.splice(i, 1));
        rest -= 1;
      }
    }
    this.playerHands.set(playerId, hand);
    return removed;
  }

  private removeFromHand(playerId: string, card: Card): void {
    const hand = this.playerHands.get(playerId) ?? [];
    const idx = hand.findIndex((x) => x.id === card.id);
    if (idx >= 0) {
      hand.splice(idx, 1);
      this.playerHands.set(playerId, hand);
      return;
    }
    const byFace = hand.findIndex((x) => x.color === card.color && x.type === card.type);
    if (byFace >= 0) {
      hand.splice(byFace, 1);
      this.playerHands.set(playerId, hand);
    }
  }

  private removeFromWildcardPool(playerId: string, card: Card): void {
    const player = this.state.players.get(playerId);
    if (!player) {
      return;
    }
    const idx = player.wildcardPool.findIndex((x) => x.id === card.id);
    if (idx >= 0) {
      player.wildcardPool.splice(idx, 1);
      return;
    }
    const byFace = player.wildcardPool.findIndex((x) => x.color === card.color && x.type === card.type);
    if (byFace >= 0) {
      player.wildcardPool.splice(byFace, 1);
    }
    const gById = player.generalArea.findIndex((x) => x.id === card.id);
    if (gById >= 0) {
      player.generalArea.splice(gById, 1);
      return;
    }
    const gByFace = player.generalArea.findIndex((x) => x.color === card.color && x.type === card.type);
    if (gByFace >= 0) {
      player.generalArea.splice(gByFace, 1);
    }
  }

  private consumePlanCards(playerId: string, handCards: Card[], poolCards: Card[]): Card[] {
    for (const card of handCards) {
      this.removeFromHand(playerId, card);
    }
    for (const card of poolCards) {
      this.removeFromWildcardPool(playerId, card);
    }
    return [...handCards, ...poolCards];
  }

  private pushDiscard(playerId: string, card: Card): void {
    const player = this.state.players.get(playerId);
    if (!player) {
      return;
    }
    const schemaCard = this.toSchemaCard(card, false, "upper");
    player.discardPile.unshift(schemaCard);
    this.state.publicDiscardPile.unshift(this.toSchemaCard(card, false, "upper"));
  }

  private pushExposedGroup(playerId: string, cards: Card[], highlight: boolean): void {
    const player = this.state.players.get(playerId);
    if (!player) {
      return;
    }
    if (cards.length > 0) {
      player.exposedGroupSizes.push(cards.length);
    }
    for (const card of cards) {
      player.exposedArea.push(this.toSchemaCard(card, highlight, card.source ?? "upper"));
    }
  }

  private setResponseCard(card: Card, source: "upper" | "draw"): void {
    this.state.responseCard = this.toSchemaCard(card, false, source);
    this.state.targetCard = this.toSchemaCard(card, false, source);
    this.state.isMoCard = source === "draw";
    this.state.currentPlayerId = this.pendingResponse?.ownerId ?? this.state.currentPlayerId;
  }

  private toSchemaCard(card: Card, isResponseCard: boolean, source: "upper" | "draw"): CardSchema {
    const schemaCard = new CardSchema();
    schemaCard.id = card.id;
    schemaCard.color = card.color;
    schemaCard.type = card.type;
    schemaCard.source = source;
    schemaCard.isResponseCard = isResponseCard;
    return schemaCard;
  }

  private toPlainCard(card: { id: string; color: string; type: string; source?: string }): Card {
    return {
      id: card.id,
      color: card.color as Card["color"],
      type: card.type as Card["type"],
      source: card.source === "draw" ? "draw" : "upper",
    };
  }

  private getWildcardPoolCards(seatId: string): Card[] {
    const player = this.state.players.get(seatId);
    if (!player) {
      return [];
    }
    return player.wildcardPool.map((card) => this.toPlainCard(card));
  }

  private explainHuForSeat(seatId: string, hand: Card[], responseCard: Card) {
    return explainHu(hand, responseCard, {
      wildcardCount: this.getHuWildcardCount(),
      wildcardPool: this.getWildcardPoolCards(seatId),
    });
  }

  private getScoreRules(): Record<string, { label: string; unit: number }> {
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

  private buildScoreBreakdown(groups: string[]): { items: ScoreBreakdownItem[]; total: number } {
    const rules = this.getScoreRules();
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

  private buildRoundResultPlayers(winnerId: string | null, groups: string[]): RoundResultPlayer[] {
    const winnerScore = winnerId ? this.buildScoreBreakdown(groups) : { items: [], total: 0 };
    const result: RoundResultPlayer[] = [];
    for (const seatId of this.playerOrder) {
      const player = this.state.players.get(seatId);
      const hand = this.playerHands.get(seatId) ?? [];
      const exposedArea = [...(player?.exposedArea ?? [])].map((card) => this.toPlainCard(card));
      const exposedGroupSizes = [...(player?.exposedGroupSizes ?? [])];
      const generalArea = [...(player?.generalArea ?? [])].map((card) => this.toPlainCard(card));
      const fishArea = [...(player?.fishArea ?? [])].map((card) => this.toPlainCard(card));
      const discardCount = player?.discardPile.length ?? 0;
      const isWinner = winnerId === seatId;
      result.push({
        clientId: seatId,
        name: player?.name ?? seatId,
        hand: hand.map((card) => this.toPlainCard(card)),
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

  private backToLobby(): void {
    this.clearBotTimer();
    this.clearDeclareTimer();
    this.resetCollectivePolling();
    this.deck = [];
    this.pendingResponse = null;
    this.publicGeneralPool = [];
    this.awaitingDiscardOwnerId = null;
    this.lastTerminalFingerprint = "";
    this.huLogDedup.clear();
    this.huChecksTotal = 0;
    this.huChecksValid = 0;
    this.huChecksBySeat.clear();
    this.roundDealerId = null;

    const humanSeats = this.playerOrder.filter((seatId) => !this.botIds.has(seatId));
    const humanSet = new Set(humanSeats);

    for (const seatId of this.playerOrder) {
      if (humanSet.has(seatId)) {
        continue;
      }
      this.state.players.delete(seatId);
      this.playerHands.delete(seatId);
      this.baseNameBySeat.delete(seatId);
    }

    this.playerOrder = humanSeats;
    this.botIds.clear();

    for (const seatId of this.playerOrder) {
      const player = this.state.players.get(seatId);
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
      this.playerHands.set(seatId, []);
      const online = [...this.seatBySession.values()].includes(seatId);
      player.connected = online;
      player.isBot = false;
      player.name = this.baseNameBySeat.get(seatId) ?? player.name;
    }

    if (!this.state.players.has(this.state.hostPlayerId) && this.playerOrder.length > 0) {
      this.state.hostPlayerId = this.playerOrder[0];
    }

    this.state.phase = "waiting";
    this.state.dealerId = "";
    this.state.currentPlayerId = "";
    this.state.responsePhase = "collective";
    this.state.deckCount = 0;
    this.state.declareEndsAt = 0;
    this.state.targetCard = new CardSchema();
    this.state.isMoCard = false;
    this.state.previousPlayerId = "";
    this.state.currentTurnPlayerId = "";
    this.state.loopStage = "";
    this.state.activeResponderId = "";
    this.state.pollOriginPlayerId = "";
    this.state.responseEndsAt = 0;
    this.state.publicDiscardPile.clear();
    this.state.responseCard = new CardSchema();
    this.state.lastAction = `LOBBY ${this.seatByToken.size}/${this.targetSeats}`;
    this.syncAllPrivateHands();
    this.broadcastAvailableActions();
  }

  private endRound(lastAction: string, winnerId: string | null = null, groups: string[] = []): void {
    this.state.phase = "ended";
    this.state.lastAction = lastAction;
    this.pendingResponse = null;
    this.awaitingDiscardOwnerId = null;
    this.resetCollectivePolling();
    this.clearBotTimer();
    this.state.loopStage = "";
    this.state.activeResponderId = "";
    this.state.pollOriginPlayerId = "";
    this.state.responseEndsAt = 0;

    if (winnerId) {
      this.broadcast("hu_result", { winnerId, groups });
    }

    this.broadcast("round_result", {
      winnerId,
      groups,
      players: this.buildRoundResultPlayers(winnerId, groups),
    });

    this.broadcastAvailableActions();
  }

  private getAvailableActions(seatId: string): Array<{ action: ActionType; enabled: boolean }> {
    if (this.state.phase === "declaring") {
      return [];
    }
    const pending = this.pendingResponse;
    if (!pending) {
      return [];
    }
    const hand = this.playerHands.get(seatId) ?? [];
    const isOwner = pending.ownerId === seatId;
    const isCollective = this.state.responsePhase === "collective";

    if (isCollective) {
      if (seatId !== this.collectiveResponderId) {
        return this.getDisabledPanel("collective");
      }
      const wildcardPool = this.getWildcardPoolCards(seatId);
      const huProbe = explainHu(hand, pending.card, {
        wildcardCount: this.getHuWildcardCount(),
        wildcardPool,
      });
      this.logHuCheck("collective", seatId, hand, pending.card, huProbe.valid);
      return [
        { action: "hu", enabled: huProbe.valid },
        { action: "kai", enabled: canKai(hand, pending.card, wildcardPool) },
        { action: "peng", enabled: canPeng(hand, pending.card) },
        { action: "chi", enabled: false },
        { action: "pass", enabled: true },
      ];
    }

    if (!isOwner) {
      return this.getDisabledPanel(this.state.responsePhase);
    }

    if (this.awaitingDiscardOwnerId === seatId) {
      return [];
    }

    if (this.state.responsePhase === "self_eat" || this.state.responsePhase === "self_grab") {
      const handNoPending = this.getHandWithoutPending(seatId, pending.card);
      const wildcardPool = this.getWildcardPoolCards(seatId);
      return [
        { action: "hu", enabled: false },
        { action: "kai", enabled: false },
        { action: "peng", enabled: false },
        { action: "chi", enabled: canChi(handNoPending, pending.card, wildcardPool) },
        { action: "pass", enabled: true },
      ];
    }

    return this.getDisabledPanel(this.state.responsePhase);
  }

  private getDisabledPanel(responsePhase: "collective" | "self_eat" | "self_grab"): Array<{ action: ActionType; enabled: boolean }> {
    if (responsePhase === "collective") {
      return [
        { action: "hu", enabled: false },
        { action: "kai", enabled: false },
        { action: "peng", enabled: false },
        { action: "chi", enabled: false },
        { action: "pass", enabled: false },
      ];
    }

    return [
      { action: "hu", enabled: false },
      { action: "kai", enabled: false },
      { action: "peng", enabled: false },
      { action: "chi", enabled: false },
      { action: "pass", enabled: false },
    ];
  }

  private broadcastAvailableActions(): void {
    this.logStateSnapshot("STATE");
    for (const client of this.clients) {
      const seatId = this.seatBySession.get(client.sessionId);
      if (!seatId) {
        continue;
      }
      client.send("available_actions", this.getAvailableActions(seatId));
    }
  }

  private logStateSnapshot(tag: string): void {
    if (!this.logEnabled || !this.shouldLogStateSnapshot()) {
      return;
    }
    const fp = `${this.state.phase}|${this.state.responsePhase}|${this.state.currentPlayerId}|${this.state.lastAction}|${this.state.deckCount}`;
    if (fp === this.lastTerminalFingerprint) {
      return;
    }
    this.lastTerminalFingerprint = fp;
    const line =
      `[${new Date().toISOString()}] ` +
      `[room:${this.roomId}] ` +
      `[${tag}] phase=${this.state.phase} response=${this.state.responsePhase} ` +
      `current=${this.state.currentPlayerId || "-"} deck=${this.state.deckCount} action=${this.state.lastAction || "-"}`;
    if (!this.roomLogCards) {
      console.log(line);
      if (this.state.phase === "ended") {
        this.logHuSummary();
      }
      return;
    }
    console.log(`${line} | players=${this.summarizeAllPlayersCards()}`);
    if (this.state.phase === "ended") {
      this.logHuSummary();
    }
  }

  private shouldLogStateSnapshot(): boolean {
    if (this.stateLogMode === "off") {
      return false;
    }
    if (this.stateLogMode === "all") {
      return true;
    }
    const keyword = this.getStateActionKeyword(this.state.lastAction || "");
    return COMPACT_STATE_ACTIONS.has(keyword);
  }

  private getStateActionKeyword(action: string): string {
    const parts = action.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
      return "";
    }
    if (parts[0].startsWith("seat_") || parts[0].startsWith("bot_")) {
      return parts[1] ?? "";
    }
    return parts[0];
  }

  private summarizeAllPlayersCards(): string {
    const parts: string[] = [];
    for (const seatId of this.playerOrder) {
      const hand = this.playerHands.get(seatId) ?? [];
      const p = this.state.players.get(seatId);
      const exposed = p?.exposedArea ?? [];
      const discard = p?.discardPile ?? [];
      const generals = p?.generalArea ?? [];
      const fish = p?.fishArea ?? [];
      parts.push(
        `${seatId}{h=${this.summarizeCards(hand)}|e=${this.summarizeSchemaCards(exposed)}|g=${this.summarizeSchemaCards(generals)}|d=${this.summarizeSchemaCards(discard)}|f=${this.summarizeSchemaCards(fish)}}`,
      );
    }
    return parts.join(" ; ");
  }

  private getHuWildcardCount(): number {
    // Wildcards are now passed by per-seat wildcardPool in explainHuForSeat.
    return 0;
  }

  private summarizeCards(cards: Card[]): string {
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

  private summarizeSchemaCards(cards: Iterable<{ color: string; type: string }>): string {
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

  private logHuCheck(stage: string, seatId: string, hand: Card[], response: Card, valid: boolean): void {
    this.huChecksTotal += 1;
    if (valid) {
      this.huChecksValid += 1;
    }
    const seatStats = this.huChecksBySeat.get(seatId) ?? { total: 0, valid: 0 };
    seatStats.total += 1;
    if (valid) {
      seatStats.valid += 1;
    }
    this.huChecksBySeat.set(seatId, seatStats);

    if (!this.logEnabled || !this.huLogEnabled || this.huLogMode === "off") {
      return;
    }
    if (this.huLogMode === "success" && !valid) {
      return;
    }
    if (this.huLogMode === "fail" && valid) {
      return;
    }

    const fp = `${stage}|${seatId}|${response.id}|${response.color}:${response.type}|hand=${hand.length}|wild=${this.getHuWildcardCount()}|valid=${valid}|deck=${this.state.deckCount}|action=${this.state.lastAction}`;
    if (this.huLogDedup.has(fp)) {
      return;
    }
    this.huLogDedup.add(fp);
    if (this.huLogDedup.size > 2000) {
      this.huLogDedup.clear();
    }
    const cardsPart = this.huLogCards
      ? `|seatCards=${this.summarizeCards(hand)}|players=${this.summarizeAllPlayersCards()}`
      : "";
    console.log(`[${new Date().toISOString()}] [room:${this.roomId}] [HU_CHECK] ${fp}${cardsPart}`);
  }

  private logHuSummary(): void {
    if (!this.logEnabled) {
      return;
    }
    const seatPart = this.playerOrder
      .map((seatId) => {
        const s = this.huChecksBySeat.get(seatId) ?? { total: 0, valid: 0 };
        return `${seatId}:${s.valid}/${s.total}`;
      })
      .join(",");
    console.log(
      `[${new Date().toISOString()}] [room:${this.roomId}] [HU_SUMMARY] valid=${this.huChecksValid}/${this.huChecksTotal} bySeat=${seatPart}`,
    );
  }

  private syncAllPrivateHands(): void {
    for (const client of this.clients) {
      const seatId = this.seatBySession.get(client.sessionId);
      if (!seatId) {
        continue;
      }
      const hand = this.playerHands.get(seatId) ?? [];
      client.send("private_hand", hand.map((card) => ({ ...card, isHidden: false })));
    }
  }

  private iterateFromNext(startId: string): string[] {
    if (this.playerOrder.length === 0) {
      return [];
    }
    const idx = this.playerOrder.indexOf(startId);
    if (idx < 0) {
      return [...this.playerOrder];
    }
    const ordered: string[] = [];
    for (let i = 1; i <= this.playerOrder.length; i += 1) {
      ordered.push(this.playerOrder[(idx + i) % this.playerOrder.length]);
    }
    return ordered;
  }

  private getNextPlayerId(playerId: string): string {
    const idx = this.playerOrder.indexOf(playerId);
    if (idx < 0) {
      return this.playerOrder[0];
    }
    return this.playerOrder[(idx + 1) % this.playerOrder.length];
  }

  private getPreviousPlayerId(playerId: string): string {
    const idx = this.playerOrder.indexOf(playerId);
    if (idx < 0) {
      return this.playerOrder[0];
    }
    return this.playerOrder[(idx - 1 + this.playerOrder.length) % this.playerOrder.length];
  }

  private tickBots(): void {
    if (!this.pendingResponse || this.state.phase !== "playing") {
      this.clearBotTimer();
      this.broadcastAvailableActions();
      return;
    }

    if (this.state.responsePhase === "collective") {
      if (!this.collectiveResponderId) {
        this.startCollectivePolling();
        return;
      }
      if (this.botIds.has(this.collectiveResponderId)) {
        this.clearCollectiveTimer();
        this.scheduleBotStep();
      } else if (!this.collectiveTimer) {
        this.scheduleCollectiveTimeout();
      }
      this.broadcastAvailableActions();
      return;
    }

    const ownerId = this.pendingResponse.ownerId;
    if (this.botIds.has(ownerId)) {
      this.scheduleBotStep();
      this.broadcastAvailableActions();
      return;
    }

    this.clearBotTimer();
    this.broadcastAvailableActions();
  }

  private clearBotTimer(): void {
    if (this.botTimer) {
      clearTimeout(this.botTimer);
      this.botTimer = null;
    }
  }

  private clearCollectiveTimer(): void {
    if (this.collectiveTimer) {
      clearTimeout(this.collectiveTimer);
      this.collectiveTimer = null;
    }
    this.state.responseEndsAt = 0;
  }

  private resetCollectivePolling(): void {
    this.clearCollectiveTimer();
    this.collectiveQueue = [];
    this.collectiveCursor = 0;
    this.collectiveResponderId = null;
    this.state.activeResponderId = "";
  }

  private startCollectivePolling(): void {
    const pending = this.pendingResponse;
    if (!pending || this.state.responsePhase !== "collective") {
      this.resetCollectivePolling();
      this.broadcastAvailableActions();
      return;
    }

    this.state.loopStage = "global_poll";
    if (!this.state.pollOriginPlayerId) {
      this.state.pollOriginPlayerId = pending.ownerId;
    }
    this.clearBotTimer();
    this.clearCollectiveTimer();
    this.collectiveQueue = this.getCollectiveOrder(pending);
    this.collectiveCursor = 0;
    this.collectiveResponderId = null;
    this.advanceCollectivePolling();
  }

  private getCollectiveOrder(pending: PendingResponse): string[] {
    if (pending.card.source === "draw") {
      return [pending.ownerId, ...this.iterateFromNext(pending.ownerId).filter((id) => id !== pending.ownerId)];
    }
    return this.iterateFromNext(pending.ownerId);
  }

  private scheduleCollectiveTimeout(): void {
    this.clearCollectiveTimer();
    this.state.responseEndsAt = Date.now() + this.collectiveTimeoutMs;
    this.collectiveTimer = setTimeout(() => {
      const pending = this.pendingResponse;
      const responderId = this.collectiveResponderId;
      this.collectiveTimer = null;
      if (!pending || this.state.responsePhase !== "collective" || !responderId) {
        return;
      }
      if (pending.collectives.has(responderId)) {
        return;
      }
      pending.collectives.set(responderId, "pass");
      this.collectiveCursor += 1;
      this.state.lastAction = `${responderId} TIMEOUT_PASS`;
      this.advanceCollectivePolling();
    }, this.collectiveTimeoutMs);
  }

  private advanceCollectivePolling(): void {
    const pending = this.pendingResponse;
    if (!pending || this.state.responsePhase !== "collective") {
      this.resetCollectivePolling();
      this.broadcastAvailableActions();
      return;
    }

    this.clearBotTimer();
    this.clearCollectiveTimer();

    while (this.collectiveCursor < this.collectiveQueue.length) {
      const seatId = this.collectiveQueue[this.collectiveCursor];
      if (pending.collectives.has(seatId)) {
        this.collectiveCursor += 1;
        continue;
      }

      if (!this.hasCollectiveActionBeyondPass(seatId)) {
        pending.collectives.set(seatId, "pass");
        this.collectiveCursor += 1;
        continue;
      }

      this.collectiveResponderId = seatId;
      this.state.currentPlayerId = seatId;
      this.state.currentTurnPlayerId = seatId;
      this.state.activeResponderId = seatId;
      if (this.botIds.has(seatId)) {
        this.scheduleBotStep();
      } else {
        this.scheduleCollectiveTimeout();
      }
      this.broadcastAvailableActions();
      return;
    }

    this.collectiveResponderId = null;
    this.state.activeResponderId = "";
    this.state.responseEndsAt = 0;
    this.resolveCollectivePhase();
  }

  private scheduleBotStep(): void {
    if (this.botThinkMaxMs <= 0) {
      this.runBotStepNow();
      return;
    }
    if (this.botTimer) {
      return;
    }
    const delayMs = this.randomBotThinkDelayMs();
    this.botTimer = setTimeout(() => {
      this.botTimer = null;
      this.runBotStepNow();
    }, delayMs);
  }

  private randomBotThinkDelayMs(): number {
    if (this.botThinkMaxMs <= this.botThinkMinMs) {
      return this.botThinkMinMs;
    }
    return this.botThinkMinMs + Math.floor(Math.random() * (this.botThinkMaxMs - this.botThinkMinMs + 1));
  }

  private runBotStepNow(): void {
    if (!this.pendingResponse || this.state.phase !== "playing") {
      this.broadcastAvailableActions();
      return;
    }

    if (this.state.responsePhase === "collective") {
      const responderId = this.collectiveResponderId;
      if (!responderId || !this.botIds.has(responderId)) {
        this.broadcastAvailableActions();
        return;
      }
      const acts = this.getAvailableActions(responderId);
      const choose =
        acts.find((x) => x.action === "hu" && x.enabled)?.action ??
        acts.find((x) => x.action === "kai" && x.enabled)?.action ??
        acts.find((x) => x.action === "peng" && x.enabled)?.action ??
        acts.find((x) => x.action === "chi" && x.enabled)?.action ??
        acts.find((x) => x.action === "pass" && x.enabled)?.action ??
        "pass";
      this.pendingResponse.collectives.set(responderId, choose);
      this.collectiveCursor += 1;
      this.advanceCollectivePolling();
      return;
    }

    const ownerId = this.pendingResponse.ownerId;
    if (!this.botIds.has(ownerId)) {
      this.broadcastAvailableActions();
      return;
    }

    if (this.awaitingDiscardOwnerId === ownerId) {
      this.discardFromAndCollective(ownerId);
      return;
    }

    const hand = this.playerHands.get(ownerId) ?? [];
    if (this.state.responsePhase === "self_eat") {
      if (canChi(hand, this.pendingResponse.card, this.getWildcardPoolCards(ownerId))) {
        this.executeEat(ownerId);
      } else {
        this.executeGrab(ownerId);
      }
      return;
    }

    if (this.state.responsePhase === "self_grab") {
      if (canChi(hand, this.pendingResponse.card, this.getWildcardPoolCards(ownerId))) {
        this.executeEat(ownerId);
      } else {
        this.executePassToNext(ownerId);
      }
      return;
    }

    this.broadcastAvailableActions();
  }

  private applyDebugScenario(seatId: string, scenario: string): boolean {
    if (!this.state.players.has(seatId)) {
      return false;
    }

    const hand = this.playerHands.get(seatId) ?? [];
    hand.length = 0;
    const add = (id: string, color: Card["color"], type: Card["type"]) => hand.push({ id, color, type });
    const seq = ++this.debugSeq;

    if (scenario === "hu_ready_mode2") {
      add("h1", "red", "ju");
      add("h2", "red", "ma");
      add("h3", "red", "pao");
      this.pendingResponse = {
        ownerId: seatId,
        card: { id: "h3", color: "red", type: "pao", source: "draw" },
        collectives: new Map(),
      };
      this.state.phase = "playing";
      this.state.responsePhase = "self_grab";
      this.state.currentPlayerId = seatId;
      this.setResponseCard(this.pendingResponse.card, "draw");
      this.state.lastAction = `DEBUG: hu_ready_mode2#${seq}`;
    } else if (scenario === "eat_mode1") {
      add("d1", "red", "shi");
      add("d2", "red", "xiang");
      add("d3", "yellow", "ju");
      add("d4", "yellow", "ma");
      this.pendingResponse = {
        ownerId: seatId,
        card: { id: "rj", color: "red", type: "jiang", source: "upper" },
        collectives: new Map(),
      };
      this.state.phase = "playing";
      this.state.responsePhase = "self_eat";
      this.state.currentPlayerId = seatId;
      this.setResponseCard(this.pendingResponse.card, "upper");
      this.state.lastAction = `DEBUG: eat_mode1#${seq}`;
    } else if (scenario === "mode2_pass") {
      add("d5", "yellow", "ju");
      add("d6", "white", "xiang");
      add("d7", "green", "zu");
      this.pendingResponse = {
        ownerId: seatId,
        card: { id: "gy", color: "green", type: "pao", source: "draw" },
        collectives: new Map(),
      };
      this.state.phase = "playing";
      this.state.responsePhase = "self_grab";
      this.state.currentPlayerId = seatId;
      this.setResponseCard(this.pendingResponse.card, "draw");
      this.state.lastAction = `DEBUG: mode2_pass#${seq}`;
    } else if (scenario === "collective_no_actions") {
      add("d8", "red", "shi");
      add("d9", "green", "xiang");
      add("d10", "white", "zu");
      this.pendingResponse = {
        ownerId: this.getNextPlayerId(seatId),
        card: { id: "yj", color: "yellow", type: "ju", source: "upper" },
        collectives: new Map(),
      };
      this.state.phase = "playing";
      this.state.responsePhase = "collective";
      this.state.currentPlayerId = this.pendingResponse.ownerId;
      this.setResponseCard(this.pendingResponse.card, "upper");
      this.state.lastAction = `DEBUG: collective_no_actions#${seq}`;
    } else if (scenario === "hu_fail_case") {
      // Make this scenario deterministic: no wildcard from exposed generals.
      this.publicGeneralPool = [];
      for (const id of this.playerOrder) {
        this.state.players.get(id)?.generalArea.clear();
        this.state.players.get(id)?.wildcardPool.clear();
      }
      add("d11", "red", "jiang");
      add("d12", "red", "shi");
      add("d13", "red", "xiang");
      this.pendingResponse = {
        ownerId: this.getNextPlayerId(seatId),
        card: { id: "rp", color: "red", type: "pao", source: "upper" },
        collectives: new Map(),
      };
      this.state.phase = "playing";
      this.state.responsePhase = "collective";
      this.state.currentPlayerId = this.pendingResponse.ownerId;
      this.setResponseCard(this.pendingResponse.card, "upper");
      this.state.lastAction = `DEBUG: hu_fail_case#${seq}`;
    } else if (scenario === "discard_public") {
      this.state.publicDiscardPile.clear();
      for (const id of this.playerOrder) {
        const player = this.state.players.get(id);
        if (!player) {
          continue;
        }
        player.discardPile.clear();
        const card = this.toSchemaCard({ id: `${id}_d1_${seq}`, color: "yellow", type: "ma" }, false, "upper");
        player.discardPile.push(card);
        this.state.publicDiscardPile.unshift(this.toSchemaCard({ id: `${id}_d1_${seq}`, color: "yellow", type: "ma" }, false, "upper"));
      }
      const me = this.state.players.get(seatId);
      if (me) {
        const card = this.toSchemaCard({ id: `self_d2_${seq}`, color: "red", type: "ju" }, false, "upper");
        me.discardPile.push(card);
        this.state.publicDiscardPile.unshift(this.toSchemaCard({ id: `self_d2_${seq}`, color: "red", type: "ju" }, false, "upper"));
      }
      this.pendingResponse = null;
      this.state.responseCard = new CardSchema();
      this.state.responsePhase = "collective";
      this.state.lastAction = `DEBUG: discard_public#${seq}`;
    } else {
      return false;
    }

    this.playerHands.set(seatId, hand);
    this.syncAllPrivateHands();
    if (scenario === "discard_public") {
      this.resetCollectivePolling();
      this.broadcastAvailableActions();
      return true;
    }
    if (scenario === "collective_no_actions" || scenario === "hu_fail_case") {
      this.startCollectivePolling();
      return true;
    }
    this.tickBots();
    return true;
  }

  private normalizeAction(action: ActionType): ActionType {
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

  private normalizeName(input: unknown): string {
    const name = String(input ?? "").trim();
    return name.slice(0, 24);
  }

  private normalizeToken(input: unknown): string {
    return String(input ?? "").trim().slice(0, 128);
  }

  private generateToken(): string {
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  private pickRandomDealerId(): string {
    if (!this.playerOrder.length) {
      return "";
    }
    const idx = Math.floor(Math.random() * this.playerOrder.length);
    return this.playerOrder[idx];
  }
}

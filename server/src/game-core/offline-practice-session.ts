import { countHiddenKans } from "../rules/declared-kans.js";
import type { ActionType, Card } from "../rules/types.js";
import { GameState, PlayerState, CardSchema } from "../schema/game-state.schema.js";
import { buildChiCandidates, buildKaiCandidates, buildPengCandidates } from "../rooms/flow/action-candidates.js";
import { tryExecuteChi } from "../rooms/flow/actions/chi.js";
import { tryExecuteKai } from "../rooms/flow/actions/kai.js";
import { tryExecutePeng } from "../rooms/flow/actions/peng.js";
import {
  areAllDeclarationsReady,
  buildRoundResultPlayers,
  calculateVisibleGroupScore,
  dealInitialHands,
  endRoundFlow,
  finalizeRoomScores,
  resetRoundPlayers,
  type RoundResultPlayer,
} from "../rooms/flow/match-runtime.js";
import { createRoomStateOps } from "../rooms/flow/room-state-ops.js";
import {
  applyCollectivePollState,
  applyEnterDiscardStageState,
  applyPlayingStartAfterDeclaring,
  applyTurnTransitionState,
  createPendingResponse,
  getNextPlayerId,
  getPreviousPlayerId,
  shouldEndDrawAfterUpperPass,
} from "../rooms/flow/support.js";
import type { AvailableActionEntry } from "../rooms/flow/playing-flow.js";
import { GameSession, type PendingResponse } from "./game-session.js";
import { PUTIAN_V1_RULE_REF, type RoundBootstrapSetup } from "./ruleset.js";

const HUMAN_ID = "seat_0";
const SEATS = [HUMAN_ID, "seat_1", "seat_2", "seat_3"] as const;
const BOT_NAMES = ["阿福", "春妹", "海叔"] as const;

export interface OfflineActionRequest {
  action: ActionType;
  candidateId?: string;
  deferred?: boolean;
}

export interface OfflineRoundResult {
  winnerId: string | null;
  groups: string[];
  players: RoundResultPlayer[];
  remainingDeck: Card[];
  scoringMode: "single";
  roundNumber: number;
}

export interface OfflinePracticeView {
  roomId: "offline-practice";
  stateRevision: number;
  roomMode: "practice";
  scoringMode: "single";
  completedRounds: number;
  phase: string;
  serverNow: number;
  matchStartsAt: 0;
  hostPlayerId: string;
  dealerId: string;
  dealerPickerId: string;
  previousWinnerId: string;
  previousWinnerName: string;
  previousHuType: string;
  currentPlayerId: string;
  currentTurnPlayerId: string;
  previousPlayerId: string;
  pollOriginPlayerId: string;
  activeResponderId: string;
  pendingReceiverId: string;
  responsePhase: string;
  responseEndsAt: 0;
  presentationUntil: 0;
  lastAction: string;
  deckCount: number;
  isMoCard: boolean;
  targetCard: Card | null;
  responseCard: Card | null;
  dealerCard: Card | null;
  publicDiscardPile: Card[];
  publicGeneralPool: Card[];
  declareEndsAt: 0;
  players: Array<Record<string, unknown>>;
  privateHand: Card[];
  availableActions: AvailableActionEntry[];
  decisionTimer: {
    legalDiscardCardIds: string[];
    untimed: true;
    totalMs: 0;
    endsAt: 0;
    decisionKey: string;
  };
  roundResult: OfflineRoundResult | null;
}

/**
 * Network-free host for the shared GameSession. It owns no alternative rule
 * functions: every rule decision and transition primitive is delegated to the
 * same GameSession/RuleSet/flow modules used by GameRoom.
 */
export class OfflinePracticeSession {
  readonly gameSession = new GameSession(PUTIAN_V1_RULE_REF);
  readonly state = new GameState();
  readonly humanSeatId = HUMAN_ID;
  private readonly ops = createRoomStateOps(
    this.state,
    this.gameSession.state.playerHands,
    () => this.pendingResponse?.ownerId ?? null,
    () => this.gameSession.rules.enforceDeclaredKans,
  );
  private lastRoundResult: OfflineRoundResult | null = null;
  private deferredHumanChiCandidate: string | null = null;

  constructor(humanName: string, private readonly random: () => number = Math.random) {
    this.state.roomMode = "practice";
    this.state.scoringMode = "single";
    this.state.hostPlayerId = HUMAN_ID;
    this.gameSession.state.playerOrder = [...SEATS];
    for (const [index, seatId] of SEATS.entries()) {
      const player = new PlayerState();
      player.clientId = seatId;
      player.seatIndex = index;
      player.name = index === 0 ? (humanName.trim().slice(0, 16) || "玩家") : BOT_NAMES[index - 1]!;
      player.isBot = index !== 0;
      player.isConfiguredBot = index !== 0;
      player.connected = index === 0;
      player.botStrength = 50;
      this.state.players.set(seatId, player);
      this.gameSession.state.playerHands.set(seatId, []);
      if (index !== 0) this.gameSession.state.botIds.add(seatId);
    }
  }

  private get deck(): Card[] { return this.gameSession.state.deck; }
  private set deck(value: Card[]) { this.gameSession.state.deck = value; }
  private get playerHands(): Map<string, Card[]> { return this.gameSession.state.playerHands; }
  private get playerOrder(): string[] { return this.gameSession.state.playerOrder; }
  private get botIds(): Set<string> { return this.gameSession.state.botIds; }
  private get pendingResponse(): PendingResponse | null { return this.gameSession.state.pendingResponse; }
  private set pendingResponse(value: PendingResponse | null) { this.gameSession.state.pendingResponse = value; }
  private get awaitingDiscardOwnerId(): string | null { return this.gameSession.state.awaitingDiscardOwnerId; }
  private set awaitingDiscardOwnerId(value: string | null) { this.gameSession.state.awaitingDiscardOwnerId = value; }
  private get nextRoundSetup(): RoundBootstrapSetup | null { return this.gameSession.state.nextRoundSetup; }
  private set nextRoundSetup(value: RoundBootstrapSetup | null) { this.gameSession.state.nextRoundSetup = value; }
  private get roundDealerId(): string | null { return this.gameSession.state.roundDealerId; }
  private set roundDealerId(value: string | null) { this.gameSession.state.roundDealerId = value; }

  startRound(): void {
    if (this.state.phase !== "waiting" && this.state.phase !== "ended") return;
    const previousWinner = this.lastRoundResult?.players.find((player) => player.clientId === this.lastRoundResult?.winnerId);
    this.state.previousWinnerId = previousWinner?.clientId ?? "";
    this.state.previousWinnerName = previousWinner?.name ?? "";
    this.state.previousHuType = previousWinner?.huType ?? "";
    this.lastRoundResult = null;
    this.deferredHumanChiCandidate = null;
    this.state.phase = "declaring";
    this.state.responseEndsAt = 0;
    this.state.declareEndsAt = 0;
    this.state.publicDiscardPile.clear();
    this.gameSession.state.pendingFishDeclarations.clear();
    this.gameSession.state.publicGeneralPool = [];
    this.pendingResponse = null;
    this.awaitingDiscardOwnerId = null;
    resetRoundPlayers(this.state, this.playerOrder);

    this.deck = this.gameSession.createShuffledDeck(this.random);
    const setup = this.resolveBootstrapSetup();
    const pickerId = setup.mode === "picker" ? setup.pickerId : null;
    let dealerId = setup.mode === "fixed" ? setup.dealerId : "";
    let dealerCard: Card | null = null;
    if (setup.mode === "picker") {
      dealerCard = this.deck.shift() ?? null;
      dealerId = dealerCard ? this.gameSession.resolveDealer(this.playerOrder, setup.pickerId, dealerCard) : setup.pickerId;
    }
    this.roundDealerId = dealerId;
    this.state.dealerId = dealerId;
    this.state.dealerPickerId = pickerId ?? "";
    dealInitialHands(this.playerOrder, this.deck, this.playerHands);
    if (setup.mode === "picker" && dealerCard) {
      this.playerHands.get(dealerId)?.unshift(dealerCard);
    } else {
      const extra = this.deck.shift();
      if (extra) this.playerHands.get(dealerId)?.unshift(extra);
      const hand = this.playerHands.get(dealerId) ?? [];
      dealerCard = hand[Math.floor(this.random() * hand.length)] ?? null;
    }
    this.gameSession.state.dealerCard = dealerCard ? { ...dealerCard } : null;
    this.state.dealerCard = dealerCard ? this.ops.toSchemaCard(dealerCard, false, dealerCard.source ?? "upper") : new CardSchema();
    this.state.deckCount = this.deck.length;
    this.state.currentPlayerId = dealerId;
    this.state.lastAction = `DECLARING 0ms`;
    this.nextRoundSetup = null;

    for (const seatId of this.playerOrder) {
      if (this.botIds.has(seatId)) this.submitDefaultDeclaration(seatId);
    }
    const humanHand = this.playerHands.get(HUMAN_ID) ?? [];
    if (this.gameSession.buildDefaultDeclarationPayload(humanHand).fishCardIds.length === 0) {
      this.declareFish([]);
    }
    this.touch();
  }

  declareFish(fishCardIds: string[]): boolean {
    if (this.state.phase !== "declaring") return false;
    const player = this.state.players.get(HUMAN_ID);
    if (!player || player.declarationStep !== "fish") return false;
    const ok = this.submitFishDeclaration(HUMAN_ID, fishCardIds, false);
    this.touch();
    return ok;
  }

  declareKongs(count: number): boolean {
    if (this.state.phase !== "declaring") return false;
    const player = this.state.players.get(HUMAN_ID);
    if (!player || player.declarationStep !== "kong") return false;
    const ok = this.submitKongDeclaration(HUMAN_ID, count, false);
    this.touch();
    return ok;
  }

  submitAction(request: OfflineActionRequest): boolean {
    if (this.state.phase !== "playing" || !this.pendingResponse) return false;
    const available = this.getHumanAvailableActions();
    const entry = available.find((item) => item.action === request.action);
    if (!entry || (!entry.enabled && !entry.deferred)) return false;
    if ((request.action === "kai" || request.action === "peng" || request.action === "chi") &&
        (!request.candidateId || !entry.candidates?.some((candidate) => candidate.id === request.candidateId))) {
      return false;
    }

    if (this.state.responsePhase === "collective") {
      if (request.action === "chi" && entry.deferred) {
        this.deferredHumanChiCandidate = request.candidateId ?? null;
        this.pendingResponse.collectives.set(HUMAN_ID, { action: "pass" });
      } else {
        this.pendingResponse.collectives.set(HUMAN_ID, {
          action: request.action,
          candidateId: request.candidateId,
        });
      }
      this.resolveCollectiveIfReady();
    } else if (request.action === "chi") {
      this.executeEat(HUMAN_ID, request.candidateId);
    } else if (request.action === "pass" && this.state.responsePhase === "local_upper") {
      this.executeGrab(HUMAN_ID);
    } else if (request.action === "pass" && this.state.responsePhase === "local_draw") {
      this.executePassToNext(HUMAN_ID);
    } else {
      return false;
    }
    this.touch();
    return true;
  }

  discard(cardId: string): boolean {
    if (this.state.phase !== "playing" || this.awaitingDiscardOwnerId !== HUMAN_ID) return false;
    const card = this.ops.discardCardById(HUMAN_ID, cardId);
    if (!card) return false;
    this.awaitingDiscardOwnerId = null;
    this.ops.pushDiscard(HUMAN_ID, card);
    this.beginCollectiveFromDiscard(HUMAN_ID, card);
    this.touch();
    return true;
  }

  /** Executes at most one automatic unit so the browser adapter can yield. */
  advanceAutomation(): boolean {
    if (this.state.phase !== "playing" || this.isHumanDecisionPending()) return false;
    if (this.awaitingDiscardOwnerId) {
      const ownerId = this.awaitingDiscardOwnerId;
      if (!this.botIds.has(ownerId)) return false;
      const picked = this.gameSession.chooseBotDiscard({
        hand: this.playerHands.get(ownerId) ?? [],
        visibleCards: this.buildBotVisibleCards(),
        declaredKongs: this.state.players.get(ownerId)?.declaredKongs ?? 0,
        strength: 50,
        random: this.random,
      });
      this.discardFor(ownerId, picked?.id);
      this.touch();
      return true;
    }
    if (this.state.responsePhase === "collective") {
      this.resolveCollectiveIfReady();
      this.touch();
      return true;
    }
    const pending = this.pendingResponse;
    const ownerId = pending?.ownerId;
    if (!pending || !ownerId || !this.botIds.has(ownerId)) return false;
    const actions = this.getAvailableActions(ownerId, false).filter((item) => item.enabled);
    const choice = this.gameSession.chooseBotAction({
      hand: this.playerHands.get(ownerId) ?? [],
      pendingCard: pending.card,
      actions,
      visibleCards: this.buildBotVisibleCards(),
      strength: 50,
      random: this.random,
    });
    if (choice.action === "chi") this.executeEat(ownerId, choice.candidateId);
    else if (this.state.responsePhase === "local_upper") this.executeGrab(ownerId);
    else if (this.gameSession.rules.isDiscardRestricted(pending.card)) this.retainPendingSpecial(ownerId);
    else this.executePassToNext(ownerId);
    this.touch();
    return true;
  }

  isHumanDecisionPending(): boolean {
    if (this.state.phase === "declaring") {
      return !Boolean(this.state.players.get(HUMAN_ID)?.declaredReady);
    }
    if (this.state.phase !== "playing") return false;
    if (this.awaitingDiscardOwnerId === HUMAN_ID) return true;
    return this.getHumanAvailableActions().length > 0;
  }

  view(): OfflinePracticeView {
    this.updatePublicHandCounts();
    const legalDiscardCardIds = this.awaitingDiscardOwnerId === HUMAN_ID
      ? (this.playerHands.get(HUMAN_ID) ?? []).filter((card) => this.ops.canDiscardCard(HUMAN_ID, card.id)).map((card) => card.id)
      : [];
    const card = (value: CardSchema | null | undefined): Card | null =>
      value?.id ? this.ops.toPlainCard(value) : null;
    const cards = (values: Iterable<CardSchema>): Card[] => [...values].map((value) => this.ops.toPlainCard(value));
    return {
      roomId: "offline-practice",
      stateRevision: this.state.stateRevision,
      roomMode: "practice",
      scoringMode: "single",
      completedRounds: this.state.completedRounds,
      phase: this.state.phase,
      serverNow: Date.now(),
      matchStartsAt: 0,
      hostPlayerId: HUMAN_ID,
      dealerId: this.state.dealerId,
      dealerPickerId: this.state.dealerPickerId,
      previousWinnerId: this.state.previousWinnerId,
      previousWinnerName: this.state.previousWinnerName,
      previousHuType: this.state.previousHuType,
      currentPlayerId: this.state.currentPlayerId,
      currentTurnPlayerId: this.state.currentTurnPlayerId,
      previousPlayerId: this.state.previousPlayerId,
      pollOriginPlayerId: this.state.pollOriginPlayerId,
      activeResponderId: this.state.activeResponderId,
      pendingReceiverId: this.state.pendingReceiverId,
      responsePhase: this.state.responsePhase,
      responseEndsAt: 0,
      presentationUntil: 0,
      lastAction: this.state.lastAction,
      deckCount: this.state.deckCount,
      isMoCard: this.state.isMoCard,
      targetCard: card(this.state.targetCard),
      responseCard: card(this.state.responseCard),
      dealerCard: this.gameSession.state.dealerCard ? { ...this.gameSession.state.dealerCard } : null,
      publicDiscardPile: cards(this.state.publicDiscardPile),
      publicGeneralPool: this.gameSession.state.publicGeneralPool.map((item) => ({ ...item })),
      declareEndsAt: 0,
      players: this.playerOrder.map((seatId) => {
        const player = this.state.players.get(seatId)!;
        return {
          clientId: player.clientId,
          seatIndex: player.seatIndex,
          name: player.name,
          handCount: player.handCount,
          visibleGroupScore: player.visibleGroupScore,
          declaredKongs: player.declaredKongs,
          declarationStep: player.declarationStep,
          pendingFishGroupSizes: [...player.pendingFishGroupSizes],
          declaredReady: player.declaredReady,
          lobbyReady: player.lobbyReady,
          isBot: player.isBot,
          isAutoPlay: player.isAutoPlay,
          isConfiguredBot: player.isConfiguredBot,
          botStrength: player.botStrength,
          cumulativeScore: player.cumulativeScore,
          connected: player.connected,
          discardPile: cards(player.discardPile),
          exposedArea: cards(player.exposedArea),
          exposedGroupSizes: [...player.exposedGroupSizes],
          exposedGroupKinds: [...player.exposedGroupKinds],
          generalArea: cards(player.generalArea),
          wildcardPool: cards(player.wildcardPool),
          fishArea: cards(player.fishArea),
        };
      }),
      privateHand: (this.playerHands.get(HUMAN_ID) ?? []).map((item) => ({ ...item })),
      availableActions: this.getHumanAvailableActions(),
      decisionTimer: {
        legalDiscardCardIds,
        untimed: true,
        totalMs: 0,
        endsAt: 0,
        decisionKey: `offline:${this.state.stateRevision}`,
      },
      roundResult: this.lastRoundResult,
    };
  }

  private resolveBootstrapSetup(): RoundBootstrapSetup {
    if (this.nextRoundSetup?.mode === "fixed") return this.nextRoundSetup;
    if (this.nextRoundSetup?.mode === "picker") return this.nextRoundSetup;
    return { mode: "picker", pickerId: this.gameSession.pickInitialDealer(this.playerOrder, this.random) };
  }

  private submitDefaultDeclaration(seatId: string): void {
    const hand = this.playerHands.get(seatId) ?? [];
    const payload = this.gameSession.buildDefaultDeclarationPayload(hand);
    this.submitFishDeclaration(seatId, payload.fishCardIds, true);
    this.submitKongDeclaration(seatId, payload.declaredKongs, true);
  }

  private submitFishDeclaration(seatId: string, fishCardIds: string[], force: boolean): boolean {
    const player = this.state.players.get(seatId);
    if (!player || player.declarationStep !== "fish" || player.declaredReady) return false;
    const hand = this.playerHands.get(seatId) ?? [];
    const requested = force ? this.gameSession.buildDefaultDeclarationPayload(hand).fishCardIds : fishCardIds;
    const selection = this.gameSession.buildDeclarationSelection(hand, { fishCardIds: requested, declaredKongs: 0 });
    if (!selection.idMatch || !selection.fishValid) return false;
    const selected = new Set(selection.selectedCards.map((item) => item.id));
    this.playerHands.set(seatId, hand.filter((item) => !selected.has(item.id)));
    this.gameSession.state.pendingFishDeclarations.set(seatId, selection.selectedCards.map((item) => ({ ...item })));
    player.pendingFishGroupSizes.clear();
    selection.fishGroupSizes.forEach((size) => player.pendingFishGroupSizes.push(size));
    player.declarationStep = "kong";
    const maximum = this.gameSession.buildDeclarationSelection(
      this.playerHands.get(seatId) ?? [],
      { declaredKongs: Number.MAX_SAFE_INTEGER },
    ).declaredKongs;
    if (maximum === 0) this.submitKongDeclaration(seatId, 0, true);
    return true;
  }

  private submitKongDeclaration(seatId: string, count: number, force: boolean): boolean {
    const player = this.state.players.get(seatId);
    if (!player || player.declarationStep !== "kong" || player.declaredReady) return false;
    const hand = this.playerHands.get(seatId) ?? [];
    const maximum = this.gameSession.buildDeclarationSelection(hand, { declaredKongs: Number.MAX_SAFE_INTEGER }).declaredKongs;
    const requested = Math.floor(Number(count));
    if (!force && (!Number.isFinite(requested) || requested < 0 || requested > maximum)) return false;
    player.declaredKongs = force ? maximum : requested;
    player.declarationStep = "done";
    player.declaredReady = true;
    if (areAllDeclarationsReady(this.playerOrder, (id) => this.state.players.get(id))) this.finishDeclaring();
    return true;
  }

  private finishDeclaring(): void {
    for (const [seatId, selectedCards] of this.gameSession.state.pendingFishDeclarations) {
      const player = this.state.players.get(seatId);
      if (!player) continue;
      selectedCards.forEach((item) => player.fishArea.push(this.ops.toSchemaCard(item, true, item.source ?? "upper")));
    }
    for (const player of this.state.players.values()) player.pendingFishGroupSizes.clear();
    this.gameSession.state.pendingFishDeclarations.clear();
    const dealerId = this.roundDealerId ?? this.playerOrder[0]!;
    applyPlayingStartAfterDeclaring(this.state, dealerId, getPreviousPlayerId(this.playerOrder, dealerId));
    this.enterDiscardStage(dealerId, "OPENING_DISCARD");
  }

  private getAvailableActions(seatId: string, collectiveProbe: boolean): AvailableActionEntry[] {
    if (!this.pendingResponse) return [];
    const entries = this.gameSession.getAvailableActions({
      phase: this.state.phase,
      seatId,
      pending: this.pendingResponse,
      responsePhase: this.state.responsePhase,
      collectiveResponderId: collectiveProbe ? seatId : null,
      probeCollectiveResponder: collectiveProbe,
      awaitingDiscardOwnerId: this.awaitingDiscardOwnerId,
      hand: this.playerHands.get(seatId) ?? [],
      wildcardPool: [],
      explainHuForSeat: (id, hand, response) => this.ops.explainHuForSeat(id, hand, response, 0),
      logHuCheck: () => undefined,
      getHandWithoutPending: (id, response) => this.ops.getHandWithoutPending(id, response),
      getNextPlayerId: (id) => getNextPlayerId(this.playerOrder, id),
    });
    const pendingCard = this.pendingResponse.card;
    return entries.map((entry) => {
      if ((entry.action !== "kai" && entry.action !== "peng" && entry.action !== "chi") || !entry.candidates?.length) return entry;
      const candidates = entry.candidates.filter((candidate) =>
        this.preservesDeclaredKongsAfterAction(seatId, entry.action as "kai" | "peng" | "chi", pendingCard, candidate.id),
      );
      return { ...entry, enabled: entry.deferred ? false : candidates.length > 0, deferred: entry.deferred && candidates.length > 0, candidates };
    });
  }

  private getHumanAvailableActions(): AvailableActionEntry[] {
    if (this.state.phase !== "playing" || !this.pendingResponse) return [];
    if (this.awaitingDiscardOwnerId === HUMAN_ID) return [];
    const entries = this.getAvailableActions(HUMAN_ID, this.state.responsePhase === "collective");
    if (this.state.responsePhase === "collective") {
      if (this.pendingResponse.collectives.has(HUMAN_ID)) return [];
      const meaningful = entries.some((item) =>
        item.deferred && item.action === "chi" || item.enabled && this.gameSession.rules.collectivePriority(item.action) > 0,
      );
      return meaningful ? entries.filter((item) => item.deferred || item.enabled) : [];
    }
    return this.pendingResponse.ownerId === HUMAN_ID ? entries.filter((item) => item.enabled) : [];
  }

  private resolveCollectiveIfReady(): void {
    const pending = this.pendingResponse;
    if (!pending || this.state.responsePhase !== "collective") return;
    const humanActions = this.getHumanAvailableActions();
    if (humanActions.length > 0 && !pending.collectives.has(HUMAN_ID)) return;
    if (!pending.collectives.has(HUMAN_ID)) pending.collectives.set(HUMAN_ID, { action: "pass" });
    for (const seatId of this.playerOrder) {
      if (pending.collectives.has(seatId)) continue;
      const actions = this.getAvailableActions(seatId, true).filter((item) => item.enabled);
      const choice = this.gameSession.chooseBotAction({
        hand: this.playerHands.get(seatId) ?? [],
        pendingCard: pending.card,
        actions,
        visibleCards: this.buildBotVisibleCards(),
        strength: 50,
        random: this.random,
      });
      pending.collectives.set(seatId, choice);
    }
    this.gameSession.resolveCollective({
      pending,
      playerOrder: this.playerOrder,
      executeResponseWinner: (winnerId, choice) => this.executeResponseWinner(winnerId, choice),
      setLastAction: (action) => { this.state.lastAction = action; },
      enterOwnerLocalPhaseAfterNoResponse: (ownerId) => this.enterOwnerLocalAfterNoResponse(ownerId),
    });
  }

  private enterOwnerLocalAfterNoResponse(ownerId: string): void {
    const pending = this.pendingResponse;
    if (!pending) return;
    if (pending.card.source === "draw" && !this.gameSession.rules.isDiscardRestricted(pending.card)) {
      const canChi = this.gameSession.rules.buildChiCandidates(
        this.ops.getHandWithoutPending(ownerId, pending.card),
        pending.card,
        [],
      ).some((candidate) => this.preservesDeclaredKongsAfterAction(ownerId, "chi", pending.card, candidate.id));
      if (!canChi) {
        this.executePassToNext(ownerId);
        return;
      }
    }
    this.gameSession.enterOwnerLocal({
      pending,
      ownerId,
      getNextPlayerId: (id) => getNextPlayerId(this.playerOrder, id),
      setPendingOwner: (id) => { if (this.pendingResponse) this.pendingResponse.ownerId = id; },
      setResponsePhase: (phase) => { this.state.responsePhase = phase; },
      setCurrentPlayer: (id) => { this.state.currentPlayerId = id; },
      setCurrentTurnPlayer: (id) => { this.state.currentTurnPlayerId = id; },
      setLoopStageLocal: () => { this.state.loopStage = "local_poll"; },
      clearActiveResponder: () => { this.state.activeResponderId = ""; },
      clearResponseEndsAt: () => { this.state.responseEndsAt = 0; },
      syncAllPrivateHands: () => undefined,
      tickBots: () => undefined,
    });
    if (this.pendingResponse?.ownerId === HUMAN_ID && this.deferredHumanChiCandidate) {
      const candidateId = this.deferredHumanChiCandidate;
      this.deferredHumanChiCandidate = null;
      this.executeEat(HUMAN_ID, candidateId);
    }
  }

  private executeResponseWinner(winnerId: string, choice: { action: ActionType; candidateId?: string }): void {
    const pending = this.pendingResponse;
    if (!pending) return;
    const consumePendingDiscard = () => {
      if (pending.card.source === "upper") {
        this.ops.consumePendingDiscard(this.state.pollOriginPlayerId || pending.ownerId, pending.card);
      }
    };
    const operationDeps = this.ops.buildOperationExecutorDeps();
    this.gameSession.executeResponseWinner({
      getHand: (id) => this.playerHands.get(id) ?? [],
      explainHuForSeat: (id, hand, response) => this.ops.explainHuForSeat(id, hand, response, 0),
      logHuCheck: () => undefined,
      executeKaiOperation: (id, response, candidateId) => {
        if (!candidateId || !this.preservesDeclaredKongsAfterAction(id, "kai", response, candidateId)) return false;
        const ok = tryExecuteKai(operationDeps, id, response, candidateId);
        if (ok) {
          consumePendingDiscard();
          const player = this.state.players.get(id);
          if (player) player.declaredKongs = Math.max(0, player.declaredKongs - 1);
        }
        return ok;
      },
      executePengOperation: (id, response, candidateId) => {
        const ok = Boolean(candidateId && this.preservesDeclaredKongsAfterAction(id, "peng", response, candidateId) &&
          tryExecutePeng(operationDeps, id, response, candidateId));
        if (ok) consumePendingDiscard();
        return ok;
      },
      executeChiOperation: (id, response, candidateId) => {
        const ok = Boolean(candidateId && this.preservesDeclaredKongsAfterAction(id, "chi", response, candidateId) &&
          tryExecuteChi(operationDeps, id, response, candidateId).ok);
        if (ok) consumePendingDiscard();
        return ok;
      },
      isEatResponder: (owner, responder) => getNextPlayerId(this.playerOrder, owner) === responder,
      getNextPlayerId: (id) => getNextPlayerId(this.playerOrder, id),
      setLastAction: (value) => { this.state.lastAction = value; },
      startTurn: (id, tag) => this.startTurn(id, tag),
      enterDiscardStage: (id, tag) => this.enterDiscardStage(id, tag),
      enterNoResponsePath: () => this.enterOwnerLocalAfterNoResponse(pending.ownerId),
      endRound: (lastAction, id, groups) => {
        consumePendingDiscard();
        this.endRound(lastAction, id ?? null, groups ?? []);
      },
    }, pending, winnerId, choice);
  }

  private executeEat(ownerId: string, candidateId?: string): boolean {
    const pending = this.pendingResponse;
    if (!pending || !candidateId || !this.preservesDeclaredKongsAfterAction(ownerId, "chi", pending.card, candidateId)) return false;
    return this.gameSession.executeEat({
      pending,
      executeChiOperation: (id, response) => {
        const result = tryExecuteChi(this.ops.buildOperationExecutorDeps(), id, response, candidateId);
        if (result.ok && response.source === "upper") {
          this.ops.consumePendingDiscard(this.state.pollOriginPlayerId || pending.ownerId, response);
        }
        return result;
      },
      setLastAction: (action) => { this.state.lastAction = action; },
      enterDiscardStage: (id, tag) => this.enterDiscardStage(id, tag),
    }, ownerId);
  }

  private executeGrab(ownerId: string): void {
    this.gameSession.executeGrab({
      pending: this.pendingResponse,
      deck: this.deck,
      shouldEndDrawAfterUpperPass,
      endRound: (lastAction) => this.endRound(lastAction),
      setDeckCount: (count) => { this.state.deckCount = count; },
      setupCollectiveAfterGrab: (id, card) => {
        this.pendingResponse = createPendingResponse(id, card, "draw");
        this.state.responsePhase = "collective";
        this.ops.setResponseCard(card, "draw");
        applyCollectivePollState(this.state, id, getPreviousPlayerId(this.playerOrder, id), id, `${id} ZHUA`);
      },
      setLastAction: (value) => { this.state.lastAction = value; },
      syncAllPrivateHands: () => undefined,
      startCollectivePolling: () => undefined,
    }, ownerId);
  }

  private executePassToNext(ownerId: string): void {
    const pending = this.pendingResponse;
    if (!pending || this.gameSession.rules.isDiscardRestricted(pending.card)) return;
    this.ops.pushDiscard(ownerId, pending.card);
    const nextId = getNextPlayerId(this.playerOrder, ownerId);
    this.pendingResponse = createPendingResponse(nextId, pending.card, "upper");
    this.state.pollOriginPlayerId = ownerId;
    this.state.previousPlayerId = ownerId;
    this.state.currentPlayerId = nextId;
    this.state.currentTurnPlayerId = nextId;
    this.state.responsePhase = "local_upper";
    this.state.loopStage = "local_poll";
    this.ops.setResponseCard(pending.card, "upper");
    this.state.lastAction = `${ownerId} PASS`;
  }

  private retainPendingSpecial(ownerId: string): void {
    const pending = this.pendingResponse;
    if (!pending) return;
    this.ops.pushExposedGroup(ownerId, [pending.card], true, "chi");
    this.state.lastAction = `${ownerId} FORCE_TAKE`;
    this.enterDiscardStage(ownerId, "FORCE_TAKE");
  }

  private startTurn(ownerId: string, tag: string): void {
    if (this.state.phase !== "playing") return;
    applyTurnTransitionState(this.state, ownerId);
    this.gameSession.drawForOwner({
      phase: this.state.phase,
      deck: this.deck,
      setDeckCount: (count) => { this.state.deckCount = count; },
      endRound: (lastAction) => this.endRound(lastAction),
      createPendingResponse: ({ ownerId: id, card, source }) => createPendingResponse(id, card, source),
      setPendingResponse: (value) => { this.pendingResponse = value; },
      clearAwaitingDiscardOwner: () => { this.awaitingDiscardOwnerId = null; },
      setResponseCard: (card, source) => this.ops.setResponseCard(card, source),
      applyCollectivePollState: (id, previous, origin, lastAction) => applyCollectivePollState(this.state, id, previous, origin, lastAction),
      getPreviousPlayerId: (id) => getPreviousPlayerId(this.playerOrder, id),
      syncAllPrivateHands: () => undefined,
      startCollectivePolling: () => undefined,
    }, ownerId, tag);
  }

  private enterDiscardStage(ownerId: string, tag: string): void {
    const hand = this.playerHands.get(ownerId) ?? [];
    if (this.gameSession.rules.enforceDeclaredKans && !hand.some((card) => this.ops.canDiscardCard(ownerId, card.id)) &&
        countHiddenKans(hand) >= (this.state.players.get(ownerId)?.declaredKongs ?? 0) && this.gameSession.rules.explainHand(hand).valid) {
      this.endRound(`${ownerId} HU`, ownerId, []);
      return;
    }
    this.gameSession.enterDiscardStage({
      playerHand: hand,
      declareNoDiscardWin: (id) => this.endRound(`${id} HU`, id, []),
      createPendingResponse: ({ ownerId: id, card, source }) => createPendingResponse(id, card, source),
      setPendingResponse: (value) => { this.pendingResponse = value; },
      setAwaitingDiscardOwner: (id) => { this.awaitingDiscardOwnerId = id; },
      resetCollectivePolling: () => undefined,
      applyEnterDiscardStageState: (id, value) => applyEnterDiscardStageState(this.state, id, value),
      clearResponseCard: () => { this.state.responseCard = new CardSchema(); },
      syncAllPrivateHands: () => undefined,
      tickBots: () => undefined,
    }, ownerId, tag);
  }

  private discardFor(ownerId: string, cardId?: string): void {
    const card = cardId ? this.ops.discardCardById(ownerId, cardId) : this.ops.pickDiscardCard(ownerId);
    if (!card) {
      this.endRound(`${ownerId} HU`, ownerId, []);
      return;
    }
    this.awaitingDiscardOwnerId = null;
    this.ops.pushDiscard(ownerId, card);
    this.beginCollectiveFromDiscard(ownerId, card);
  }

  private beginCollectiveFromDiscard(ownerId: string, discard: Card): void {
    this.gameSession.beginCollectiveFromDiscard({
      createPendingResponse: ({ ownerId: id, card, source }) => createPendingResponse(id, card, source),
      setPendingResponse: (value) => { this.pendingResponse = value; },
      clearAwaitingDiscardOwner: () => { this.awaitingDiscardOwnerId = null; },
      setResponseCard: (card, source) => this.ops.setResponseCard(card, source),
      applyCollectivePollState: (id, previous, origin, lastAction) => applyCollectivePollState(this.state, id, previous, origin, lastAction),
      syncAllPrivateHands: () => undefined,
      startCollectivePolling: () => undefined,
    }, ownerId, discard);
  }

  private preservesDeclaredKongsAfterAction(
    seatId: string,
    action: "kai" | "peng" | "chi",
    pendingCard: Card,
    candidateId?: string,
  ): boolean {
    const declaredKongs = this.state.players.get(seatId)?.declaredKongs ?? 0;
    const hand = this.ops.getHandWithoutPending(seatId, pendingCard);
    const candidates = action === "kai"
      ? buildKaiCandidates(hand, pendingCard, this.ops.getWildcardPoolCards(seatId))
      : action === "peng"
        ? buildPengCandidates(hand, pendingCard)
        : buildChiCandidates(hand, pendingCard, this.ops.getWildcardPoolCards(seatId));
    const picked = candidates.find((item) => item.candidate.id === candidateId);
    if (!picked) return false;
    const nextHand = hand.filter((card) => !new Set(picked.plan.handCards.map((item) => item.id)).has(card.id));
    return countHiddenKans(nextHand) >= Math.max(0, declaredKongs - (action === "kai" ? 1 : 0));
  }

  private buildBotVisibleCards(): Card[] {
    const byId = new Map<string, Card>();
    const add = (card: Card) => { if (card.id) byId.set(card.id, { ...card }); };
    this.gameSession.state.publicGeneralPool.forEach(add);
    this.state.publicDiscardPile.forEach((card) => add(this.ops.toPlainCard(card)));
    for (const player of this.state.players.values()) {
      [player.discardPile, player.exposedArea, player.generalArea, player.fishArea]
        .forEach((area) => area.forEach((card) => add(this.ops.toPlainCard(card))));
    }
    return [...byId.values()];
  }

  private endRound(lastAction: string, winnerId: string | null = null, groups: string[] = []): void {
    if (this.state.phase === "ended") return;
    const response = this.pendingResponse?.card ?? null;
    const players = this.gameSession.settleRound(buildRoundResultPlayers(
      this.playerOrder,
      this.state.players,
      this.playerHands,
      (card) => this.ops.toPlainCard(card),
      winnerId,
      groups,
      response,
    ));
    const winner = players.find((player) => player.clientId === winnerId);
    this.nextRoundSetup = this.gameSession.prepareNextRound({
      winnerId,
      huType: winner?.huType ?? null,
      roundDealerId: this.roundDealerId,
      playerOrder: this.playerOrder,
      hasPlayer: (id) => this.state.players.has(id),
    });
    endRoundFlow({
      state: this.state,
      resetCollectivePolling: () => undefined,
      clearBotTimer: () => undefined,
      setPendingResponseNull: () => { this.pendingResponse = null; },
      setAwaitingDiscardOwnerNull: () => { this.awaitingDiscardOwnerId = null; },
      broadcast: (event, payload) => {
        if (event !== "round_result") return;
        const base = payload as { winnerId: string | null; groups: string[]; remainingDeck: Card[] };
        this.lastRoundResult = {
          ...base,
          players: finalizeRoomScores(this.state, players),
          scoringMode: "single",
          roundNumber: this.state.completedRounds,
        };
      },
      buildRoundResultPlayers: () => players,
      buildRemainingDeckPreview: () => this.deck.slice(0, 8).map((item) => ({ ...item })),
      broadcastAvailableActions: () => undefined,
    }, lastAction, winnerId, groups);
  }

  private updatePublicHandCounts(): void {
    for (const [seatId, player] of this.state.players) {
      player.handCount = this.playerHands.get(seatId)?.length ?? 0;
      player.visibleGroupScore = calculateVisibleGroupScore(player);
    }
  }

  private touch(): void {
    this.updatePublicHandCounts();
    this.state.stateRevision += 1;
  }
}

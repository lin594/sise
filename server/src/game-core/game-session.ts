import { chooseBotAction, chooseBotDiscard, type BotDecisionInput, type BotDiscardInput } from "../rooms/bot-strategy.js";
import {
  advanceCollectiveFlow,
  beginCollectiveFromDiscardFlow,
  decideActionDispatch,
  discardFromAndCollectiveFlow,
  drawForOwnerFlow,
  enterDiscardStageFlow,
  enterOwnerLocalPhaseAfterNoResponseFlow,
  executeEatFlow,
  executeGrabFlow,
  getAvailableActionsFlow,
  planTickBots,
  resolveCollectivePhaseFlow,
  resolveLocalDrawIdleAction,
  runBotStep,
  startCollectiveFlow,
  type BeginCollectiveFromDiscardDeps,
  type DrawForOwnerDeps,
  type EnterDiscardStageDeps,
} from "../rooms/flow/playing-flow.js";
import { executeResponseWinner } from "../rooms/flow/response-winner.js";
import type { ActionType, Card } from "../rules/types.js";
import {
  createDefaultRuleSetRegistry,
  PUTIAN_V1_RULE_REF,
  type RoundBootstrapSetup,
  type RuleRef,
  type RuleSet,
  type RuleSetRegistry,
} from "./ruleset.js";

export interface PendingResponse {
  ownerId: string;
  card: Card;
  collectives: Map<string, { action: ActionType; candidateId?: string }>;
  responsePhaseAfterNoResponse?: "local_upper" | "local_draw";
}

export interface SerializedGameSessionState {
  ruleRef: RuleRef;
  deck: Card[];
  playerHands: Array<[string, Card[]]>;
  playerOrder: string[];
  botIds: string[];
  pendingResponse: null | Omit<PendingResponse, "collectives"> & {
    collectives: Array<[string, { action: ActionType; candidateId?: string }]>;
  };
  publicGeneralPool: Card[];
  dealerCard: Card | null;
  dealerPickerId: string | null;
  nextRoundSetup: RoundBootstrapSetup | null;
  awaitingDiscardOwnerId: string | null;
  pendingFishDeclarations: Array<[string, Card[]]>;
  collectiveQueue: string[];
  collectiveCursor: number;
  collectiveResponderId: string | null;
  roundDealerId: string | null;
}

export interface GameSessionState {
  deck: Card[];
  playerHands: Map<string, Card[]>;
  playerOrder: string[];
  botIds: Set<string>;
  pendingResponse: PendingResponse | null;
  publicGeneralPool: Card[];
  dealerCard: Card | null;
  dealerPickerId: string | null;
  nextRoundSetup: RoundBootstrapSetup | null;
  awaitingDiscardOwnerId: string | null;
  pendingFishDeclarations: Map<string, Card[]>;
  collectiveQueue: string[];
  collectiveCursor: number;
  collectiveResponderId: string | null;
  roundDealerId: string | null;
}

function createEmptyState(): GameSessionState {
  return {
    deck: [],
    playerHands: new Map(),
    playerOrder: [],
    botIds: new Set(),
    pendingResponse: null,
    publicGeneralPool: [],
    dealerCard: null,
    dealerPickerId: null,
    nextRoundSetup: null,
    awaitingDiscardOwnerId: null,
    pendingFishDeclarations: new Map(),
    collectiveQueue: [],
    collectiveCursor: 0,
    collectiveResponderId: null,
    roundDealerId: null,
  };
}

function cloneCards(cards: readonly Card[]): Card[] {
  return cards.map((card) => ({ ...card }));
}

/**
 * Browser-safe coordinator for every rule-sensitive round transition.
 * Hosts own timers, transport, persistence and visibility. Colyseus uses this
 * class now; the browser-local adapter can use the same state and transitions
 * without importing the online room.
 */
export class GameSession {
  private ruleSetValue: RuleSet;
  readonly state: GameSessionState = createEmptyState();

  constructor(
    ruleRef: RuleRef = PUTIAN_V1_RULE_REF,
    private readonly registry: RuleSetRegistry = createDefaultRuleSetRegistry(),
  ) {
    this.ruleSetValue = registry.resolve(ruleRef);
  }

  get ruleRef(): RuleRef {
    return this.ruleSetValue.ref;
  }

  get rules(): RuleSet {
    return this.ruleSetValue;
  }

  useRuleSet(ruleRef: RuleRef): void {
    this.ruleSetValue = this.registry.resolve(ruleRef);
  }

  serialize(): SerializedGameSessionState {
    const pending = this.state.pendingResponse;
    return {
      ruleRef: { ...this.ruleRef },
      deck: cloneCards(this.state.deck),
      playerHands: [...this.state.playerHands].map(([id, cards]) => [id, cloneCards(cards)]),
      playerOrder: [...this.state.playerOrder],
      botIds: [...this.state.botIds],
      pendingResponse: pending ? {
        ...pending,
        card: { ...pending.card },
        collectives: [...pending.collectives].map(([id, choice]) => [id, { ...choice }]),
      } : null,
      publicGeneralPool: cloneCards(this.state.publicGeneralPool),
      dealerCard: this.state.dealerCard ? { ...this.state.dealerCard } : null,
      dealerPickerId: this.state.dealerPickerId,
      nextRoundSetup: this.state.nextRoundSetup ? { ...this.state.nextRoundSetup } : null,
      awaitingDiscardOwnerId: this.state.awaitingDiscardOwnerId,
      pendingFishDeclarations: [...this.state.pendingFishDeclarations].map(([id, cards]) => [id, cloneCards(cards)]),
      collectiveQueue: [...this.state.collectiveQueue],
      collectiveCursor: this.state.collectiveCursor,
      collectiveResponderId: this.state.collectiveResponderId,
      roundDealerId: this.state.roundDealerId,
    };
  }

  restore(snapshot: SerializedGameSessionState): void {
    this.useRuleSet(snapshot.ruleRef);
    this.state.deck = cloneCards(snapshot.deck);
    this.state.playerHands = new Map(snapshot.playerHands.map(([id, cards]) => [id, cloneCards(cards)]));
    this.state.playerOrder = [...snapshot.playerOrder];
    this.state.botIds = new Set(snapshot.botIds);
    this.state.pendingResponse = snapshot.pendingResponse ? {
      ...snapshot.pendingResponse,
      card: { ...snapshot.pendingResponse.card },
      collectives: new Map(snapshot.pendingResponse.collectives.map(([id, choice]) => [id, { ...choice }])),
    } : null;
    this.state.publicGeneralPool = cloneCards(snapshot.publicGeneralPool);
    this.state.dealerCard = snapshot.dealerCard ? { ...snapshot.dealerCard } : null;
    this.state.dealerPickerId = snapshot.dealerPickerId;
    this.state.nextRoundSetup = snapshot.nextRoundSetup ? { ...snapshot.nextRoundSetup } : null;
    this.state.awaitingDiscardOwnerId = snapshot.awaitingDiscardOwnerId;
    this.state.pendingFishDeclarations = new Map(
      snapshot.pendingFishDeclarations.map(([id, cards]) => [id, cloneCards(cards)]),
    );
    this.state.collectiveQueue = [...snapshot.collectiveQueue];
    this.state.collectiveCursor = snapshot.collectiveCursor;
    this.state.collectiveResponderId = snapshot.collectiveResponderId;
    this.state.roundDealerId = snapshot.roundDealerId;
  }

  createShuffledDeck(random?: () => number) {
    return this.rules.createShuffledDeck(random);
  }

  prepareNextRound(input: Parameters<RuleSet["prepareNextRound"]>[0]) {
    return this.rules.prepareNextRound(input);
  }

  settleRound<T extends Parameters<RuleSet["settleRound"]>[0][number]>(players: T[]): T[] {
    return this.rules.settleRound(players);
  }

  buildDefaultDeclarationPayload(hand: Parameters<RuleSet["buildDefaultDeclarationPayload"]>[0]) {
    return this.rules.buildDefaultDeclarationPayload(hand);
  }

  buildDeclarationSelection(
    hand: Parameters<RuleSet["buildDeclarationSelection"]>[0],
    payload: Parameters<RuleSet["buildDeclarationSelection"]>[1],
  ) {
    return this.rules.buildDeclarationSelection(hand, payload);
  }

  pickInitialDealer(playerOrder: string[], random?: () => number) {
    return this.rules.pickInitialDealer(playerOrder, random);
  }

  resolveDealer(playerOrder: string[], anchorSeatId: string, card: Parameters<RuleSet["resolveDealer"]>[2]) {
    return this.rules.resolveDealer(playerOrder, anchorSeatId, card);
  }

  getAvailableActions(input: Parameters<typeof getAvailableActionsFlow>[0]) {
    return getAvailableActionsFlow({ ...input, ruleSet: this.rules });
  }

  decideAction(input: Parameters<typeof decideActionDispatch>[0]) {
    return decideActionDispatch(input);
  }

  enterOwnerLocal(deps: Parameters<typeof enterOwnerLocalPhaseAfterNoResponseFlow>[0]) {
    return enterOwnerLocalPhaseAfterNoResponseFlow(deps);
  }

  executeEat(deps: Parameters<typeof executeEatFlow>[0], ownerId: string) {
    return executeEatFlow(deps, ownerId);
  }

  executeGrab(deps: Parameters<typeof executeGrabFlow>[0], ownerId: string) {
    return executeGrabFlow(deps, ownerId);
  }

  beginCollectiveFromDiscard<Pending>(
    deps: BeginCollectiveFromDiscardDeps<Pending>,
    ownerId: string,
    discard: Parameters<typeof beginCollectiveFromDiscardFlow>[2],
  ) {
    return beginCollectiveFromDiscardFlow(deps, ownerId, discard);
  }

  discardFromAndCollective(deps: Parameters<typeof discardFromAndCollectiveFlow>[0], ownerId: string) {
    return discardFromAndCollectiveFlow(deps, ownerId);
  }

  drawForOwner<Pending>(
    deps: DrawForOwnerDeps<Pending>,
    ownerId: string,
    tag: string,
  ) {
    return drawForOwnerFlow(deps, ownerId, tag);
  }

  enterDiscardStage<Pending>(deps: EnterDiscardStageDeps<Pending>, ownerId: string, tag: string) {
    return enterDiscardStageFlow(deps, ownerId, tag);
  }

  resolveCollective(deps: Parameters<typeof resolveCollectivePhaseFlow>[0]) {
    return resolveCollectivePhaseFlow({ ...deps, pickWinner: this.rules.pickCollectiveWinner });
  }

  resolveLocalDrawIdle(awaitingDiscard: boolean, pendingCard: Parameters<typeof resolveLocalDrawIdleAction>[1]) {
    return resolveLocalDrawIdleAction(awaitingDiscard, pendingCard);
  }

  planBots(input: Parameters<typeof planTickBots>[0]) {
    return planTickBots(input);
  }

  runBot(deps: Parameters<typeof runBotStep>[0]) {
    return runBotStep(deps);
  }

  startCollective(deps: Parameters<typeof startCollectiveFlow>[0]) {
    return startCollectiveFlow(deps);
  }

  advanceCollective(deps: Parameters<typeof advanceCollectiveFlow>[0]) {
    return advanceCollectiveFlow(deps);
  }

  executeResponseWinner(
    deps: Parameters<typeof executeResponseWinner>[0],
    pending: Parameters<typeof executeResponseWinner>[1],
    winnerId: string,
    choice: Parameters<typeof executeResponseWinner>[3],
  ) {
    return executeResponseWinner(deps, pending, winnerId, choice);
  }

  chooseBotAction(input: BotDecisionInput) {
    return chooseBotAction(input);
  }

  chooseBotDiscard(input: BotDiscardInput) {
    return chooseBotDiscard({ ...input, enforceDeclaredKans: this.rules.enforceDeclaredKans });
  }
}

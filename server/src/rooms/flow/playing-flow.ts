import { canChi, canKai, canPeng } from "../../rules/actions.js";
import { isDiscardRestricted, isGeneral, isGold } from "../../rules/deck.js";
import type { ActionType, Card } from "../../rules/types.js";
import {
  getCollectiveOrder,
  pickCollectiveWinner,
  resolveNextCollectiveResponder,
  planLocalPhaseAfterNoResponse,
  pickCollectiveBotAction,
  pickLocalBotAction,
} from "./support.js";

type SeatId = string;

export type ActionDecision =
  | "ignore"
  | "collective_accept"
  | "local_chi"
  | "local_pass_upper"
  | "local_pass_draw";

export interface ActionDispatchInput {
  pendingOwnerId: string;
  seatId: string;
  action: ActionType;
  enabledActions: ActionType[];
  responsePhase: "collective" | "local_upper" | "local_draw";
  collectiveResponderId: string | null;
  awaitingDiscardOwnerId: string | null;
}

export function decideActionDispatch(input: ActionDispatchInput): ActionDecision {
  if (!input.enabledActions.includes(input.action)) {
    return "ignore";
  }

  if (input.responsePhase === "collective") {
    return input.seatId === input.collectiveResponderId ? "collective_accept" : "ignore";
  }

  if (input.pendingOwnerId !== input.seatId) {
    return "ignore";
  }
  if (input.awaitingDiscardOwnerId === input.seatId) {
    return "ignore";
  }
  if (input.action === "chi") {
    return "local_chi";
  }
  if (input.action === "pass" && input.responsePhase === "local_upper") {
    return "local_pass_upper";
  }
  if (input.action === "pass" && input.responsePhase === "local_draw") {
    return "local_pass_draw";
  }
  return "ignore";
}

export interface PendingActionContext {
  ownerId: SeatId;
  card: Card;
}

export interface ActionPanelInput {
  phase: string;
  seatId: SeatId;
  pending: PendingActionContext | null;
  responsePhase: "collective" | "local_upper" | "local_draw";
  collectiveResponderId: SeatId | null;
  awaitingDiscardOwnerId: SeatId | null;
  hand: Card[];
  wildcardPool: Card[];
  explainHuForSeat: (seatId: SeatId, hand: Card[], responseCard: Card) => { valid: boolean };
  logHuCheck: (stage: string, seatId: SeatId, hand: Card[], response: Card, valid: boolean) => void;
  getHandWithoutPending: (seatId: SeatId, pendingCard: Card) => Card[];
}

export function getAvailableActionsFlow(input: ActionPanelInput): Array<{ action: ActionType; enabled: boolean }> {
  const disabled = [
    { action: "hu", enabled: false },
    { action: "kai", enabled: false },
    { action: "peng", enabled: false },
    { action: "chi", enabled: false },
    { action: "pass", enabled: false },
  ] satisfies Array<{ action: ActionType; enabled: boolean }>;

  if (input.phase === "declaring" || !input.pending) {
    return [];
  }

  const isOwner = input.pending.ownerId === input.seatId;
  const isCollective = input.responsePhase === "collective";

  if (isCollective) {
    if (input.seatId !== input.collectiveResponderId) {
      return disabled;
    }
    const huProbe = input.explainHuForSeat(input.seatId, input.hand, input.pending.card);
    input.logHuCheck("collective", input.seatId, input.hand, input.pending.card, huProbe.valid);
    return [
      { action: "hu", enabled: huProbe.valid },
      { action: "kai", enabled: canKai(input.hand, input.pending.card, input.wildcardPool) },
      { action: "peng", enabled: canPeng(input.hand, input.pending.card) },
      { action: "chi", enabled: false },
      { action: "pass", enabled: true },
    ];
  }

  if (!isOwner) {
    return disabled;
  }

  if (input.awaitingDiscardOwnerId === input.seatId) {
    return [];
  }

  if (input.responsePhase === "local_upper" || input.responsePhase === "local_draw") {
    const handNoPending = input.getHandWithoutPending(input.seatId, input.pending.card);
    return [
      { action: "hu", enabled: false },
      { action: "kai", enabled: false },
      { action: "peng", enabled: false },
      { action: "chi", enabled: canChi(handNoPending, input.pending.card, input.wildcardPool) },
      { action: "pass", enabled: true },
    ];
  }

  return disabled;
}

export interface PendingOwnerLocal {
  ownerId: SeatId;
  card: Card;
}

export interface EnterOwnerLocalDeps {
  pending: PendingOwnerLocal | null;
  ownerId: SeatId;
  getNextPlayerId: (playerId: SeatId) => SeatId;
  setPendingOwner: (ownerId: SeatId) => void;
  setResponsePhase: (phase: "local_upper" | "local_draw") => void;
  setCurrentPlayer: (ownerId: SeatId) => void;
  setCurrentTurnPlayer: (ownerId: SeatId) => void;
  setLoopStageLocal: () => void;
  clearActiveResponder: () => void;
  clearResponseEndsAt: () => void;
  addWildcardCardToPlayer: (ownerId: SeatId, card: Card, source: "draw") => void;
  setLastAction: (action: string) => void;
  enterDiscardStage: (ownerId: SeatId, tag: string) => void;
  syncAllPrivateHands: () => void;
  tickBots: () => void;
}

export function enterOwnerLocalPhaseAfterNoResponseFlow(deps: EnterOwnerLocalDeps): void {
  const pending = deps.pending;
  if (!pending || pending.ownerId !== deps.ownerId) {
    return;
  }
  const plan = planLocalPhaseAfterNoResponse(deps.ownerId, pending.card.source, deps.getNextPlayerId(deps.ownerId));
  if (plan.rebindPendingOwner) {
    deps.setPendingOwner(plan.localOwnerId);
  }
  deps.setResponsePhase(plan.responsePhase);
  deps.setCurrentPlayer(plan.localOwnerId);
  deps.setCurrentTurnPlayer(plan.localOwnerId);
  deps.setLoopStageLocal();
  deps.clearActiveResponder();
  deps.clearResponseEndsAt();

  if (plan.responsePhase === "local_draw" && (isGeneral(pending.card) || isGold(pending.card))) {
    deps.addWildcardCardToPlayer(plan.localOwnerId, pending.card, "draw");
    deps.setLastAction(`${plan.localOwnerId} FORCE_TAKE`);
    deps.enterDiscardStage(plan.localOwnerId, "FORCE_TAKE");
    return;
  }

  deps.syncAllPrivateHands();
  deps.tickBots();
}

interface PendingLike {
  ownerId: SeatId;
  card: Card;
}

export interface ExecuteEatDeps {
  pending: PendingLike | null;
  executeChiOperation: (ownerId: SeatId, pendingCard: Card) => boolean;
  setLastAction: (action: string) => void;
  finalizeWithDiscardFrom: (ownerId: SeatId) => void;
}

export function executeEatFlow(deps: ExecuteEatDeps, ownerId: SeatId): void {
  const pending = deps.pending;
  if (!pending) {
    return;
  }
  if (!deps.executeChiOperation(ownerId, pending.card)) {
    return;
  }
  deps.setLastAction(`${ownerId} CHI`);
  deps.finalizeWithDiscardFrom(ownerId);
}

export interface ExecuteGrabDeps {
  pending: PendingLike | null;
  deck: Card[];
  pushDiscard: (ownerId: SeatId, card: Card) => void;
  shouldEndDrawAfterUpperPass: (deckCount: number) => boolean;
  endRound: (lastAction: string) => void;
  setDeckCount: (deckCount: number) => void;
  addCardToHand: (ownerId: SeatId, card: Card) => void;
  setupCollectiveAfterGrab: (ownerId: SeatId, card: Card) => void;
  setLastAction: (action: string) => void;
  syncAllPrivateHands: () => void;
  startCollectivePolling: () => void;
}

export function executeGrabFlow(deps: ExecuteGrabDeps, ownerId: SeatId): void {
  const pending = deps.pending;
  if (!pending) {
    return;
  }
  deps.pushDiscard(ownerId, pending.card);

  if (deps.shouldEndDrawAfterUpperPass(deps.deck.length)) {
    deps.endRound("DRAW_GAME");
    return;
  }

  const newCard = deps.deck.shift();
  deps.setDeckCount(deps.deck.length);
  if (!newCard) {
    deps.endRound("DRAW_GAME");
    return;
  }

  deps.addCardToHand(ownerId, newCard);
  deps.setupCollectiveAfterGrab(ownerId, newCard);
  deps.setLastAction(`${ownerId} PASS`);
  deps.syncAllPrivateHands();
  deps.startCollectivePolling();
}

export interface ExecutePassToNextDeps {
  pending: PendingLike | null;
  pushDiscard: (ownerId: SeatId, card: Card) => void;
  setLastAction: (action: string) => void;
  advanceToNextOwner: (ownerId: SeatId, card: Card) => void;
}

export function executePassToNextFlow(deps: ExecutePassToNextDeps, ownerId: SeatId): void {
  const pending = deps.pending;
  if (!pending) {
    return;
  }
  deps.pushDiscard(ownerId, pending.card);
  deps.setLastAction(`${ownerId} PASS`);
  deps.advanceToNextOwner(ownerId, pending.card);
}

export interface FinalizeWithDiscardDeps {
  pickDiscardCard: (ownerId: SeatId) => Card | null;
  pushDiscard: (ownerId: SeatId, card: Card) => void;
  advanceToNextOwner: (ownerId: SeatId, card: Card) => void;
  endRound: (lastAction: string) => void;
}

export function finalizeWithDiscardFlow(deps: FinalizeWithDiscardDeps, ownerId: SeatId): void {
  const discard = deps.pickDiscardCard(ownerId);
  if (!discard) {
    deps.endRound(`${ownerId} NO_DISCARD`);
    return;
  }
  deps.pushDiscard(ownerId, discard);
  deps.advanceToNextOwner(ownerId, discard);
}

export interface PendingFactory {
  ownerId: SeatId;
  card: Card;
  source: "upper" | "draw";
}

export interface DrawForOwnerDeps<Pending> {
  phase: string;
  deck: Card[];
  setDeckCount: (count: number) => void;
  endRound: (lastAction: string) => void;
  createPendingResponse: (input: PendingFactory) => Pending;
  setPendingResponse: (pending: Pending) => void;
  clearAwaitingDiscardOwner: () => void;
  setResponseCard: (card: Card, source: "draw") => void;
  applyCollectivePollState: (ownerId: SeatId, previousPlayerId: SeatId, pollOriginPlayerId: SeatId, lastAction: string) => void;
  getPreviousPlayerId: (ownerId: SeatId) => SeatId;
  syncAllPrivateHands: () => void;
  startCollectivePolling: () => void;
}

export function drawForOwnerFlow<Pending>(deps: DrawForOwnerDeps<Pending>, ownerId: SeatId, tag: string): void {
  if (deps.phase !== "playing") {
    return;
  }

  const drawn = deps.deck.shift();
  deps.setDeckCount(deps.deck.length);
  if (!drawn) {
    deps.endRound("DRAW_GAME");
    return;
  }

  deps.setPendingResponse(
    deps.createPendingResponse({
      ownerId,
      card: drawn,
      source: "draw",
    }),
  );
  deps.clearAwaitingDiscardOwner();
  deps.setResponseCard(drawn, "draw");
  deps.applyCollectivePollState(ownerId, deps.getPreviousPlayerId(ownerId), ownerId, `${ownerId} ${tag}`);
  deps.syncAllPrivateHands();
  deps.startCollectivePolling();
}

export interface BeginCollectiveFromDiscardDeps<Pending> {
  createPendingResponse: (input: PendingFactory) => Pending;
  setPendingResponse: (pending: Pending) => void;
  clearAwaitingDiscardOwner: () => void;
  setResponseCard: (card: Card, source: "upper") => void;
  applyCollectivePollState: (ownerId: SeatId, previousPlayerId: SeatId, pollOriginPlayerId: SeatId, lastAction: string) => void;
  syncAllPrivateHands: () => void;
  startCollectivePolling: () => void;
}

export function beginCollectiveFromDiscardFlow<Pending>(
  deps: BeginCollectiveFromDiscardDeps<Pending>,
  ownerId: SeatId,
  discard: Card,
): void {
  deps.setPendingResponse(
    deps.createPendingResponse({
      ownerId,
      card: discard,
      source: "upper",
    }),
  );
  deps.clearAwaitingDiscardOwner();
  deps.setResponseCard(discard, "upper");
  deps.applyCollectivePollState(ownerId, ownerId, ownerId, `${ownerId} DISCARD`);
  deps.syncAllPrivateHands();
  deps.startCollectivePolling();
}

export interface EnterDiscardStageDeps<Pending> {
  playerHand: Card[];
  endRound: (lastAction: string) => void;
  createPendingResponse: (input: PendingFactory) => Pending;
  setPendingResponse: (pending: Pending) => void;
  setAwaitingDiscardOwner: (ownerId: SeatId) => void;
  resetCollectivePolling: () => void;
  applyEnterDiscardStageState: (ownerId: SeatId, tag: string) => void;
  clearResponseCard: () => void;
  syncAllPrivateHands: () => void;
  tickBots: () => void;
}

export function enterDiscardStageFlow<Pending>(deps: EnterDiscardStageDeps<Pending>, ownerId: SeatId, tag: string): void {
  const fallback = deps.playerHand.find((card) => !isDiscardRestricted(card)) ?? null;
  if (!fallback) {
    deps.endRound(`${ownerId} NO_DISCARD`);
    return;
  }

  deps.setPendingResponse(
    deps.createPendingResponse({
      ownerId,
      card: fallback,
      source: "draw",
    }),
  );
  deps.setAwaitingDiscardOwner(ownerId);
  deps.resetCollectivePolling();
  deps.applyEnterDiscardStageState(ownerId, tag);
  deps.clearResponseCard();
  deps.syncAllPrivateHands();
  deps.tickBots();
}

export interface DiscardFromAndCollectiveDeps {
  pickDiscardCard: (ownerId: SeatId) => Card | null;
  pushDiscard: (ownerId: SeatId, card: Card) => void;
  beginCollectiveFromDiscard: (ownerId: SeatId, discard: Card) => void;
  clearAwaitingDiscardOwner: () => void;
  endRound: (lastAction: string) => void;
}

export function discardFromAndCollectiveFlow(deps: DiscardFromAndCollectiveDeps, ownerId: SeatId): void {
  deps.clearAwaitingDiscardOwner();
  const discard = deps.pickDiscardCard(ownerId);
  if (!discard) {
    deps.endRound(`${ownerId} NO_DISCARD`);
    return;
  }
  deps.pushDiscard(ownerId, discard);
  deps.beginCollectiveFromDiscard(ownerId, discard);
}

export interface AdvanceToNextOwnerDeps<Pending> {
  getNextPlayerId: (ownerId: SeatId) => SeatId;
  createPendingResponse: (input: PendingFactory) => Pending;
  setPendingResponse: (pending: Pending) => void;
  setCurrentPlayer: (ownerId: SeatId) => void;
  setResponsePhaseCollective: () => void;
  setResponseCard: (card: Card, source: "upper") => void;
  setCurrentTurnPlayer: (ownerId: SeatId) => void;
  setPreviousPlayer: (ownerId: SeatId) => void;
  setLoopStageGlobal: () => void;
  clearActiveResponder: () => void;
  clearResponseEndsAt: () => void;
  setPollOriginPlayer: (ownerId: SeatId) => void;
  syncAllPrivateHands: () => void;
  startCollectivePolling: () => void;
}

export function advanceToNextOwnerFlow<Pending>(
  deps: AdvanceToNextOwnerDeps<Pending>,
  currentOwnerId: SeatId,
  cardToNext: Card,
): void {
  const nextId = deps.getNextPlayerId(currentOwnerId);
  deps.setPendingResponse(
    deps.createPendingResponse({
      ownerId: nextId,
      card: cardToNext,
      source: "upper",
    }),
  );
  deps.setCurrentPlayer(nextId);
  deps.setResponsePhaseCollective();
  deps.setResponseCard(cardToNext, "upper");
  deps.setCurrentTurnPlayer(nextId);
  deps.setPreviousPlayer(currentOwnerId);
  deps.setLoopStageGlobal();
  deps.clearActiveResponder();
  deps.setPollOriginPlayer(currentOwnerId);
  deps.clearResponseEndsAt();
  deps.syncAllPrivateHands();
  deps.startCollectivePolling();
}

interface PendingCollective {
  ownerId: SeatId;
  card: Card;
  collectives: Map<SeatId, ActionType>;
}

export interface ResolveCollectiveDeps {
  pending: PendingCollective | null;
  playerOrder: SeatId[];
  executeResponseWinner: (winnerId: SeatId, action: ActionType) => void;
  setLastAction: (action: string) => void;
  enterOwnerLocalPhaseAfterNoResponse: (ownerId: SeatId) => void;
}

export function resolveCollectivePhaseFlow(deps: ResolveCollectiveDeps): void {
  const pending = deps.pending;
  if (!pending) {
    return;
  }
  const order = getCollectiveOrder(deps.playerOrder, pending);
  const winner = pickCollectiveWinner(order, pending.collectives);
  if (winner) {
    deps.executeResponseWinner(winner.id, winner.action);
    return;
  }
  deps.setLastAction("NO_RESPONSE");
  deps.enterOwnerLocalPhaseAfterNoResponse(pending.ownerId);
}

export type TickBotPlan =
  | "clear_and_broadcast"
  | "start_collective"
  | "schedule_bot_collective"
  | "schedule_collective_timeout"
  | "schedule_bot_owner"
  | "broadcast_only";

export interface TickBotInput {
  hasPending: boolean;
  phase: string;
  responsePhase: "collective" | "local_upper" | "local_draw";
  collectiveResponderId: string | null;
  pendingOwnerId: string;
  hasCollectiveTimer: boolean;
  isBot: (seatId: string) => boolean;
}

export function planTickBots(input: TickBotInput): TickBotPlan {
  if (!input.hasPending || input.phase !== "playing") {
    return "clear_and_broadcast";
  }

  if (input.responsePhase === "collective") {
    if (!input.collectiveResponderId) {
      return "start_collective";
    }
    if (input.isBot(input.collectiveResponderId)) {
      return "schedule_bot_collective";
    }
    if (!input.hasCollectiveTimer) {
      return "schedule_collective_timeout";
    }
    return "broadcast_only";
  }

  if (input.isBot(input.pendingOwnerId)) {
    return "schedule_bot_owner";
  }

  return "broadcast_only";
}

export interface BotRunnerDeps {
  phase: string;
  responsePhase: "collective" | "local_upper" | "local_draw";
  pendingOwnerId: string;
  pendingCard: Card;
  collectiveResponderId: string | null;
  isBot: (seatId: string) => boolean;
  awaitingDiscardOwnerId: string | null;
  getAvailableActions: (seatId: string) => Array<{ action: ActionType; enabled: boolean }>;
  setCollectiveChoice: (seatId: string, action: ActionType) => void;
  advanceCollectivePolling: () => void;
  broadcastAvailableActions: () => void;
  discardFromAndCollective: (ownerId: string) => void;
  getHand: (seatId: string) => Card[];
  getWildcardPoolCards: (seatId: string) => Card[];
  executeEat: (ownerId: string) => void;
  executeGrab: (ownerId: string) => void;
  executePassToNext: (ownerId: string) => void;
}

export function runBotStep(deps: BotRunnerDeps): void {
  if (deps.phase !== "playing") {
    deps.broadcastAvailableActions();
    return;
  }

  if (deps.responsePhase === "collective") {
    const responderId = deps.collectiveResponderId;
    if (!responderId || !deps.isBot(responderId)) {
      deps.broadcastAvailableActions();
      return;
    }
    const choose = pickCollectiveBotAction(deps.getAvailableActions(responderId));
    deps.setCollectiveChoice(responderId, choose);
    deps.advanceCollectivePolling();
    return;
  }

  const ownerId = deps.pendingOwnerId;
  if (!deps.isBot(ownerId)) {
    deps.broadcastAvailableActions();
    return;
  }

  if (deps.awaitingDiscardOwnerId === ownerId) {
    deps.discardFromAndCollective(ownerId);
    return;
  }

  if (deps.responsePhase === "local_upper") {
    const hand = deps.getHand(ownerId);
    const action = pickLocalBotAction("local_upper", canChi(hand, deps.pendingCard, deps.getWildcardPoolCards(ownerId)));
    if (action === "chi") {
      deps.executeEat(ownerId);
    } else {
      deps.executeGrab(ownerId);
    }
    return;
  }

  if (deps.responsePhase === "local_draw") {
    const hand = deps.getHand(ownerId);
    const action = pickLocalBotAction("local_draw", canChi(hand, deps.pendingCard, deps.getWildcardPoolCards(ownerId)));
    if (action === "chi") {
      deps.executeEat(ownerId);
    } else {
      deps.executePassToNext(ownerId);
    }
    return;
  }

  deps.broadcastAvailableActions();
}

export interface PendingCollectiveRuntime {
  ownerId: SeatId;
  card: Card;
  collectives: Map<SeatId, ActionType>;
}

export interface StartCollectiveDeps {
  pending: PendingCollectiveRuntime | null;
  responsePhase: "collective" | "local_upper" | "local_draw";
  pollOriginPlayerId: string;
  setLoopStageGlobal: () => void;
  setPollOriginPlayerId: (id: string) => void;
  clearBotTimer: () => void;
  clearCollectiveTimer: () => void;
  setQueue: (queue: SeatId[]) => void;
  getOrder: (pending: PendingCollectiveRuntime) => SeatId[];
  resetCursorAndResponder: () => void;
  advance: () => void;
  resetAndBroadcast: () => void;
}

export function startCollectiveFlow(deps: StartCollectiveDeps): void {
  if (!deps.pending || deps.responsePhase !== "collective") {
    deps.resetAndBroadcast();
    return;
  }
  deps.setLoopStageGlobal();
  if (!deps.pollOriginPlayerId) {
    deps.setPollOriginPlayerId(deps.pending.ownerId);
  }
  deps.clearBotTimer();
  deps.clearCollectiveTimer();
  deps.setQueue(deps.getOrder(deps.pending));
  deps.resetCursorAndResponder();
  deps.advance();
}

export interface AdvanceCollectiveDeps {
  pending: PendingCollectiveRuntime | null;
  hasResponded: (seatId: SeatId) => boolean;
  responsePhase: "collective" | "local_upper" | "local_draw";
  clearBotTimer: () => void;
  clearCollectiveTimer: () => void;
  queue: SeatId[];
  cursor: number;
  hasActionBeyondPass: (seatId: SeatId) => boolean;
  setCollectivePass: (seatId: SeatId) => void;
  setCursor: (cursor: number) => void;
  setResponder: (responderId: SeatId | null) => void;
  setActiveResponder: (responderId: SeatId | "") => void;
  setCurrentPlayer: (seatId: SeatId) => void;
  setCurrentTurnPlayer: (seatId: SeatId) => void;
  isBot: (seatId: SeatId) => boolean;
  scheduleBotStep: () => void;
  scheduleCollectiveTimeout: () => void;
  broadcastAvailableActions: () => void;
  clearResponseEndsAt: () => void;
  resolveCollectivePhase: () => void;
  resetAndBroadcast: () => void;
}

export function advanceCollectiveFlow(deps: AdvanceCollectiveDeps): void {
  if (!deps.pending || deps.responsePhase !== "collective") {
    deps.resetAndBroadcast();
    return;
  }

  deps.clearBotTimer();
  deps.clearCollectiveTimer();

  const next = resolveNextCollectiveResponder({
    queue: deps.queue,
    cursor: deps.cursor,
    hasResponded: (seatId) => deps.hasResponded(seatId),
    hasActionBeyondPass: (seatId) => deps.hasActionBeyondPass(seatId),
  });
  for (const seatId of next.forcedPassIds) {
    deps.setCollectivePass(seatId);
  }

  if (next.responderId) {
    deps.setCursor(next.nextCursor);
    deps.setResponder(next.responderId);
    deps.setCurrentPlayer(next.responderId);
    deps.setCurrentTurnPlayer(next.responderId);
    deps.setActiveResponder(next.responderId);
    if (deps.isBot(next.responderId)) {
      deps.scheduleBotStep();
    } else {
      deps.scheduleCollectiveTimeout();
    }
    deps.broadcastAvailableActions();
    return;
  }

  deps.setCursor(next.nextCursor);
  deps.setResponder(null);
  deps.setActiveResponder("");
  deps.clearResponseEndsAt();
  deps.resolveCollectivePhase();
}

import { isDiscardRestricted, isGeneral, isGold } from "../../rules/deck.js";
import type { ActionType, Card } from "../../rules/types.js";
import { buildChiCandidates, buildKaiCandidates, buildPengCandidates, type ActionCandidate } from "./action-candidates.js";
import {
  getCollectiveOrder,
  pickCollectiveWinner,
  resolveNextCollectiveResponder,
  planLocalPhaseAfterNoResponse,
  pickCollectiveBotAction,
  pickLocalBotAction,
} from "./support.js";

type SeatId = string;

/**
 * 对局主循环层：负责 collective/local 双阶段推进、动作分发、机器人步进与轮询驱动。
 * 关键输入/输出：输入运行时依赖与当前上下文，输出调度决策或状态推进。
 * 副作用：通过 deps 回调写入房间状态、触发广播/计时器/阶段切换。
 */

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

/**
 * 作用：将客户端动作映射为主循环可执行的分发决策。
 * 关键输入/输出：输入动作上下文，输出 `collective/local/ignore` 决策。
 * 副作用：无。
 */
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
  responsePhaseAfterNoResponse?: "local_upper" | "local_draw";
}

export interface ActionPanelInput {
  phase: string;
  seatId: SeatId;
  pending: PendingActionContext | null;
  responsePhase: "collective" | "local_upper" | "local_draw";
  collectiveResponderId: SeatId | null;
  probeCollectiveResponder?: boolean;
  awaitingDiscardOwnerId: SeatId | null;
  hand: Card[];
  wildcardPool: Card[];
  explainHuForSeat: (seatId: SeatId, hand: Card[], responseCard: Card) => { valid: boolean };
  logHuCheck: (stage: string, seatId: SeatId, hand: Card[], response: Card, valid: boolean) => void;
  getHandWithoutPending: (seatId: SeatId, pendingCard: Card) => Card[];
  getNextPlayerId: (seatId: SeatId) => SeatId;
}

export interface AvailableActionEntry {
  action: ActionType;
  enabled: boolean;
  candidates?: ActionCandidate[];
  deferred?: boolean;
}

/**
 * 作用：计算指定座位在当前时刻的可执行动作面板。
 * 关键输入/输出：输入阶段、pending 与手牌信息，输出动作启用列表。
 * 副作用：无（仅调用日志探针回调）。
 */
export function getAvailableActionsFlow(input: ActionPanelInput): AvailableActionEntry[] {
  const disabled = [
    { action: "hu", enabled: false },
    { action: "kai", enabled: false },
    { action: "peng", enabled: false },
    { action: "chi", enabled: false },
    { action: "pass", enabled: false },
  ] satisfies AvailableActionEntry[];

  if (input.phase === "declaring" || !input.pending) {
    return [];
  }

  const isOwner = input.pending.ownerId === input.seatId;
  const isCollective = input.responsePhase === "collective";

  if (isCollective) {
    if (!input.probeCollectiveResponder && input.seatId !== input.collectiveResponderId) {
      return disabled;
    }
    const huProbe = input.explainHuForSeat(input.seatId, input.hand, input.pending.card);
    input.logHuCheck("collective", input.seatId, input.hand, input.pending.card, huProbe.valid);
    const kaiCandidates = buildKaiCandidates(input.hand, input.pending.card, []).map((item) => item.candidate);
    const pengCandidates = buildPengCandidates(input.hand, input.pending.card).map(
      (item) => item.candidate,
    );
    const localOwnerId =
      input.pending.card.source === "draw" ? input.pending.ownerId : input.getNextPlayerId(input.pending.ownerId);
    const localResponsePhase =
      input.pending.responsePhaseAfterNoResponse ?? (input.pending.card.source === "draw" ? "local_draw" : "local_upper");
    const previewChiCandidates =
      input.seatId === localOwnerId
        ? buildChiCandidates(input.getHandWithoutPending(input.seatId, input.pending.card), input.pending.card, []).map(
            (item) => item.candidate,
          )
        : [];
    return [
      { action: "hu", enabled: huProbe.valid },
      { action: "kai", enabled: kaiCandidates.length > 0, candidates: kaiCandidates },
      { action: "peng", enabled: pengCandidates.length > 0, candidates: pengCandidates },
      {
        action: "chi",
        enabled: false,
        candidates: previewChiCandidates,
        deferred: previewChiCandidates.length > 0,
      },
      { action: "pass", enabled: true, deferred: localResponsePhase === "local_upper" && input.seatId === localOwnerId },
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
    const chiCandidates = buildChiCandidates(handNoPending, input.pending.card, []).map(
      (item) => item.candidate,
    );
    return [
      { action: "hu", enabled: false },
      { action: "kai", enabled: false },
      { action: "peng", enabled: false },
      { action: "chi", enabled: chiCandidates.length > 0, candidates: chiCandidates },
      { action: "pass", enabled: true },
    ];
  }

  return disabled;
}

export interface PendingOwnerLocal {
  ownerId: SeatId;
  card: Card;
  responsePhaseAfterNoResponse?: "local_upper" | "local_draw";
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

/**
 * 作用：collective 无人响应后，进入牌主本地阶段（吃/过）。
 * 关键输入/输出：输入 pending 与状态写入依赖，输出无返回值。
 * 副作用：切换 `responsePhase/currentPlayer/loopStage`，必要时触发强制收牌并进入弃牌。
 */
export function enterOwnerLocalPhaseAfterNoResponseFlow(deps: EnterOwnerLocalDeps): void {
  const pending = deps.pending;
  if (!pending || pending.ownerId !== deps.ownerId) {
    return;
  }
  const plan = planLocalPhaseAfterNoResponse(
    deps.ownerId,
    pending.card.source,
    deps.getNextPlayerId(deps.ownerId),
    pending.responsePhaseAfterNoResponse,
  );
  // 设计原因：只有“上家来牌无人响应”才要把 pending.owner 重绑到下家；
  // 若来源是 draw，则 owner 仍是原摸牌者，不应重绑。
  if (plan.rebindPendingOwner) {
    deps.setPendingOwner(plan.localOwnerId);
  }
  deps.setResponsePhase(plan.responsePhase);
  deps.setCurrentPlayer(plan.localOwnerId);
  deps.setCurrentTurnPlayer(plan.localOwnerId);
  deps.setLoopStageLocal();
  deps.clearActiveResponder();
  deps.clearResponseEndsAt();

  if (pending.card.source === "draw" && plan.responsePhase === "local_draw" && (isGeneral(pending.card) || isGold(pending.card))) {
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
  enterDiscardStage: (ownerId: SeatId, tag: string) => void;
}

/**
 * 作用：执行本地吃动作并进入弃牌收尾。
 * 关键输入/输出：输入 pending 与吃牌执行器，输出无返回值。
 * 副作用：更新 lastAction，并触发后续弃牌推进。
 */
export function executeEatFlow(deps: ExecuteEatDeps, ownerId: SeatId): boolean {
  const pending = deps.pending;
  if (!pending) {
    return false;
  }
  if (!deps.executeChiOperation(ownerId, pending.card)) {
    return false;
  }
  deps.setLastAction(`${ownerId} CHI`);
  deps.enterDiscardStage(ownerId, "CHI");
  return true;
}

export interface ExecuteGrabDeps {
  pending: PendingLike | null;
  deck: Card[];
  shouldEndDrawAfterUpperPass: (deckCount: number) => boolean;
  endRound: (lastAction: string) => void;
  setDeckCount: (deckCount: number) => void;
  setupCollectiveAfterGrab: (ownerId: SeatId, card: Card) => void;
  setLastAction: (action: string) => void;
  syncAllPrivateHands: () => void;
  startCollectivePolling: () => void;
}

/**
 * 作用：执行 local_upper 下的 pass（抓牌）路径。
 * 关键输入/输出：输入 pending、牌堆与状态写入依赖，输出无返回值。
 * 副作用：可能入弃牌、发起新 collective，或直接流局。
 */
export function executeGrabFlow(deps: ExecuteGrabDeps, ownerId: SeatId): void {
  const pending = deps.pending;
  if (!pending) {
    return;
  }
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

  deps.setupCollectiveAfterGrab(ownerId, newCard);
  deps.setLastAction(`${ownerId} ZHUA`);
  deps.syncAllPrivateHands();
  deps.startCollectivePolling();
}

export interface ExecutePassToNextDeps {
  pending: PendingLike | null;
  pushDiscard: (ownerId: SeatId, card: Card) => void;
  setLastAction: (action: string) => void;
  advanceToNextOwner: (ownerId: SeatId, card: Card) => void;
}

/**
 * 作用：执行 local_draw 下的 pass_to_next 路径。
 * 关键输入/输出：输入 pending 与推进依赖，输出无返回值。
 * 副作用：将当前响应牌入弃牌并推进到下家。
 */
export function executePassToNextFlow(deps: ExecutePassToNextDeps, ownerId: SeatId): void {
  const pending = deps.pending;
  if (!pending) {
    return;
  }
  deps.pushDiscard(ownerId, pending.card);
  deps.setLastAction(`${ownerId} PASS`);
  deps.advanceToNextOwner(ownerId, pending.card);
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

/**
 * 作用：执行标准摸牌并进入 collective 响应。
 * 关键输入/输出：输入牌堆和 pending/state 写入依赖，输出无返回值。
 * 副作用：消费 deck，更新 pending/responseCard，并启动 collective 轮询。
 */
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

/**
 * 作用：玩家弃牌后建立 collective 响应上下文并启动轮询。
 * 关键输入/输出：输入弃牌与状态写入依赖，输出无返回值。
 * 副作用：重建 pending/responseCard 并启动 collective。
 */
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
  declareNoDiscardWin: (ownerId: SeatId, tag: string) => void;
  createPendingResponse: (input: PendingFactory) => Pending;
  setPendingResponse: (pending: Pending) => void;
  setAwaitingDiscardOwner: (ownerId: SeatId) => void;
  resetCollectivePolling: () => void;
  applyEnterDiscardStageState: (ownerId: SeatId, tag: string) => void;
  clearResponseCard: () => void;
  syncAllPrivateHands: () => void;
  tickBots: () => void;
}

/**
 * 作用：进入“待玩家手动弃牌”阶段并设置后备可弃牌。
 * 关键输入/输出：输入手牌与状态写入依赖，输出无返回值。
 * 副作用：重置轮询游标、设置 awaitingDiscardOwner，并刷新前端私有手牌。
 */
export function enterDiscardStageFlow<Pending>(deps: EnterDiscardStageDeps<Pending>, ownerId: SeatId, tag: string): void {
  const fallback = deps.playerHand.find((card) => !isDiscardRestricted(card)) ?? null;
  if (!fallback) {
    deps.declareNoDiscardWin(ownerId, tag);
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
  declareNoDiscardWin: (ownerId: SeatId, tag: string) => void;
}

/**
 * 作用：自动从牌主手牌打出一张并进入 collective。
 * 关键输入/输出：输入弃牌选择与 collective 入口依赖，输出无返回值。
 * 副作用：清理 awaitingDiscardOwner，写入弃牌并重建 pending。
 */
export function discardFromAndCollectiveFlow(deps: DiscardFromAndCollectiveDeps, ownerId: SeatId): void {
  deps.clearAwaitingDiscardOwner();
  const discard = deps.pickDiscardCard(ownerId);
  if (!discard) {
    deps.declareNoDiscardWin(ownerId, "AUTO_DISCARD");
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

/**
 * 作用：将当前响应牌视作当前牌主打给下家，进入新的 collective 轮询。
 * 关键输入/输出：输入当前牌主与牌，输出无返回值。
 * 副作用：保留出牌者为 pending.owner，更新当前行动位到下家并启动轮询。
 */
export function advanceToNextOwnerFlow<Pending>(
  deps: AdvanceToNextOwnerDeps<Pending>,
  currentOwnerId: SeatId,
  cardToNext: Card,
): void {
  const nextId = deps.getNextPlayerId(currentOwnerId);
  deps.setPendingResponse(
    deps.createPendingResponse({
      ownerId: currentOwnerId,
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
  collectives: Map<SeatId, { action: ActionType; candidateId?: string }>;
}

export interface ResolveCollectiveDeps {
  pending: PendingCollective | null;
  playerOrder: SeatId[];
  executeResponseWinner: (winnerId: SeatId, choice: { action: ActionType; candidateId?: string }) => void;
  setLastAction: (action: string) => void;
  enterOwnerLocalPhaseAfterNoResponse: (ownerId: SeatId) => void;
}

/**
 * 作用：collective 轮询结束后统一决议（优先胜者或无人响应）。
 * 关键输入/输出：输入 pending 与执行回调，输出无返回值。
 * 副作用：触发胜者动作或进入无响应本地阶段。
 */
export function resolveCollectivePhaseFlow(deps: ResolveCollectiveDeps): void {
  const pending = deps.pending;
  if (!pending) {
    return;
  }
  const order = getCollectiveOrder(deps.playerOrder, pending);
  const winner = pickCollectiveWinner(order, pending.collectives);
  if (winner) {
    deps.executeResponseWinner(winner.id, winner.choice);
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

/**
 * 作用：根据当前阶段计算机器人调度计划。
 * 关键输入/输出：输入是否有 pending、响应相位与 bot 身份，输出调度计划。
 * 副作用：无。
 */
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

  if (!input.hasCollectiveTimer) {
    return "schedule_collective_timeout";
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
  getAvailableActions: (seatId: string) => AvailableActionEntry[];
  setCollectiveChoice: (seatId: string, choice: { action: ActionType; candidateId?: string }) => void;
  advanceCollectivePolling: () => void;
  broadcastAvailableActions: () => void;
  discardFromAndCollective: (ownerId: string) => void;
  executeEat: (ownerId: string, candidateId?: string) => boolean;
  executeGrab: (ownerId: string) => void;
  executePassToNext: (ownerId: string) => void;
}

/**
 * 作用：立即执行一次机器人动作步进。
 * 关键输入/输出：输入当前相位与读写依赖，输出无返回值。
 * 副作用：可能写入 collective 选择、推进轮询或执行本地动作。
 */
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
    const actions = deps.getAvailableActions(responderId);
    const choose = pickCollectiveBotAction(actions);
    const candidateId = actions.find((item) => item.action === choose)?.candidates?.[0]?.id;
    deps.setCollectiveChoice(responderId, { action: choose, candidateId });
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
    const actions = deps.getAvailableActions(ownerId);
    const chiEntry = actions.find((item) => item.action === "chi");
    const action = pickLocalBotAction("local_upper", Boolean(chiEntry?.enabled));
    if (action === "chi") {
      if (!deps.executeEat(ownerId, chiEntry?.candidates?.[0]?.id)) {
        deps.executeGrab(ownerId);
      }
    } else {
      deps.executeGrab(ownerId);
    }
    return;
  }

  if (deps.responsePhase === "local_draw") {
    const actions = deps.getAvailableActions(ownerId);
    const chiEntry = actions.find((item) => item.action === "chi");
    const action = pickLocalBotAction("local_draw", Boolean(chiEntry?.enabled));
    if (action === "chi") {
      if (!deps.executeEat(ownerId, chiEntry?.candidates?.[0]?.id)) {
        deps.executePassToNext(ownerId);
      }
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
  collectives: Map<SeatId, { action: ActionType; candidateId?: string }>;
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

/**
 * 作用：启动一次 collective 轮询流程。
 * 关键输入/输出：输入 pending 与轮询控制依赖，输出无返回值。
 * 副作用：重置轮询指针、刷新队列并进入 `advance`。
 */
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

/**
 * 作用：推进 collective 轮询游标，直到找到下一位响应者或完成决议。
 * 关键输入/输出：输入轮询队列与读写依赖，输出无返回值。
 * 副作用：更新 responder/cursor/currentPlayer，并调度超时或 bot。
 */
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

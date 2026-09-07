import { CardSchema, GameState } from "../../schema/game-state.schema.js";
import type { Card } from "../../rules/types.js";
import { createPendingResponse, type PendingResponseSnapshot } from "./support.js";

export interface DebugScenarioContext {
  state: GameState;
  playerHands: Map<string, Card[]>;
  playerOrder: string[];
  publicGeneralPool: Card[];
  nextDebugSeq: () => number;
  getNextPlayerId: (playerId: string) => string;
  setPendingResponse: (value: PendingResponseSnapshot | null) => void;
  getPendingResponse: () => PendingResponseSnapshot | null;
  toSchemaCard: (card: Card, isResponseCard: boolean, source: "upper" | "draw") => CardSchema;
  setDealerCard: (card: Card) => void;
  setResponseCard: (card: Card, source: "upper" | "draw") => void;
  clearAwaitingDiscardOwner: () => void;
  updatePublicHandCounts: () => void;
  syncAllPrivateHands: () => void;
  resetCollectivePolling: () => void;
  broadcastAvailableActions: () => void;
  startCollectivePolling: () => void;
  tickBots: () => void;
  setCollectiveResponseWindowMs: (delayMs: number) => void;
  endRound: (lastAction: string, winnerId: string, groups: string[]) => void;
}

/**
 * 作用：注入预设调试牌局场景，快速验证主循环与动作流程。
 * 关键输入/输出：输入座位与场景名，输出是否应用成功。
 * 副作用：覆盖指定玩家手牌、pending/responsePhase/lastAction，并触发轮询或 bot 步进。
 */
export function applyDebugScenario(context: DebugScenarioContext, seatId: string, scenario: string): boolean {
  const player = context.state.players.get(seatId);
  if (!player) {
    return false;
  }

  // 调试场景会替换手牌，随机开局产生的声明不能继续约束新候选。
  context.clearAwaitingDiscardOwner();
  context.resetCollectivePolling();
  player.declaredKongs = 0;
  const hand = context.playerHands.get(seatId) ?? [];
  hand.length = 0;
  const add = (id: string, color: Card["color"], type: Card["type"]) => hand.push({ id, color, type });
  const seq = context.nextDebugSeq();
  const alignCollectivePublicTurn = () => {
    const pending = context.getPendingResponse();
    if (!pending || context.state.responsePhase !== "collective") return;
    // 调试场景也必须遵守生产语义：公开箭头只指向下一接牌者，不能泄露内部响应游标。
    const receiverId = pending.card.source === "draw"
      ? pending.ownerId
      : context.getNextPlayerId(pending.ownerId);
    context.state.currentPlayerId = receiverId;
    context.state.currentTurnPlayerId = receiverId;
    context.state.pendingReceiverId = receiverId;
    context.state.activeResponderId = "";
  };

  if (scenario === "staged_declaration") {
    for (const id of context.playerOrder) {
      const seat = context.state.players.get(id)!;
      seat.declaredKongs = 0;
      seat.declaredReady = id !== seatId;
      seat.declarationStep = id === seatId ? "fish" : "done";
      seat.pendingFishGroupSizes.clear();
      seat.fishArea.clear();
    }
    add("fish-red-ju-1", "red", "ju");
    add("fish-red-ju-2", "red", "ju");
    add("fish-red-ju-3", "red", "ju");
    add("fish-red-ju-4", "red", "ju");
    add("kong-green-ma-1", "green", "ma");
    add("kong-green-ma-2", "green", "ma");
    add("kong-green-ma-3", "green", "ma");
    add("spare-white-shi", "white", "shi");
    add("spare-white-jiang", "white", "jiang");
    add("spare-white-xiang", "white", "xiang");
    add("spare-white-ju", "white", "ju");
    add("spare-white-ma", "white", "ma");
    add("spare-white-pao", "white", "pao");
    add("spare-white-zu", "white", "zu");
    add("spare-yellow-jiang", "yellow", "jiang");
    add("spare-yellow-xiang", "yellow", "xiang");
    add("spare-yellow-ju", "yellow", "ju");
    add("spare-yellow-ma", "yellow", "ma");
    add("spare-yellow-pao", "yellow", "pao");
    add("spare-yellow-zu", "yellow", "zu");
    context.setPendingResponse(null);
    context.state.phase = "declaring";
    context.state.responsePhase = "collective";
    context.state.responseCard = new CardSchema();
    context.state.activeResponderId = "";
    context.state.pendingReceiverId = "";
    context.state.responseEndsAt = 0;
    context.state.declareEndsAt = 0;
    context.state.lastAction = `DEBUG: staged_declaration#${seq}`;
    context.playerHands.set(seatId, hand);
    context.updatePublicHandCounts();
    context.syncAllPrivateHands();
    context.broadcastAvailableActions();
    return true;
  } else if (scenario === "draw_choice" || scenario === "draw_gold_settlement" || scenario === "draw_peng_settlement") {
    context.state.publicDiscardPile.clear();
    for (const id of context.playerOrder) {
      const seat = context.state.players.get(id)!;
      seat.declaredKongs = 0;
      seat.exposedArea.clear(); seat.exposedGroupSizes.clear(); seat.exposedGroupKinds.clear();
      seat.generalArea.clear(); seat.fishArea.clear(); seat.discardPile.clear();
      if (id !== seatId) context.playerHands.set(id, [{ id: `other-${id}-${seq}`, color: "white", type: "shi" }]);
    }
    if (scenario === "draw_gold_settlement") {
      add("gold-bo", "gold", "bo"); add("gold-zi", "gold", "zi");
    } else if (scenario === "draw_peng_settlement") {
      add("red-ma-1", "red", "ma"); add("red-ma-2", "red", "ma");
    } else {
      add("red-ju", "red", "ju"); add("red-pao", "red", "pao"); add("yellow-ma", "yellow", "ma");
    }
    const card: Card = scenario === "draw_gold_settlement" ? { id: `draw-gong-${seq}`, color: "gold", type: "gong" } : { id: `draw-ma-${seq}`, color: "red", type: "ma" };
    context.setPendingResponse(createPendingResponse(seatId, card, "draw"));
    context.state.phase = "playing";
    context.state.responsePhase = "collective";
    context.state.currentPlayerId = seatId;
    context.state.currentTurnPlayerId = seatId;
    context.state.pollOriginPlayerId = seatId;
    context.setResponseCard(card, "draw");
    context.state.lastAction = `${seatId} ZHUA`;
  } else if (scenario === "hu_ready_mode2" || scenario === "hu_ready_local_draw") {
    add("h1", "red", "ju");
    add("h2", "red", "ma");
    add("h3", "red", "pao");
    context.setPendingResponse(createPendingResponse(seatId, { id: "h3", color: "red", type: "pao" }, "draw"));
    context.state.phase = "playing";
    context.state.responsePhase = "local_draw";
    context.state.currentPlayerId = seatId;
    context.state.currentTurnPlayerId = seatId;
    context.setResponseCard(context.getPendingResponse()!.card, "draw");
    context.state.lastAction = `DEBUG: hu_ready_local_draw#${seq}`;
  } else if (
    scenario === "eat_mode1" ||
    scenario === "chi_local_upper" ||
    scenario === "chi_local_upper_full_hand"
  ) {
    add("d1", "red", "shi");
    add("d2", "red", "xiang");
    add("d3", "yellow", "ju");
    add("d4", "yellow", "ma");
    if (scenario === "chi_local_upper_full_hand") {
      const filler: Array<[string, Card["color"], Card["type"]]> = [
        ["full-01", "yellow", "pao"], ["full-02", "yellow", "zu"],
        ["full-03", "yellow", "shi"], ["full-04", "yellow", "xiang"],
        ["full-05", "green", "ju"], ["full-06", "green", "ma"],
        ["full-07", "green", "pao"], ["full-08", "green", "zu"],
        ["full-09", "green", "shi"], ["full-10", "green", "xiang"],
        ["full-11", "white", "ju"], ["full-12", "white", "ma"],
        ["full-13", "white", "pao"], ["full-14", "white", "zu"],
        ["full-15", "white", "shi"], ["full-16", "white", "xiang"],
      ];
      for (const [id, color, type] of filler) add(id, color, type);
    }
    context.setPendingResponse(createPendingResponse(seatId, { id: "rj", color: "red", type: "jiang" }, "upper"));
    context.state.phase = "playing";
    context.state.responsePhase = "local_upper";
    context.state.currentPlayerId = seatId;
    context.state.currentTurnPlayerId = seatId;
    context.setResponseCard(context.getPendingResponse()!.card, "upper");
    context.state.lastAction = `DEBUG: ${scenario}#${seq}`;
  } else if (scenario === "chi_unique_jmp" || scenario === "chi_unique_duplicate_jmp") {
    add("unique-yellow-ju-1", "yellow", "ju");
    if (scenario === "chi_unique_duplicate_jmp") add("unique-yellow-ju-2", "yellow", "ju");
    add("unique-yellow-ma", "yellow", "ma");
    add("unique-red-shi", "red", "shi");
    const seatIndex = context.playerOrder.indexOf(seatId);
    const originId = context.playerOrder[(seatIndex - 1 + context.playerOrder.length) % context.playerOrder.length]!;
    context.setPendingResponse(
      createPendingResponse(seatId, { id: "unique-yellow-pao", color: "yellow", type: "pao" }, "upper"),
    );
    context.state.phase = "playing";
    context.state.responsePhase = "local_upper";
    context.state.currentPlayerId = seatId;
    context.state.currentTurnPlayerId = seatId;
    context.state.pollOriginPlayerId = originId;
    context.setResponseCard(context.getPendingResponse()!.card, "upper");
    context.state.lastAction = `DEBUG: ${scenario}#${seq}`;
  } else if (scenario === "chi_unique_jsx") {
    add("unique-red-jiang", "red", "jiang");
    add("unique-red-shi", "red", "shi");
    add("post-red-ju", "red", "ju");
    add("post-red-ma", "red", "ma");
    add("post-yellow-shi", "yellow", "shi");
    const seatIndex = context.playerOrder.indexOf(seatId);
    const originId = context.playerOrder[(seatIndex - 1 + context.playerOrder.length) % context.playerOrder.length]!;
    context.setPendingResponse(
      createPendingResponse(seatId, { id: "unique-red-xiang", color: "red", type: "xiang" }, "upper"),
    );
    context.state.phase = "playing";
    context.state.responsePhase = "local_upper";
    context.state.currentPlayerId = seatId;
    context.state.currentTurnPlayerId = seatId;
    context.state.pollOriginPlayerId = originId;
    context.setResponseCard(context.getPendingResponse()!.card, "upper");
    context.state.lastAction = `DEBUG: ${scenario}#${seq}`;
  } else if (scenario === "chi_collective_zu4" || scenario === "chi_local_upper_zu4") {
    for (const id of context.playerOrder) {
      const tablePlayer = context.state.players.get(id);
      if (tablePlayer) tablePlayer.declaredKongs = 0;
      if (id !== seatId) {
        // 该夹具只验证真人在全局窗口结束后的本地吃牌。若复用随机开局手牌，
        // 机器人可能恰好持有两张白卒并合法碰牌，正确抢占吃牌却会让回归不稳定。
        context.playerHands.set(id, [
          { id: `chi-bystander-${id}-${seq}`, color: "red", type: "shi" },
        ]);
      }
    }
    add("shared-zu-yellow", "yellow", "zu");
    add("shared-zu-red", "red", "zu");
    add("shared-zu-green", "green", "zu");
    add("shared-red-ma", "red", "ma");
    const seatIndex = context.playerOrder.indexOf(seatId);
    const originId = context.playerOrder[(seatIndex - 1 + context.playerOrder.length) % context.playerOrder.length]!;
    const local = scenario === "chi_local_upper_zu4";
    context.setPendingResponse(
      createPendingResponse(
        local ? seatId : originId,
        { id: "shared-zu-white", color: "white", type: "zu" },
        "upper",
      ),
    );
    context.state.phase = "playing";
    context.state.responsePhase = local ? "local_upper" : "collective";
    context.state.currentPlayerId = local ? seatId : originId;
    context.state.currentTurnPlayerId = local ? seatId : originId;
    context.state.pollOriginPlayerId = originId;
    context.setResponseCard(context.getPendingResponse()!.card, "upper");
    context.state.lastAction = `DEBUG: ${scenario}#${seq}`;
  } else if (scenario === "chi_four_zu") {
    add("zu-red", "red", "zu");
    add("zu-green", "green", "zu");
    add("zu-white", "white", "zu");
    add("zu-spare", "red", "ma");
    context.setPendingResponse(createPendingResponse(seatId, { id: "zu-yellow", color: "yellow", type: "zu" }, "upper"));
    context.state.phase = "playing";
    context.state.responsePhase = "local_upper";
    context.state.currentPlayerId = seatId;
    context.state.currentTurnPlayerId = seatId;
    context.setResponseCard(context.getPendingResponse()!.card, "upper");
    context.state.lastAction = `DEBUG: chi_four_zu#${seq}`;
  } else if (scenario === "mode2_pass" || scenario === "local_draw_pass") {
    add("d5", "yellow", "ju");
    add("d6", "white", "xiang");
    add("d7", "green", "zu");
    context.setPendingResponse(createPendingResponse(seatId, { id: "gy", color: "green", type: "pao" }, "draw"));
    context.state.phase = "playing";
    context.state.responsePhase = "local_draw";
    context.state.currentPlayerId = seatId;
    context.state.currentTurnPlayerId = seatId;
    context.setResponseCard(context.getPendingResponse()!.card, "draw");
    context.state.lastAction = `DEBUG: local_draw_pass#${seq}`;
  } else if (scenario === "collective_no_actions" || scenario === "collective_passive_wait" || scenario === "collective_manual_wait") {
    if (scenario === "collective_passive_wait" || scenario === "collective_manual_wait") {
      // 第二个浏览器需要时间接收自己的状态与私有消息；该场景直接沿用生产的三秒窗口。
      context.setCollectiveResponseWindowMs(scenario === "collective_manual_wait" ? 10_000 : 3_000);
      const selfIndex = context.playerOrder.indexOf(seatId);
      const ownerId = context.playerOrder[(selfIndex - 1 + context.playerOrder.length) % context.playerOrder.length];
      for (const id of context.playerOrder) {
        context.playerHands.set(id, [
          { id: `passive-${id}-shi-${seq}`, color: "red", type: "shi" },
          { id: `passive-${id}-xiang-${seq}`, color: "green", type: "xiang" },
          { id: `passive-${id}-zu-${seq}`, color: "white", type: "zu" },
        ]);
      }
      if (scenario === "collective_manual_wait") {
        const responderId = context.playerOrder[(selfIndex + 1) % context.playerOrder.length];
        context.playerHands.set(responderId, [
          { id: `manual-ju1-${seq}`, color: "yellow", type: "ju" },
          { id: `manual-ju2-${seq}`, color: "yellow", type: "ju" },
          { id: `manual-spare-${seq}`, color: "green", type: "zu" },
        ]);
      }
      context.setPendingResponse(
        createPendingResponse(ownerId, { id: `passive-response-${seq}`, color: "yellow", type: "ju" }, "upper"),
      );
      context.state.phase = "playing";
      context.state.responsePhase = "collective";
      context.state.currentPlayerId = ownerId;
      context.state.currentTurnPlayerId = ownerId;
      context.state.pollOriginPlayerId = ownerId;
      context.setResponseCard(context.getPendingResponse()!.card, "upper");
      context.state.lastAction = `DEBUG: ${scenario}#${seq}`;
    } else {
    add("d8", "red", "shi");
    add("d9", "green", "xiang");
    add("d10", "white", "zu");
    context.setPendingResponse(
      createPendingResponse(context.getNextPlayerId(seatId), { id: "yj", color: "yellow", type: "ju" }, "upper"),
    );
    context.state.phase = "playing";
    context.state.responsePhase = "collective";
    context.state.currentPlayerId = context.getPendingResponse()!.ownerId;
    context.setResponseCard(context.getPendingResponse()!.card, "upper");
    context.state.lastAction = `DEBUG: collective_no_actions#${seq}`;
    }
  } else if (scenario === "early_collective_choice") {
    // 该场景需要让两个真人都来得及提交并发拦截，不能沿用 E2E 的 20ms 快速窗口。
    context.setCollectiveResponseWindowMs(3_000);
    for (const id of context.playerOrder) {
      const tablePlayer = context.state.players.get(id);
      if (tablePlayer) tablePlayer.declaredKongs = 0;
    }
    const otherHumanId = context.playerOrder.find((id) => {
      if (id === seatId) {
        return false;
      }
      const candidate = context.state.players.get(id);
      return Boolean(candidate?.connected && !candidate.isBot && !candidate.isConfiguredBot);
    });
    if (!otherHumanId) {
      return false;
    }
    const otherHumanIndex = context.playerOrder.indexOf(otherHumanId);
    const ownerId = context.playerOrder[
      (otherHumanIndex - 1 + context.playerOrder.length) % context.playerOrder.length
    ];
    if (!ownerId) {
      return false;
    }
    add("early-self-1", "red", "ju");
    add("early-self-2", "red", "ju");
    add("early-self-3", "yellow", "ma");
    context.playerHands.set(otherHumanId, [
      { id: "early-other-1", color: "red", type: "ju" },
      { id: "early-other-2", color: "red", type: "ju" },
      { id: "early-other-3", color: "green", type: "ma" },
    ]);
    context.setPendingResponse(
      createPendingResponse(ownerId, { id: "early-response", color: "red", type: "ju" }, "upper"),
    );
    context.state.phase = "playing";
    context.state.responsePhase = "collective";
    context.state.currentPlayerId = ownerId;
    context.setResponseCard(context.getPendingResponse()!.card, "upper");
    context.state.lastAction = `DEBUG: early_collective_choice#${seq}`;
  } else if (scenario === "crowded_collective_actions") {
    context.setCollectiveResponseWindowMs(3_000);
    context.state.publicDiscardPile.clear();
    for (const id of context.playerOrder) {
      const tablePlayer = context.state.players.get(id);
      if (tablePlayer) tablePlayer.declaredKongs = 0;
      if (id !== seatId) {
        context.playerHands.set(id, [
          { id: `crowded-bystander-${id}-${seq}`, color: "white", type: "shi" },
        ]);
      }
    }
    add("crowded-xiang-1", "red", "xiang");
    add("crowded-xiang-2", "red", "xiang");
    add("crowded-xiang-3", "red", "xiang");
    add("crowded-spare", "yellow", "ma");
    const seatIndex = context.playerOrder.indexOf(seatId);
    const ownerId = context.playerOrder[(seatIndex - 1 + context.playerOrder.length) % context.playerOrder.length];
    if (!ownerId) return false;
    const response: Card = {
      id: `crowded-response-${seq}`,
      color: "red",
      type: "xiang",
      source: "upper",
    };
    context.setPendingResponse(createPendingResponse(ownerId, response, "upper"));
    context.state.phase = "playing";
    context.state.responsePhase = "collective";
    context.state.currentPlayerId = ownerId;
    context.state.currentTurnPlayerId = ownerId;
    context.state.previousPlayerId = ownerId;
    context.state.pollOriginPlayerId = ownerId;
    context.setResponseCard(response, "upper");
    context.state.lastAction = `DEBUG: crowded_collective_actions#${seq}`;
  } else if (scenario === "upper_peng_xiang") {
    context.state.publicDiscardPile.clear();
    for (const id of context.playerOrder) {
      const seat = context.state.players.get(id)!;
      seat.declaredKongs = 0;
      seat.exposedArea.clear(); seat.exposedGroupSizes.clear(); seat.exposedGroupKinds.clear();
      seat.generalArea.clear(); seat.fishArea.clear(); seat.discardPile.clear();
      if (id !== seatId) context.playerHands.set(id, [{ id: `other-${id}-${seq}`, color: "white", type: "shi" }]);
    }
    add("red-xiang-1", "red", "xiang");
    add("red-xiang-2", "red", "xiang");
    add("yellow-ma-spare", "yellow", "ma");
    const seatIndex = context.playerOrder.indexOf(seatId);
    const ownerId = context.playerOrder[(seatIndex - 1 + context.playerOrder.length) % context.playerOrder.length];
    if (!ownerId) return false;
    const response: Card = { id: `upper-red-xiang-${seq}`, color: "red", type: "xiang", source: "upper" };
    context.state.players.get(ownerId)!.discardPile.push(context.toSchemaCard(response, false, "upper"));
    context.state.publicDiscardPile.push(context.toSchemaCard(response, false, "upper"));
    context.setPendingResponse(createPendingResponse(ownerId, response, "upper"));
    context.state.phase = "playing";
    context.state.responsePhase = "collective";
    context.state.currentPlayerId = ownerId;
    context.state.currentTurnPlayerId = ownerId;
    context.state.previousPlayerId = ownerId;
    context.state.pollOriginPlayerId = ownerId;
    context.state.tableTransitionsJson = "[]";
    context.state.presentationUntil = 0;
    context.setResponseCard(response, "upper");
    context.state.lastAction = `${ownerId} DISCARD`;
  } else if (scenario === "waiting_other_turn") {
    add("wait1", "yellow", "ju");
    add("wait2", "red", "ma");
    add("wait3", "green", "pao");
    const waitingSeatId = context.getNextPlayerId(seatId);
    context.setPendingResponse(
      createPendingResponse(waitingSeatId, { id: "wait-draw", color: "white", type: "xiang" }, "draw"),
    );
    context.state.phase = "playing";
    context.state.responsePhase = "local_draw";
    context.state.currentPlayerId = waitingSeatId;
    context.state.currentTurnPlayerId = waitingSeatId;
    context.setResponseCard(context.getPendingResponse()!.card, "draw");
    context.state.lastAction = `DEBUG: waiting_other_turn#${seq}`;
  } else if (
    scenario === "dealer_pick_intro" ||
    scenario === "dealer_reveal_self" ||
    scenario === "dealer_settled_self"
  ) {
    add(`dealer-hand-${seq}`, "yellow", "ma");
    const dealerCard: Card = {
      id: `dealer-card-${seq}`,
      color: "red",
      type: "xiang",
      source: "upper",
    };
    context.setPendingResponse(null);
    context.state.responseCard = new CardSchema();
    context.state.phase = scenario === "dealer_settled_self" ? "playing" : "declaring";
    context.state.responsePhase = "collective";
    context.state.currentPlayerId = seatId;
    context.state.currentTurnPlayerId = seatId;
    context.state.dealerId = seatId;
    context.state.dealerPickerId = context.getNextPlayerId(seatId);
    context.setDealerCard(dealerCard);
    context.state.responseEndsAt = Date.now() + 10_000;
    context.state.lastAction = scenario === "dealer_pick_intro"
      ? `DEALER_PICK ${context.state.dealerPickerId}`
      : scenario === "dealer_reveal_self"
        ? `DEALER_CARD ${seatId}`
        : `DEALER ${seatId}`;
  } else if (scenario === "readable_exposed_groups") {
    add(`readable-hand-${seq}`, "yellow", "ma");
    for (const tablePlayer of context.state.players.values()) {
      tablePlayer.exposedArea.clear();
      tablePlayer.exposedGroupSizes.clear();
      tablePlayer.exposedGroupKinds.clear();
      // Keep this visual fixture deterministic even when the random opening
      // hand produced a declared fish group before the scenario was applied.
      tablePlayer.fishArea.clear();
    }
    const self = context.state.players.get(seatId)!;
    self.exposedArea.push(
      context.toSchemaCard({ id: `readable-self-ju-${seq}`, color: "red", type: "ju" }, true, "upper"),
      context.toSchemaCard({ id: `readable-self-ma-${seq}`, color: "red", type: "ma" }, false, "upper"),
      context.toSchemaCard({ id: `readable-self-pao-${seq}`, color: "red", type: "pao" }, false, "upper"),
    );
    self.exposedGroupSizes.push(3);
    self.exposedGroupKinds.push("chi");
    const opponentColors: Card["color"][] = ["green", "yellow", "white"];
    let opponentIndex = 0;
    for (const opponentId of context.playerOrder.filter((id) => id !== seatId)) {
      const opponent = context.state.players.get(opponentId);
      const color = opponentColors[opponentIndex++]!;
      if (!opponent) continue;
      opponent.exposedArea.push(
        context.toSchemaCard({ id: `readable-${opponentId}-ju-${seq}`, color, type: "ju" }, false, "upper"),
        context.toSchemaCard({ id: `readable-${opponentId}-ma-${seq}`, color, type: "ma" }, false, "upper"),
        context.toSchemaCard({ id: `readable-${opponentId}-pao-${seq}`, color, type: "pao" }, false, "upper"),
      );
      opponent.exposedGroupSizes.push(3);
      opponent.exposedGroupKinds.push("chi");
    }
    const waitingSeatId = context.getNextPlayerId(seatId);
    context.setPendingResponse(
      createPendingResponse(waitingSeatId, { id: `readable-target-${seq}`, color: "white", type: "xiang" }, "draw"),
    );
    context.state.phase = "playing";
    context.state.responsePhase = "local_draw";
    context.state.currentPlayerId = waitingSeatId;
    context.state.currentTurnPlayerId = waitingSeatId;
    context.setResponseCard(context.getPendingResponse()!.card, "draw");
    context.state.lastAction = `DEBUG: readable_exposed_groups#${seq}`;
  } else if (scenario === "hu_fail_case") {
    context.publicGeneralPool.length = 0;
    for (const id of context.playerOrder) {
      context.state.players.get(id)?.generalArea.clear();
      context.state.players.get(id)?.wildcardPool.clear();
    }
    add("d11", "red", "jiang");
    add("d12", "red", "shi");
    add("d13", "red", "xiang");
    context.setPendingResponse(
      createPendingResponse(context.getNextPlayerId(seatId), { id: "rp", color: "red", type: "pao" }, "upper"),
    );
    context.state.phase = "playing";
    context.state.responsePhase = "collective";
    context.state.currentPlayerId = context.getPendingResponse()!.ownerId;
    context.setResponseCard(context.getPendingResponse()!.card, "upper");
    context.state.lastAction = `DEBUG: hu_fail_case#${seq}`;
  } else if (scenario === "discard_public") {
    context.state.publicDiscardPile.clear();
    for (const id of context.playerOrder) {
      const player = context.state.players.get(id);
      if (!player) {
        continue;
      }
      player.discardPile.clear();
      const card = context.toSchemaCard({ id: `${id}_d1_${seq}`, color: "yellow", type: "ma" }, false, "upper");
      player.discardPile.push(card);
      context.state.publicDiscardPile.push(
        context.toSchemaCard({ id: `${id}_d1_${seq}`, color: "yellow", type: "ma" }, false, "upper"),
      );
    }
    const me = context.state.players.get(seatId);
    if (me) {
      const card = context.toSchemaCard({ id: `self_d2_${seq}`, color: "red", type: "ju" }, false, "upper");
      me.discardPile.push(card);
      context.state.publicDiscardPile.push(
        context.toSchemaCard({ id: `self_d2_${seq}`, color: "red", type: "ju" }, false, "upper"),
      );
    }
    context.setPendingResponse(null);
    context.state.responseCard = new CardSchema();
    context.state.responsePhase = "collective";
    context.state.lastAction = `DEBUG: discard_public#${seq}`;
  } else if (scenario === "settlement_hu") {
    for (const id of context.playerOrder) {
      const tablePlayer = context.state.players.get(id);
      if (!tablePlayer) {
        continue;
      }
      tablePlayer.declaredKongs = 0;
      tablePlayer.exposedArea.clear();
      tablePlayer.exposedGroupSizes.clear();
      tablePlayer.exposedGroupKinds.clear();
      tablePlayer.generalArea.clear();
      tablePlayer.wildcardPool.clear();
      tablePlayer.fishArea.clear();
      tablePlayer.discardPile.clear();
    }
    add("s1", "yellow", "jiang");
    add("s2", "yellow", "shi");
    add("s3", "yellow", "xiang");
    add("s4", "red", "ju");
    add("s5", "red", "ma");
    add("s6", "red", "pao");
    add("s7", "green", "zu");
    add("s8", "green", "zu");
    add("s9", "green", "zu");
    add("s10", "white", "ju");
    add("s11", "white", "ma");
    add("s12", "white", "pao");
    add("s13", "gold", "bo");
    context.setPendingResponse(null);
    context.state.responseCard = new CardSchema();
    context.state.phase = "playing";
    context.state.responsePhase = "local_draw";
    context.state.currentPlayerId = seatId;
    context.state.lastAction = `DEBUG: settlement_hu#${seq}`;
    context.playerHands.set(seatId, hand);
    context.updatePublicHandCounts();
    context.syncAllPrivateHands();
    context.endRound(`${seatId} HU`, seatId, ["FrameJMP"]);
    return true;
  } else {
    return false;
  }

  context.playerHands.set(seatId, hand);
  context.updatePublicHandCounts();
  context.syncAllPrivateHands();
  if (scenario.startsWith("draw_") || scenario === "upper_peng_xiang") {
    alignCollectivePublicTurn();
    context.startCollectivePolling();
    return true;
  }
  context.broadcastAvailableActions();

  if (
    scenario === "discard_public" ||
    scenario === "waiting_other_turn" ||
    scenario === "readable_exposed_groups"
  ) {
    context.resetCollectivePolling();
    return true;
  }
  if (scenario.startsWith("dealer_")) {
    // Polling was already cleared before this scenario established its
    // ceremony deadline. resetCollectivePolling() also zeroes responseEndsAt,
    // which would allow the declaration dialog to cover the reveal.
    return true;
  }
  if (
    scenario === "collective_no_actions" ||
    scenario === "collective_passive_wait" ||
    scenario === "collective_manual_wait" ||
    scenario === "early_collective_choice" ||
    scenario === "crowded_collective_actions" ||
    scenario === "chi_collective_zu4" ||
    scenario === "hu_fail_case"
  ) {
    alignCollectivePublicTurn();
    context.startCollectivePolling();
    return true;
  }
  context.tickBots();
  return true;
}

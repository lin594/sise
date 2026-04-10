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
  setResponseCard: (card: Card, source: "upper" | "draw") => void;
  syncAllPrivateHands: () => void;
  resetCollectivePolling: () => void;
  broadcastAvailableActions: () => void;
  startCollectivePolling: () => void;
  tickBots: () => void;
}

/**
 * 作用：注入预设调试牌局场景，快速验证主循环与动作流程。
 * 关键输入/输出：输入座位与场景名，输出是否应用成功。
 * 副作用：覆盖指定玩家手牌、pending/responsePhase/lastAction，并触发轮询或 bot 步进。
 */
export function applyDebugScenario(context: DebugScenarioContext, seatId: string, scenario: string): boolean {
  if (!context.state.players.has(seatId)) {
    return false;
  }

  const hand = context.playerHands.get(seatId) ?? [];
  hand.length = 0;
  const add = (id: string, color: Card["color"], type: Card["type"]) => hand.push({ id, color, type });
  const seq = context.nextDebugSeq();

  if (scenario === "hu_ready_mode2" || scenario === "hu_ready_local_draw") {
    add("h1", "red", "ju");
    add("h2", "red", "ma");
    add("h3", "red", "pao");
    context.setPendingResponse(createPendingResponse(seatId, { id: "h3", color: "red", type: "pao" }, "draw"));
    context.state.phase = "playing";
    context.state.responsePhase = "local_draw";
    context.state.currentPlayerId = seatId;
    context.setResponseCard(context.getPendingResponse()!.card, "draw");
    context.state.lastAction = `DEBUG: hu_ready_local_draw#${seq}`;
  } else if (scenario === "eat_mode1" || scenario === "chi_local_upper") {
    add("d1", "red", "shi");
    add("d2", "red", "xiang");
    add("d3", "yellow", "ju");
    add("d4", "yellow", "ma");
    context.setPendingResponse(createPendingResponse(seatId, { id: "rj", color: "red", type: "jiang" }, "upper"));
    context.state.phase = "playing";
    context.state.responsePhase = "local_upper";
    context.state.currentPlayerId = seatId;
    context.setResponseCard(context.getPendingResponse()!.card, "upper");
    context.state.lastAction = `DEBUG: chi_local_upper#${seq}`;
  } else if (scenario === "mode2_pass" || scenario === "local_draw_pass") {
    add("d5", "yellow", "ju");
    add("d6", "white", "xiang");
    add("d7", "green", "zu");
    context.setPendingResponse(createPendingResponse(seatId, { id: "gy", color: "green", type: "pao" }, "draw"));
    context.state.phase = "playing";
    context.state.responsePhase = "local_draw";
    context.state.currentPlayerId = seatId;
    context.setResponseCard(context.getPendingResponse()!.card, "draw");
    context.state.lastAction = `DEBUG: local_draw_pass#${seq}`;
  } else if (scenario === "collective_no_actions") {
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
  } else {
    return false;
  }

  context.playerHands.set(seatId, hand);
  context.syncAllPrivateHands();

  if (scenario === "discard_public") {
    context.resetCollectivePolling();
    context.broadcastAvailableActions();
    return true;
  }
  if (scenario === "collective_no_actions" || scenario === "hu_fail_case") {
    context.startCollectivePolling();
    return true;
  }
  context.tickBots();
  return true;
}

<template>
  <OrientationGuard />
  <main class="layout">
    <header class="top">
      <h1>四色牌 v4.0</h1>
      <div class="meta">
        <span>{{ connected ? "已连接" : "连接中..." }}</span>
        <span>座位ID: {{ mySeatId || "-" }}</span>
        <span>房主: {{ state?.hostPlayerId || "-" }}</span>
      </div>
    </header>

    <section v-if="isWaiting" class="lobby">
      <h2>等待大厅</h2>
      <p>房主手动开始。人数不足 4 人时，开始后自动补机器人。</p>
      <div class="lobby-actions">
        <button class="primary" :disabled="!isHost" @click="startGame">
          {{ isHost ? "开始游戏" : "等待房主开始" }}
        </button>
        <button class="ghost" @click="copyInviteLink">复制邀请链接</button>
      </div>
      <p v-if="joinError" class="error">{{ joinError }}</p>

      <div class="player-grid">
        <div v-for="p in players" :key="p.clientId" class="player-item">
          <strong>{{ p.name }}</strong>
          <small>{{ p.clientId === state?.hostPlayerId ? "房主" : "玩家" }}</small>
          <small>{{ p.isBot ? "BOT托管" : p.connected ? "在线" : "离线" }}</small>
        </div>
      </div>
    </section>

    <template v-else>
      <section v-if="isPlaying" class="turn-banner" :class="{ mine: isMyTurn }">
        <strong>当前回合: {{ currentPlayerName }}</strong>
        <span>{{ turnHint }}</span>
      </section>
      <GameBoard
        :state="state"
        :players="players"
        :private-hand="privateHand"
        :my-seat-id="mySeatId"
        :can-discard="canDiscard"
        @discard-card="sendDiscardCard"
      />
    </template>

    <section class="logs">
      <h2>动作日志</h2>
      <small>机器人思考延时默认 200ms（可用 BOT_THINK_MS 调整）</small>
      <div class="log-list">
        <p v-for="item in actionLogs" :key="item.id">
          <span class="log-time">{{ item.at }}</span>
          <span>{{ item.text }}</span>
        </p>
      </div>
    </section>

    <DebugPanel hint="测试场景：点击后会自动做 PASS/FAIL 断言。" :result="debugResult" @run="runDebugScenario" />

    <ActionPanel
      v-if="isPlaying"
      :actions="availableActions"
      :can-act="canAct"
      :is-current-turn="isMyTurn"
      :response-phase="state?.responsePhase || ''"
      :current-player-name="currentPlayerName"
      @submit="sendAction"
    />

    <div v-if="showEndPanel" class="hu-mask">
      <div class="hu-panel">
        <h2>{{ endPanelTitle }}</h2>
        <template v-if="huResult">
          <p>赢家: {{ winnerName }}</p>
          <p>牌型: {{ huResult.groups.join(" / ") || "-" }}</p>
        </template>
        <template v-else>
          <p>{{ endSummary }}</p>
          <p>最后动作: {{ state?.lastAction || "-" }}</p>
        </template>

        <section v-if="settlementPlayers.length" class="settlement">
          <h3>手牌展示</h3>
          <div class="settlement-list">
            <div v-for="p in settlementPlayers" :key="`settle-${p.clientId}`" class="settlement-item">
              <p class="settlement-name">{{ p.name }}</p>
              <div class="settlement-cards" v-if="p.hand.length">
                <CardComp v-for="card in p.hand" :key="`settle-${p.clientId}-${card.id}`" :card="card" />
              </div>
              <p v-else class="settlement-empty">（无手牌）</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import ActionPanel from "@/components/ActionPanel.vue";
import CardComp from "@/components/Card.vue";
import DebugPanel from "@/components/DebugPanel.vue";
import GameBoard from "@/components/GameBoard.vue";
import OrientationGuard from "@/components/OrientationGuard.vue";
import { useRoom } from "@/composables/useRoom";
import type { AvailableAction, RoundResultPlayer } from "@/types/game";

type DebugResult = {
  scenario: string;
  ok: boolean;
  summary: string;
  errors: string[];
};

const {
  connected,
  mySeatId,
  state,
  players,
  privateHand,
  availableActions,
  huResult,
  roundResult,
  debugApplied,
  joinError,
  actionLogs,
  sendAction,
  sendDiscardCard,
  debugSetup,
  startGame,
} = useRoom("玩家");

const isWaiting = computed(() => state.value?.phase === "waiting");
const isPlaying = computed(() => state.value?.phase === "playing");
const isEnded = computed(() => state.value?.phase === "ended");
const isHost = computed(() => Boolean(mySeatId.value) && state.value?.hostPlayerId === mySeatId.value);
const isMyTurn = computed(() => {
  if (!mySeatId.value || state.value?.currentPlayerId !== mySeatId.value) {
    return false;
  }
  const me = players.value.find((x) => x.clientId === mySeatId.value);
  return !Boolean(me?.isBot);
});

const canAct = computed(() => isPlaying.value && availableActions.value.some((x) => x.enabled));
const canDiscard = computed(
  () => isPlaying.value && isMyTurn.value && state.value?.responsePhase === "self_grab" && !canAct.value,
);

const showEndPanel = computed(() => Boolean(huResult.value) || Boolean(roundResult.value) || isEnded.value);
const endPanelTitle = computed(() => (huResult.value ? "胡牌结算" : "本局结束"));
const winnerName = computed(() => {
  const winnerId = huResult.value?.winnerId ?? roundResult.value?.winnerId;
  if (!winnerId) {
    return "-";
  }
  const player = players.value.find((x) => x.clientId === winnerId);
  return player?.name || winnerId;
});

const settlementPlayers = computed<RoundResultPlayer[]>(() => roundResult.value?.players ?? []);

const endSummary = computed(() => {
  const action = String(state.value?.lastAction ?? "");
  if (action === "DECK_EMPTY") {
    return "牌堆耗尽，流局。";
  }
  const noDiscardMatch = action.match(/^(\S+)\s+NO_DISCARD$/);
  if (noDiscardMatch) {
    const seatId = noDiscardMatch[1];
    const player = players.value.find((x) => x.clientId === seatId);
    return `${player?.name || seatId} 无可弃牌，流局。`;
  }
  return "对局结束。";
});

const turnHint = computed(() => {
  if (canDiscard.value) {
    return "请点击手牌弃一张";
  }
  if (state.value?.responsePhase === "collective") {
    if (!isMyTurn.value && canAct.value) {
      return "他人待响阶段：你可以选择胡/开/碰/吃/过";
    }
    if (isMyTurn.value) {
      return "等待他人响应";
    }
  }
  return isMyTurn.value ? "轮到你操作" : "等待对方操作";
});

const currentPlayerName = computed(() => {
  const playerId = state.value?.currentPlayerId;
  if (!playerId) {
    return "-";
  }
  const player = players.value.find((x) => x.clientId === playerId);
  return player?.name || playerId;
});

const debugResult = ref<DebugResult | null>(null);
const debugMarkers: Record<string, string> = {
  hu_ready_mode2: "DEBUG: hu_ready_mode2",
  mode2_pass: "DEBUG: mode2_pass",
  collective_no_actions: "DEBUG: collective_no_actions",
  hu_fail_case: "DEBUG: hu_fail_case",
  discard_public: "DEBUG: discard_public",
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function enabled(action: string, actions: AvailableAction[]): boolean {
  return actions.some((x) => x.action === action && x.enabled);
}

function exists(action: string, actions: AvailableAction[]): boolean {
  return actions.some((x) => x.action === action);
}

function evaluate(scenario: string): string[] {
  const actions = availableActions.value;
  const errors: string[] = [];

  if (scenario === "hu_ready_mode2") {
    if (state.value?.responsePhase !== "self_grab") errors.push("responsePhase 应为 self_grab");
    if (!enabled("hu", actions)) errors.push("胡按钮应可点击（预置可胡）");
    if (!exists("pass", actions)) errors.push("模式2应包含过按钮");
  }

  if (scenario === "mode2_pass") {
    if (state.value?.responsePhase !== "self_grab") errors.push("responsePhase 应为 self_grab");
    if (!exists("pass", actions)) errors.push("模式2应包含过按钮");
    if (!enabled("pass", actions)) errors.push("过按钮应可点击");
    if (exists("grab", actions)) errors.push("模式2不应出现抓按钮");
  }

  if (scenario === "collective_no_actions") {
    if (state.value?.responsePhase !== "collective") errors.push("responsePhase 应为 collective");
    if (state.value?.currentPlayerId === mySeatId.value) errors.push("当前玩家不应是自己");
    if (!exists("pass", actions)) errors.push("他人待响阶段应包含过按钮");
    if (!enabled("pass", actions)) errors.push("他人待响阶段，过按钮应可点");
    if (enabled("hu", actions) || enabled("open", actions) || enabled("peng", actions)) {
      errors.push("当前样例中，胡/开/碰应灰显");
    }
  }

  if (scenario === "hu_fail_case") {
    if (state.value?.responsePhase !== "collective") errors.push("responsePhase 应为 collective");
    if (!exists("hu", actions)) errors.push("应存在胡按钮");
    if (enabled("hu", actions)) errors.push("胡按钮应灰显（胡牌失败样例）");
  }

  if (scenario === "discard_public") {
    if (players.value.length < 4) errors.push("玩家展示数量应至少4（含机器人）");
    const myPlayer = players.value.find((p) => p.clientId === mySeatId.value);
    if (!myPlayer || (myPlayer.discardPile?.length ?? 0) < 2) {
      errors.push(`自己弃牌区应至少2张牌（当前=${myPlayer?.discardPile?.length ?? 0}）`);
    }
    const everyoneHasDiscard = players.value.every((p) => (p.discardPile?.length ?? 0) >= 1);
    if (!everyoneHasDiscard) {
      const counts = players.value.map((p) => `${p.clientId}:${p.discardPile?.length ?? 0}`).join(", ");
      errors.push(`所有玩家弃牌区应可见且至少1张（当前=${counts}）`);
    }
  }

  return errors;
}

async function runDebugScenario(scenario: string) {
  debugResult.value = { scenario, ok: false, summary: "断言中...", errors: [] };
  debugSetup(scenario);

  let ackSeen = false;
  for (let i = 0; i < 20; i += 1) {
    await wait(120);
    const ack = debugApplied.value;
    if (!ack || ack.scenario !== scenario) continue;
    ackSeen = true;
    if (!ack.ok) {
      debugResult.value = { scenario, ok: false, summary: "服务端未应用场景", errors: ["debug_setup 返回 ok=false"] };
      return;
    }

    const marker = debugMarkers[scenario];
    for (let j = 0; j < 20; j += 1) {
      await wait(80);
      if (!String(state.value?.lastAction ?? "").startsWith(marker)) continue;
      const errors = evaluate(scenario);
      debugResult.value = {
        scenario,
        ok: errors.length === 0,
        summary: errors.length === 0 ? "场景断言通过" : "场景断言失败，请看失败项",
        errors,
      };
      return;
    }
    break;
  }

  debugResult.value = {
    scenario,
    ok: false,
    summary: ackSeen ? "收到场景回执，但未等到状态同步" : "未等到场景状态刷新，请重试一次",
    errors: [ackSeen ? `lastAction 未进入 ${debugMarkers[scenario]}` : "状态未进入目标 DEBUG 场景"],
  };
}

async function copyInviteLink() {
  try {
    await navigator.clipboard.writeText(window.location.href);
  } catch {
    // Ignore clipboard errors.
  }
}
</script>

<style scoped>
.layout {
  min-height: 100vh;
  max-width: 1600px;
  margin: 0 auto;
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 10px;
  padding: 10px;
  background: radial-gradient(circle at 20% 20%, #0f172a 0%, #020617 60%);
}

.top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #0b1220;
  border: 1px solid #1e293b;
  border-radius: 12px;
  padding: 8px 10px;
  color: #e2e8f0;
}

.meta {
  display: flex;
  gap: 12px;
  color: #93c5fd;
}

.lobby {
  background: #0b1220;
  border: 1px solid #1e293b;
  border-radius: 12px;
  padding: 12px;
  color: #e2e8f0;
}

.lobby-actions {
  display: flex;
  gap: 8px;
  margin: 10px 0;
}

.primary,
.ghost {
  border: none;
  border-radius: 8px;
  padding: 10px 14px;
  cursor: pointer;
}

.primary {
  background: #2563eb;
  color: #fff;
}

.primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ghost {
  background: #1f2937;
  color: #e2e8f0;
  border: 1px solid #334155;
}

.player-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.player-item {
  background: #111827;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.turn-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  border: 1px solid #334155;
  border-radius: 10px;
  background: #111827;
  color: #bfdbfe;
}

.turn-banner.mine {
  border-color: #22c55e;
  background: #052e16;
  color: #bbf7d0;
}

.error {
  color: #fca5a5;
}

.logs {
  background: #0b1220;
  border: 1px solid #1e293b;
  border-radius: 12px;
  padding: 8px 10px;
  color: #e2e8f0;
}

.log-list {
  margin-top: 6px;
  max-height: 180px;
  overflow: auto;
  border-top: 1px dashed #334155;
  padding-top: 6px;
}

.log-list p {
  margin: 0 0 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  color: #cbd5e1;
}

.log-time {
  color: #93c5fd;
  margin-right: 8px;
}

.hu-mask {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.55);
  display: flex;
  justify-content: center;
  align-items: center;
}

.hu-panel {
  background: #f8fafc;
  color: #0f172a;
  padding: 18px 22px;
  border-radius: 12px;
  min-width: 300px;
  max-width: min(92vw, 1100px);
  max-height: 86vh;
  overflow: auto;
}

.settlement {
  margin-top: 12px;
  border-top: 1px dashed #cbd5e1;
  padding-top: 10px;
}

.settlement h3 {
  margin: 0 0 8px;
  font-size: 15px;
}

.settlement-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.settlement-item {
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  background: #ffffff;
  padding: 8px;
}

.settlement-name {
  margin: 0 0 6px;
  font-weight: 600;
}

.settlement-cards {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.settlement-empty {
  margin: 0;
  color: #64748b;
}

@media (max-width: 767px) {
  .player-grid {
    grid-template-columns: 1fr;
  }

  .meta {
    flex-direction: column;
    gap: 4px;
    text-align: right;
  }

  .turn-banner {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }

  .settlement-list {
    grid-template-columns: 1fr;
  }
}
</style>

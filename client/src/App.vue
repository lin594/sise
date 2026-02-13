<template>
  <OrientationGuard />
  <main class="layout">
    <header class="top">
      <h1>四色牌 v4.0</h1>
      <div class="meta">
        <span>{{ connected ? "已连接" : "连接中..." }}</span>
        <span>玩家ID: {{ myId || "-" }}</span>
      </div>
    </header>

    <GameBoard :state="state" :players="players" :private-hand="privateHand" />
    <DebugPanel
      hint="点击场景后会自动断言当前状态是否符合 SRS，并给出 PASS/FAIL。"
      :result="debugResult"
      @run="runDebugScenario"
    />
    <ActionPanel :actions="availableActions" @submit="sendAction" />

    <div v-if="huResult" class="hu-mask">
      <div class="hu-panel">
        <h2>胡牌结算</h2>
        <p>赢家：{{ huResult.winnerId }}</p>
        <p>拆解：{{ huResult.groups.join(" / ") || "-" }}</p>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import { ref } from "vue";
import ActionPanel from "@/components/ActionPanel.vue";
import DebugPanel from "@/components/DebugPanel.vue";
import GameBoard from "@/components/GameBoard.vue";
import OrientationGuard from "@/components/OrientationGuard.vue";
import { useRoom } from "@/composables/useRoom";
import type { AvailableAction } from "@/types/game";

type DebugResult = {
  scenario: string;
  ok: boolean;
  summary: string;
  errors: string[];
};

const { connected, myId, state, players, privateHand, availableActions, huResult, debugApplied, sendAction, debugSetup } =
  useRoom("玩家");

const debugResult = ref<DebugResult | null>(null);
const debugMarkers: Record<string, string> = {
  eat_mode1: "DEBUG: eat_mode1",
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

  if (scenario === "eat_mode1") {
    if (state.value?.responsePhase !== "self_eat") errors.push("responsePhase 应为 self_eat");
    if (!enabled("eat", actions)) errors.push("吃按钮应可点击");
    if (!enabled("grab", actions)) errors.push("抓按钮应可点击");
    if (enabled("hu", actions) || enabled("open", actions) || enabled("peng", actions)) errors.push("胡/开/碰应灰显");
    if (exists("pass", actions)) errors.push("模式1不应出现过按钮");
  }

  if (scenario === "mode2_pass") {
    if (state.value?.responsePhase !== "self_grab") errors.push("responsePhase 应为 self_grab");
    if (!exists("pass", actions)) errors.push("模式2应包含过按钮");
    if (!enabled("pass", actions)) errors.push("过按钮应可点击");
    if (exists("grab", actions)) errors.push("模式2不应出现抓按钮");
  }

  if (scenario === "collective_no_actions") {
    if (state.value?.responsePhase !== "collective") errors.push("responsePhase 应为 collective");
    if (state.value?.currentPlayerId === myId.value) errors.push("当前玩家不应是自己");
    if (!enabled("pass", actions)) errors.push("过按钮应可点击");
    if (enabled("hu", actions) || enabled("open", actions) || enabled("peng", actions)) errors.push("胡/开/碰应灰显");
  }

  if (scenario === "hu_fail_case") {
    if (state.value?.responsePhase !== "collective") errors.push("responsePhase 应为 collective");
    if (!exists("hu", actions)) errors.push("应存在胡按钮");
    if (enabled("hu", actions)) errors.push("胡按钮应灰显（胡牌失败样例）");
  }

  if (scenario === "discard_public") {
    if (players.value.length < 4) errors.push("玩家展示数量应至少为4（含机器人）");
    const myPlayer = players.value.find((p) => p.clientId === myId.value);
    if (!myPlayer || (myPlayer.discardPile?.length ?? 0) < 2) {
      const meCount = myPlayer?.discardPile?.length ?? 0;
      errors.push(`自己弃牌区应至少2张牌（当前=${meCount}）`);
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
    if (!ack || ack.scenario !== scenario) {
      continue;
    }
    ackSeen = true;
    if (!ack.ok) {
      debugResult.value = {
        scenario,
        ok: false,
        summary: "服务端未应用场景",
        errors: ["debug_setup 返回 ok=false"],
      };
      return;
    }

    // Wait state patch sync after ack.
    const marker = debugMarkers[scenario];
    for (let j = 0; j < 20; j += 1) {
      await wait(80);
      if (!String(state.value?.lastAction ?? "").startsWith(marker)) {
        continue;
      }
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
    summary: ackSeen ? "收到场景回执，但未等到状态补丁" : "未等到场景状态刷新，请重试一次",
    errors: [ackSeen ? `lastAction 未进入 ${debugMarkers[scenario]}` : "状态未进入目标 DEBUG 场景"],
  };
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
.hu-mask {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.7);
  display: flex;
  justify-content: center;
  align-items: center;
}
.hu-panel {
  background: #f8fafc;
  color: #0f172a;
  padding: 20px;
  border-radius: 12px;
  min-width: 300px;
}
</style>

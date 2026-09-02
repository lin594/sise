<template>
  <section class="lobby">
    <div class="lobby-head">
      <div>
        <p class="lobby-kicker">{{ kicker }}</p>
        <h2>{{ title }}</h2>
        <p class="lobby-rule-tip">{{ subtitle }}</p>
      </div>
      <button class="ghost" @click="$emit('open-rules')">查看规则</button>
    </div>

    <div v-if="modes.length" class="mode-grid">
      <button
        v-for="mode in modes"
        :key="mode.id"
        :data-testid="`mode-${mode.id}`"
        class="mode-card"
        :class="{ active: selectedMode === mode.id, disabled: !mode.enabled }"
        :disabled="!mode.enabled"
        @click="$emit('select-mode', mode.id)"
      >
        <div class="mode-head">
          <strong>{{ mode.name }}</strong>
          <span>{{ mode.enabled ? "可开始" : "即将开放" }}</span>
        </div>
        <p>{{ mode.description }}</p>
      </button>
    </div>

    <div v-if="roomMode === 'friends' && roomId" class="invite-card">
      <div>
        <strong>好友房 {{ roomId }}</strong>
        <p>复制邀请链接给朋友；链接不会包含你的身份凭据。</p>
      </div>
      <button class="ghost" data-testid="copy-invite" @click="$emit('copy-invite')">复制邀请链接</button>
    </div>

    <div v-if="roomId" class="seat-grid" data-testid="seat-grid">
      <article
        v-for="slot in seatSlots"
        :key="slot.seatIndex"
        class="seat-card"
        :class="{ empty: !slot.player, mine: slot.player?.clientId === mySeatId }"
        :data-testid="`seat-${slot.seatIndex}`"
      >
        <div class="seat-head">
          <strong>{{ seatNames[slot.seatIndex] }}</strong>
          <span v-if="slot.player?.clientId === hostPlayerId">
            {{ slot.player?.clientId === mySeatId ? "房主 · 你" : "房主" }}
          </span>
          <span v-else-if="slot.player?.clientId === mySeatId">你</span>
        </div>

        <template v-if="slot.player">
          <p class="player-name">{{ slot.player.name }}</p>
          <small v-if="slot.player.isConfiguredBot">机器人 · 强度 {{ slot.player.botStrength }}</small>
          <small v-else>{{ slot.player.connected ? "真人在线" : "真人离线（座位暂留）" }}</small>

          <template v-if="slot.player.isConfiguredBot && isHost">
            <label class="strength-row">
              <span>休闲</span>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                :value="slot.player.botStrength"
                :data-testid="`bot-strength-${slot.seatIndex}`"
                @input="$emit('update-bot', slot.seatIndex, Number(($event.target as HTMLInputElement).value))"
              />
              <span>高手</span>
            </label>
            <button class="danger mini" @click="$emit('remove-seat', slot.seatIndex)">移除机器人</button>
          </template>
          <button
            v-else-if="isHost && slot.player.clientId !== hostPlayerId"
            class="danger mini"
            @click="$emit('remove-seat', slot.seatIndex)"
          >
            移出玩家
          </button>
        </template>

        <template v-else>
          <p class="empty-label">等待入座</p>
          <div class="seat-actions">
            <button
              class="ghost mini"
              :data-testid="`claim-seat-${slot.seatIndex}`"
              @click="$emit('claim-seat', slot.seatIndex)"
            >
              {{ mySeatId ? "换到这里" : "选择此座" }}
            </button>
            <button
              v-if="isHost"
              class="ghost mini"
              :data-testid="`add-bot-${slot.seatIndex}`"
              @click="$emit('add-bot', slot.seatIndex)"
            >
              添加机器人
            </button>
          </div>
        </template>
      </article>
    </div>

    <div class="lobby-actions">
      <button class="primary" data-testid="lobby-start" :disabled="!canStart" @click="$emit('start')">
        {{ startLabel }}
      </button>
      <span v-if="startHint" class="start-hint">{{ startHint }}</span>
    </div>

    <p v-if="joinError" class="error">{{ joinError }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";

type LobbyMode = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
};

type LobbyPlayer = {
  clientId: string;
  seatIndex: number;
  name: string;
  isBot: boolean;
  isConfiguredBot: boolean;
  botStrength: number;
  connected: boolean;
};

const props = defineProps<{
  kicker: string;
  title: string;
  subtitle: string;
  modes: LobbyMode[];
  selectedMode: string;
  canStart: boolean;
  startLabel: string;
  startHint: string;
  joinError: string;
  hostPlayerId: string;
  mySeatId: string;
  isHost: boolean;
  roomId: string;
  roomMode: "practice" | "friends" | "";
  players: LobbyPlayer[];
}>();

const seatNames = ["首席", "二席", "三席", "四席"];
const seatSlots = computed(() =>
  Array.from({ length: 4 }, (_, seatIndex) => ({
    seatIndex,
    player: props.players.find((player) => player.seatIndex === seatIndex) ?? null,
  })),
);

defineEmits<{
  "open-rules": [];
  start: [];
  "select-mode": [modeId: string];
  "copy-invite": [];
  "claim-seat": [seatIndex: number];
  "add-bot": [seatIndex: number];
  "update-bot": [seatIndex: number, strength: number];
  "remove-seat": [seatIndex: number];
}>();
</script>

<style scoped>
.lobby { background:#0b1220; border:1px solid #1e293b; border-radius:12px; padding:14px; color:#e2e8f0; display:grid; gap:1rem; }
.lobby-head,.invite-card,.seat-head,.lobby-actions,.seat-actions,.strength-row { display:flex; align-items:center; gap:.75rem; }
.lobby-head,.invite-card,.seat-head { justify-content:space-between; }
.lobby-kicker { margin:0; color:#fbbf24; font-size:.78rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; }
.lobby-head h2 { margin:0; font-size:clamp(1.2rem,2.8vh,1.6rem); }
.lobby-rule-tip,.invite-card p { margin:.35rem 0 0; color:#93c5fd; font-size:.84rem; }
.mode-grid,.seat-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:.75rem; }
.mode-card,.seat-card,.invite-card { border:1px solid #334155; border-radius:14px; background:linear-gradient(180deg,#172033 0%,#0f172a 100%); color:#e2e8f0; padding:.9rem; }
.mode-card { display:grid; gap:.45rem; text-align:left; cursor:pointer; }
.mode-card.active,.seat-card.mine { border-color:#38bdf8; box-shadow:0 0 0 1px rgba(56,189,248,.3); }
.mode-card.disabled { cursor:not-allowed; opacity:.7; }
.mode-head { display:flex; justify-content:space-between; gap:.75rem; }
.mode-card p,.player-name,.empty-label { margin:.35rem 0; }
.seat-card { min-height:130px; display:flex; flex-direction:column; gap:.45rem; }
.seat-card.empty { border-style:dashed; }
.seat-head span { color:#fbbf24; font-size:.75rem; }
.seat-actions { margin-top:auto; flex-wrap:wrap; }
.strength-row { font-size:.7rem; }
.strength-row input { flex:1; min-width:100px; }
.primary,.ghost,.danger { border:none; border-radius:8px; padding:10px 14px; cursor:pointer; }
.primary { background:#2563eb; color:#fff; }
.primary:disabled { opacity:.4; cursor:not-allowed; }
.ghost { background:#1f2937; color:#e2e8f0; border:1px solid #334155; }
.danger { background:#7f1d1d; color:#fee2e2; }
.mini { padding:7px 10px; font-size:.78rem; }
.start-hint { color:#94a3b8; font-size:.82rem; }
.error { color:#fca5a5; }
@media (max-width:700px) { .mode-grid,.seat-grid { grid-template-columns:1fr; } .invite-card { align-items:flex-start; flex-direction:column; } }
</style>

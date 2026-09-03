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
          <small v-if="slot.player.isConfiguredBot">机器人 · {{ botLevelForStrength(slot.player.botStrength).label }}</small>
          <small v-else>{{ slot.player.connected ? "真人在线" : "真人离线（座位暂留）" }}</small>

          <template v-if="slot.player.isConfiguredBot && isHost">
            <div
              class="bot-level-group"
              role="group"
              :aria-label="`${slot.player.name}的机器人难度`"
              :data-testid="`bot-levels-${slot.seatIndex}`"
            >
              <span>选择难度</span>
              <div class="bot-level-options">
                <button
                  v-for="level in botLevels"
                  :key="level.id"
                  type="button"
                  class="bot-level-button"
                  :class="{ active: botLevelForStrength(slot.player.botStrength).id === level.id }"
                  :aria-pressed="botLevelForStrength(slot.player.botStrength).id === level.id"
                  :aria-label="`将${slot.player.name}设为${level.label}难度`"
                  :data-testid="`bot-level-${slot.seatIndex}-${level.id}`"
                  @click="$emit('update-bot', slot.seatIndex, level.strength)"
                >
                  {{ level.label }}
                </button>
              </div>
            </div>
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
const botLevels = [
  { id: "easy", label: "轻松", strength: 20 },
  { id: "standard", label: "标准", strength: 50 },
  { id: "expert", label: "高手", strength: 85 },
] as const;
const seatSlots = computed(() =>
  Array.from({ length: 4 }, (_, seatIndex) => ({
    seatIndex,
    player: props.players.find((player) => player.seatIndex === seatIndex) ?? null,
  })),
);

function botLevelForStrength(strength: number): (typeof botLevels)[number] {
  const normalized = Number.isFinite(strength) ? strength : 50;
  if (normalized < 35) {
    return botLevels[0];
  }
  if (normalized < 70) {
    return botLevels[1];
  }
  return botLevels[2];
}

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
.lobby { background:#0b1220; border:1px solid #1e293b; border-radius:12px; padding:14px; color:#e2e8f0; display:grid; gap:1rem; min-height:0; overflow:auto; overscroll-behavior:contain; }
.lobby-head,.invite-card,.seat-head,.lobby-actions,.seat-actions { display:flex; align-items:center; gap:.75rem; }
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
.bot-level-group { display:grid; gap:.3rem; }
.bot-level-group > span { color:#bfdbfe; font-size:.72rem; font-weight:750; }
.bot-level-options { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:.35rem; }
.bot-level-button { min-width:0; min-height:44px; padding:.4rem .25rem; border:1px solid #475569; border-radius:9px; background:#172033; color:#e2e8f0; font-weight:800; cursor:pointer; }
.bot-level-button.active { border-color:#38bdf8; background:#075985; color:#f0f9ff; box-shadow:0 0 0 1px rgba(56,189,248,.28); }
.bot-level-button:focus-visible { outline:3px solid #facc15; outline-offset:2px; }
.primary,.ghost,.danger { border:none; border-radius:8px; padding:10px 14px; cursor:pointer; min-height:48px; }
.primary { background:#2563eb; color:#fff; }
.primary:disabled { opacity:.4; cursor:not-allowed; }
.ghost { background:#1f2937; color:#e2e8f0; border:1px solid #334155; }
.danger { background:#7f1d1d; color:#fee2e2; }
.mini { padding:7px 10px; font-size:.78rem; min-height:48px; }
.start-hint { color:#94a3b8; font-size:.82rem; }
.error { color:#fca5a5; }
.lobby-actions { position:sticky; bottom:-14px; z-index:4; padding:.65rem 0 max(.65rem, env(safe-area-inset-bottom)); background:linear-gradient(180deg,rgba(11,18,32,0),#0b1220 28%); }
@media (max-width:700px) and (pointer:fine) { .mode-grid,.seat-grid { grid-template-columns:1fr; } .invite-card { align-items:flex-start; flex-direction:column; } }
@media (max-width:960px), (max-height:500px) {
  .lobby { gap:.55rem; padding:.65rem; }
  .lobby-head h2 { font-size:1.15rem; }
  .lobby-rule-tip,.invite-card p { margin-top:.2rem; font-size:.76rem; }
  .mode-grid,.seat-grid { grid-template-columns:repeat(2,minmax(0,1fr)); gap:.5rem; }
  .mode-card,.seat-card,.invite-card { padding:.62rem; border-radius:11px; }
  .mode-card { gap:.25rem; }
  .seat-card { min-height:108px; gap:.25rem; }
  .lobby-actions { bottom:-.65rem; padding:.5rem 0; }
}
@media (max-width:720px), (max-height:380px) {
  .lobby { gap:.4rem; padding:.5rem; }
  .mode-card p { font-size:.75rem; line-height:1.3; }
  .lobby-rule-tip { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .invite-card { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; }
  .invite-card p { display:none; }
  .invite-card .ghost { min-height:42px; padding:.5rem .7rem; }
  .seat-card { min-height:96px; }
}
</style>

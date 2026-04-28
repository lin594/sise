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

    <div class="mode-grid">
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

    <div class="lobby-actions">
      <button class="primary" data-testid="lobby-start" :disabled="!canStart" @click="$emit('start')">{{ startLabel }}</button>
    </div>

    <p v-if="joinError" class="error">{{ joinError }}</p>

    <div v-if="players.length" class="player-grid">
      <div v-for="p in players" :key="p.clientId" class="player-item">
        <strong>{{ p.name }}</strong>
        <small>{{ p.clientId === hostPlayerId ? "房主" : "玩家" }}</small>
        <small>{{ p.isBot ? "BOT托管" : p.connected ? "在线" : "离线" }}</small>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
type LobbyMode = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
};

type LobbyPlayer = {
  clientId: string;
  name: string;
  isBot: boolean;
  connected: boolean;
};

defineProps<{
  kicker: string;
  title: string;
  subtitle: string;
  modes: LobbyMode[];
  selectedMode: string;
  canStart: boolean;
  startLabel: string;
  joinError: string;
  hostPlayerId: string;
  players: LobbyPlayer[];
}>();

defineEmits<{
  "open-rules": [];
  start: [];
  "select-mode": [modeId: string];
}>();
</script>

<style scoped>
.lobby {
  background: #0b1220;
  border: 1px solid #1e293b;
  border-radius: 12px;
  padding: 12px;
  color: #e2e8f0;
  display: grid;
  gap: 0.9rem;
}

.lobby-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
}

.lobby-kicker {
  margin: 0;
  color: #fbbf24;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.lobby-head h2 {
  margin: 0;
  font-size: clamp(1.2rem, 2.8vh, 1.6rem);
}

.lobby-rule-tip {
  margin: 0.35rem 0 0;
  color: #93c5fd;
  font-size: clamp(0.72rem, 1.5vh, 0.88rem);
}

.mode-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.75rem;
}

.mode-card {
  border: 1px solid #334155;
  border-radius: 14px;
  background: linear-gradient(180deg, #172033 0%, #0f172a 100%);
  color: #e2e8f0;
  padding: 0.9rem;
  display: grid;
  gap: 0.45rem;
  text-align: left;
  cursor: pointer;
}

.mode-card.active {
  border-color: #38bdf8;
  box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.3);
}

.mode-card.disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.mode-head {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: baseline;
}

.mode-head strong {
  font-size: 0.98rem;
}

.mode-head span {
  font-size: 0.72rem;
  color: #93c5fd;
  white-space: nowrap;
}

.mode-card p {
  margin: 0;
  color: #cbd5e1;
  line-height: 1.55;
  font-size: 0.84rem;
}

.lobby-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
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

.error {
  color: #fca5a5;
}
</style>

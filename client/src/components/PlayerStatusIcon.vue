<template>
  <span
    v-if="kind"
    class="player-status-icon"
    :class="`status-${kind}`"
    :title="label"
    :aria-label="label"
    role="img"
    data-testid="player-status-icon"
    :data-status-kind="kind"
  >
    <svg v-if="kind === 'computer'" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
    <svg v-else-if="kind === 'autoplay'" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 8h10a4 4 0 0 1 4 4v7H3v-7a4 4 0 0 1 4-4Z" />
      <path d="M12 4v4M9 13h.01M15 13h.01" />
    </svg>
    <svg v-else viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 8h10a4 4 0 0 1 4 4v7H3v-7a4 4 0 0 1 4-4Z" />
      <path d="M12 4v4M9 13h.01M15 13h.01M4 4l16 16" />
    </svg>
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  isConfiguredBot?: boolean;
  isAutoPlay?: boolean;
  isBot?: boolean;
  connected?: boolean;
}>();

const kind = computed<"computer" | "autoplay" | "takeover" | "offline" | null>(() => {
  if (props.isConfiguredBot) return "computer";
  if (props.isAutoPlay) return "autoplay";
  if (props.isBot) return "takeover";
  if (props.connected === false) return "offline";
  return null;
});
const label = computed(() => ({
  computer: "电脑玩家",
  autoplay: "主动托管",
  takeover: "离线，临时托管",
  offline: "离线",
}[kind.value ?? "offline"]));
</script>

<style scoped>
.player-status-icon {
  width: 1.55rem;
  height: 1.55rem;
  flex: 0 0 1.55rem;
  display: inline-grid;
  place-items: center;
  border: 1px solid #475569;
  border-radius: 0.45rem;
  color: #cbd5e1;
  background: rgba(15, 23, 42, 0.82);
}
.player-status-icon svg { width: 1.05rem; height: 1.05rem; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.status-computer { color: #7dd3fc; border-color: rgba(56, 189, 248, 0.58); }
.status-autoplay { color: #fcd34d; border-color: rgba(245, 158, 11, 0.64); }
.status-takeover, .status-offline { color: #fda4af; border-color: rgba(251, 113, 133, 0.64); }
</style>

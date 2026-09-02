<template>
  <div
    v-if="visible"
    class="connection-status"
    :class="tone"
    role="status"
    aria-live="polite"
    data-testid="connection-status"
  >
    <span class="status-dot" aria-hidden="true"></span>
    <span class="status-copy">
      <strong>{{ title }}</strong>
      <small v-if="detail">{{ detail }}</small>
    </span>
    <button v-if="canRetry" type="button" data-testid="retry-connection" @click="emit('retry')">
      立即重试
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { RoomConnectionState } from "@/types/game";

const props = withDefaults(
  defineProps<{
    state: RoomConnectionState;
    attempt?: number;
    showConnected?: boolean;
  }>(),
  {
    attempt: 0,
    showConnected: false,
  },
);

const emit = defineEmits<{
  retry: [];
}>();

const visible = computed(() => props.state !== "idle" && (props.state !== "connected" || props.showConnected));
const canRetry = computed(() => props.state === "retry_wait" || props.state === "failed");
const tone = computed(() => {
  if (props.state === "connected" || props.state === "restored") return "good";
  if (props.state === "offline" || props.state === "failed") return "danger";
  return "working";
});
const title = computed(() => {
  switch (props.state) {
    case "connected":
      return "网络正常";
    case "restored":
      return "牌局已恢复";
    case "offline":
      return "断网 · 自动恢复中";
    case "retry_wait":
      return "未连上 · 自动重试中";
    case "failed":
      return "连接失败";
    case "reconnecting":
      return props.attempt > 0 ? `正在恢复（第${props.attempt}次）` : "正在恢复牌局";
    default:
      return "正在连接";
  }
});
const detail = computed(() => {
  if (props.state === "restored") return "托管期间的最新牌局已同步";
  if (props.state === "offline") return "联网后自动恢复";
  if (props.state === "retry_wait") return "系统会继续重试";
  return "";
});
</script>

<style scoped>
.connection-status {
  min-width: 0;
  max-width: min(24rem, 44vw);
  min-height: 2rem;
  margin-inline: auto;
  padding: 0.25rem 0.5rem;
  border: 1px solid rgba(148, 163, 184, 0.42);
  border-radius: 0.7rem;
  background: rgba(15, 23, 42, 0.9);
  color: #f8fafc;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.42rem;
  line-height: 1.1;
}

.status-dot {
  width: 0.65rem;
  height: 0.65rem;
  flex: 0 0 auto;
  border-radius: 999px;
  background: #fbbf24;
  box-shadow: 0 0 0 0.2rem rgba(251, 191, 36, 0.18);
}

.good .status-dot {
  background: #4ade80;
  box-shadow: 0 0 0 0.2rem rgba(74, 222, 128, 0.17);
}

.danger .status-dot {
  background: #fb7185;
  box-shadow: 0 0 0 0.2rem rgba(251, 113, 133, 0.18);
}

.status-copy {
  min-width: 0;
  display: grid;
  gap: 0.08rem;
  text-align: left;
}

.status-copy strong,
.status-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-copy strong {
  font-size: clamp(0.72rem, 1.65vh, 0.88rem);
}

.status-copy small {
  color: #cbd5e1;
  font-size: clamp(0.58rem, 1.3vh, 0.7rem);
}

button {
  min-height: 1.8rem;
  flex: 0 0 auto;
  padding: 0.25rem 0.55rem;
  border: 1px solid rgba(125, 211, 252, 0.62);
  border-radius: 0.52rem;
  background: #075985;
  color: #f0f9ff;
  font-size: clamp(0.66rem, 1.45vh, 0.78rem);
  font-weight: 800;
}

@media (max-height: 420px) {
  .connection-status {
    min-height: 1.8rem;
    padding-block: 0.16rem;
  }

  .status-copy small {
    display: none;
  }
}
</style>

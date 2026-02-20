<template>
  <section class="debug">
    <h3>娴嬭瘯闈㈡澘</h3>
    <div class="list">
      <button v-for="item in scenarios" :key="item.key" class="btn" @click="$emit('run', item.key)">
        {{ item.label }}
      </button>
    </div>
    <p class="tips">{{ hint }}</p>
    <div v-if="result" class="result" :class="result.ok ? 'ok' : 'fail'">
      <strong>{{ result.ok ? "PASS" : "FAIL" }} 路 {{ labelOf(result.scenario) }}</strong>
      <p>{{ result.summary }}</p>
      <ul v-if="result.errors.length">
        <li v-for="err in result.errors" :key="err">{{ err }}</li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  hint: string;
  result: {
    scenario: string;
    ok: boolean;
    summary: string;
    errors: string[];
  } | null;
}>();

defineEmits<{
  run: [scenario: string];
}>();

const scenarios = [
  { key: "hu_ready_local_draw", label: "本家摸牌可胡（本地阶段）" },
  { key: "local_draw_pass", label: "本家摸牌过牌（本地阶段）" },
  { key: "collective_no_actions", label: "集体轮询仅可过" },
  { key: "hu_fail_case", label: "胡牌失败用例" },
  { key: "discard_public", label: "弃牌区公开展示" },
];

function labelOf(key: string): string {
  return scenarios.find((x) => x.key === key)?.label ?? key;
}
</script>

<style scoped>
.debug {
  background: #0b1220;
  border: 1px solid #1e293b;
  border-radius: 12px;
  padding: 8px;
  color: #e2e8f0;
}

.list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.btn {
  border: 1px solid #334155;
  border-radius: 8px;
  background: #1e293b;
  color: #e2e8f0;
  padding: 8px 10px;
  cursor: pointer;
}

.btn:hover {
  background: #334155;
}

.tips {
  margin: 8px 0 0;
  color: #93c5fd;
}

.result {
  margin-top: 8px;
  border-radius: 8px;
  padding: 8px 10px;
}

.result p {
  margin: 6px 0;
}

.result ul {
  margin: 0;
  padding-left: 18px;
}

.result.ok {
  border: 1px solid #166534;
  background: #052e16;
  color: #bbf7d0;
}

.result.fail {
  border: 1px solid #991b1b;
  background: #450a0a;
  color: #fecaca;
}
</style>

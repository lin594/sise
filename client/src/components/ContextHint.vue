<template>
  <aside class="context-hint" data-testid="context-hint" :data-concept="concept" aria-label="新手提示">
    <p role="status" aria-live="polite">{{ text }}</p>
    <button type="button" aria-label="关闭这条提示" @click="$emit('dismiss')">知道了</button>
    <button type="button" aria-label="关闭所有新手提示" @click="$emit('disable')">不再提示</button>
  </aside>
</template>
<script setup lang="ts">
defineProps<{ text: string; concept: string }>();
defineEmits<{ dismiss: []; disable: [] }>();
</script>
<style scoped>
.context-hint { display: flex; align-items: center; gap: 6px; max-width: 100%; border: 1px solid #a58c67; border-radius: 8px; padding: 4px 8px; background: #fff9ea; color: #423323; font-size: 12px; }
p { margin: 0; flex: 1; }
button { flex-shrink: 0; min-height: 32px; border-radius: 5px; }
@media (max-height: 400px) { .context-hint { font-size: 11px; padding: 3px 6px; } }
</style>

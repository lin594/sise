<template>
  <div class="nickname-mask" @click.self="emit('close')">
    <form ref="dialog" class="nickname-dialog" role="dialog" aria-modal="true" aria-labelledby="nickname-title" @submit.prevent="save" @keydown.esc.stop.prevent="emit('close')" @keydown.tab="trapFocus">
      <header><h2 id="nickname-title">修改昵称</h2><button type="button" aria-label="关闭修改昵称" @click="emit('close')">×</button></header>
      <label for="nickname-edit">牌友怎么称呼你</label>
      <input id="nickname-edit" ref="input" v-model="draft" data-testid="nickname-input" maxlength="16" autocomplete="nickname" />
      <div v-if="history.length" class="nickname-history"><button v-for="name in history" :key="name" type="button" @click="draft = name">{{ name }}</button></div>
      <footer><button type="button" data-testid="random-nickname" @click="emit('randomize')">换个名字</button><button type="button" data-testid="cancel-nickname" @click="emit('close')">取消</button><button class="save" data-testid="login-submit" :disabled="!draft.trim()">保存昵称</button></footer>
    </form>
  </div>
</template>
<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
const props = defineProps<{ nickname: string; history: string[]; randomName: string }>();
const emit = defineEmits<{ save: [name: string]; close: []; randomize: [] }>();
const draft = ref(props.nickname);
const input = ref<HTMLInputElement | null>(null);
const dialog = ref<HTMLFormElement | null>(null);
watch(() => props.randomName, value => { if (value) draft.value = value; });
onMounted(() => { input.value?.focus(); input.value?.select(); });
function save() { if (draft.value.trim()) emit('save', draft.value.trim().slice(0, 16)); }
function trapFocus(event: KeyboardEvent) {
  const nodes = Array.from(dialog.value?.querySelectorAll<HTMLElement>('button:not(:disabled), input') ?? []);
  const first = nodes[0], last = nodes[nodes.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}
</script>
<style scoped>
.nickname-mask { position: absolute; inset: 0; z-index: 100; display: grid; place-items: center; background: #071b2466; padding: .75rem; }
.nickname-dialog { width: min(28rem, 100%); max-height: 100%; overflow: auto; padding: 1rem; border: 1px solid var(--ui-border, #475569); border-radius: 1rem; background: var(--ui-panel, #0f172a); color: var(--ui-text, #e2e8f0); box-shadow: 0 16px 48px #0004; }
header, footer { display: flex; align-items: center; justify-content: space-between; gap: .5rem; } h2 { margin: 0; font-size: 1.2rem; } label { display: block; margin: 1rem 0 .4rem; } input { width: 100%; min-height: 44px; font: inherit; padding: .5rem; background: var(--ui-raised, #1e293b); color: inherit; border: 1px solid var(--ui-border, #64748b); border-radius: .5rem; }
button { min-height: 40px; padding: .4rem .6rem; border: 1px solid var(--ui-border, #64748b); border-radius: .4rem; background: var(--ui-raised, #1e293b); color: inherit; font: inherit; cursor: pointer; } button:disabled { opacity: .5; } .save { background: var(--ui-accent, #0369a1); color: #fff; } footer { margin-top: 1rem; } .nickname-history { display: flex; gap: .35rem; flex-wrap: wrap; margin-top: .5rem; } .nickname-history button { font-size: 13px; }
</style>

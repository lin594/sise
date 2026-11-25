<template>
  <div class="nickname-mask" @click.self="emit('close')">
    <form ref="dialog" class="nickname-dialog" role="dialog" aria-modal="true" aria-labelledby="nickname-title" @submit.prevent="save" @keydown.esc.stop.prevent="emit('close')" @keydown.tab="trapFocus">
      <header><h2 id="nickname-title">修改昵称</h2><button type="button" aria-label="关闭修改昵称" @click="emit('close')">×</button></header>
      <div class="nickname-body">
        <label for="nickname-edit">牌友怎么称呼你</label>
        <input id="nickname-edit" ref="input" v-model="draft" data-testid="nickname-input" maxlength="16" autocomplete="nickname" />
        <details v-if="history.length" class="nickname-history" :open="historyOpen" @toggle="historyOpen = ($event.target as HTMLDetailsElement).open">
          <summary>用过的昵称</summary>
          <div class="nickname-history-names"><button v-for="name in history" :key="name" type="button" @click="selectHistoryName(name)">{{ name }}</button></div>
        </details>
      </div>
      <footer><button type="button" data-testid="random-nickname" @click="emit('randomize')">换个名字</button><button type="button" data-testid="cancel-nickname" @click="emit('close')">取消</button><button class="save" data-testid="login-submit" :disabled="!draft.trim()">保存昵称</button></footer>
    </form>
  </div>
</template>
<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from "vue";
const props = defineProps<{ nickname: string; history: string[]; randomName: string }>();
const emit = defineEmits<{ save: [name: string]; close: []; randomize: [] }>();
const draft = ref(props.nickname);
const input = ref<HTMLInputElement | null>(null);
const dialog = ref<HTMLFormElement | null>(null);
const historyOpen = ref(false);
watch(() => props.randomName, value => { if (value) draft.value = value; });
onMounted(() => { input.value?.focus(); input.value?.select(); });
function save() { if (draft.value.trim()) emit('save', draft.value.trim().slice(0, 16)); }
async function selectHistoryName(name: string) {
  draft.value = name;
  historyOpen.value = false;
  await nextTick();
  input.value?.focus();
  input.value?.scrollIntoView({ block: "nearest", inline: "nearest" });
}
function trapFocus(event: KeyboardEvent) {
  const nodes = Array.from(dialog.value?.querySelectorAll<HTMLElement>('button:not(:disabled), input') ?? []);
  const first = nodes[0], last = nodes[nodes.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}
</script>
<style scoped>
.nickname-mask { position: absolute; inset: 0; z-index: 100; display: grid; place-items: center; container: nickname-space / size; background: #071b2466; padding: clamp(.25rem, calc(var(--effective-vh, 1vh) * 2), .75rem); }
.nickname-dialog { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; gap: .7rem; width: min(28rem, 100%); max-height: 100%; min-height: 0; overflow: hidden; padding: 1rem; border: 1px solid var(--ui-border, #475569); border-radius: 1rem; background: var(--ui-panel, #0f172a); color: var(--ui-text, #e2e8f0); box-shadow: 0 16px 48px #0004; }
.nickname-body { min-height: 0; overflow: auto; scrollbar-gutter: stable; }
header, footer { display: flex; align-items: center; justify-content: space-between; gap: .5rem; } h2 { margin: 0; font-size: 1.2rem; } label { display: block; margin: 0 0 .4rem; } input { width: 100%; min-height: 44px; font: inherit; padding: .5rem; background: var(--ui-raised, #1e293b); color: inherit; border: 1px solid var(--ui-border, #64748b); border-radius: .5rem; }
button { min-height: 40px; padding: .4rem .6rem; border: 1px solid var(--ui-border, #64748b); border-radius: .4rem; background: var(--ui-raised, #1e293b); color: inherit; font: inherit; cursor: pointer; } button:disabled { opacity: .5; } .save { background: var(--ui-accent, #0369a1); color: #fff; }
.nickname-history { margin-top: .5rem; }
.nickname-history summary { cursor: pointer; min-height: 36px; padding: .4rem 0; }
.nickname-history-names { display: flex; gap: .35rem; flex-wrap: wrap; }
.nickname-history button { max-width: 100%; overflow-wrap: anywhere; font-size: 13px; }
@container nickname-space (max-height: 220px) {
  .nickname-dialog { padding: .25rem; gap: .25rem; }
  .nickname-body label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
}
</style>

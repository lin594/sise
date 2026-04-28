<template>
  <section class="entry-shell">
    <div class="entry-hero">
      <p class="entry-kicker">开始游戏</p>
      <h2>先取一个昵称</h2>
      <p class="entry-desc">输入昵称后进入大厅，当前可直接开始单人练习。</p>
    </div>

    <div class="entry-card">
      <label class="entry-field">
        <span>昵称</span>
        <input
          :value="nickname"
          data-testid="nickname-input"
          class="entry-input"
          type="text"
          maxlength="16"
          list="nickname-history"
          placeholder="例如：阿青"
          @input="onInput"
          @keydown.enter.prevent="$emit('submit')"
        />
      </label>

      <datalist id="nickname-history">
        <option v-for="name in historyNames" :key="`history-${name}`" :value="name" />
      </datalist>

      <div v-if="historyNames.length" class="history-chips">
        <button
          v-for="name in historyNames"
          :key="`chip-${name}`"
          class="history-chip"
          @click="$emit('select-history', name)"
        >
          {{ name }}
        </button>
      </div>

      <div class="entry-actions">
        <button class="primary" data-testid="login-submit" :disabled="entering" @click="$emit('submit')">
          <span data-testid="login-submit-label">{{ entering ? "进入中..." : primaryLabel }}</span>
        </button>
        <button class="ghost" data-testid="random-nickname" @click="$emit('randomize')">随机昵称</button>
        <button class="ghost" data-testid="open-rules" @click="$emit('open-rules')">查看规则</button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  nickname: string;
  entering: boolean;
  primaryLabel: string;
  historyNames: string[];
}>();

const emit = defineEmits<{
  "update:nickname": [value: string];
  submit: [];
  "open-rules": [];
  randomize: [];
  "select-history": [value: string];
}>();

function onInput(event: Event) {
  const value = (event.target as HTMLInputElement | null)?.value ?? "";
  emit("update:nickname", value);
}
</script>

<style scoped>
.entry-shell {
  background: #0b1220;
  border: 1px solid #1e293b;
  border-radius: 18px;
  padding: clamp(0.9rem, 2vh, 1.3rem);
  color: #e2e8f0;
  display: grid;
  gap: 1rem;
}

.entry-hero {
  display: grid;
  gap: 0.45rem;
}

.entry-kicker {
  margin: 0;
  color: #fbbf24;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.entry-hero h2 {
  margin: 0;
  font-size: clamp(1.2rem, 2.8vh, 1.6rem);
}

.entry-desc {
  margin: 0;
  color: #cbd5e1;
  max-width: 60ch;
  line-height: 1.65;
}

.entry-card {
  display: grid;
  gap: 0.85rem;
  padding: 1rem;
  border-radius: 16px;
  border: 1px solid #334155;
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.92));
}

.entry-field {
  display: grid;
  gap: 0.45rem;
}

.entry-field span {
  color: #bfdbfe;
  font-size: 0.85rem;
  font-weight: 600;
}

.entry-input {
  width: min(28rem, 100%);
  min-height: 2.8rem;
  border-radius: 12px;
  border: 1px solid #475569;
  background: #020617;
  color: #f8fafc;
  padding: 0.7rem 0.85rem;
  font-size: 1rem;
}

.entry-input:focus {
  outline: none;
  border-color: #38bdf8;
  box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.18);
}

.history-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.history-chip {
  border: 1px solid #334155;
  background: #172033;
  color: #cbd5e1;
  border-radius: 999px;
  padding: 0.35rem 0.75rem;
  cursor: pointer;
}

.entry-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
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
</style>

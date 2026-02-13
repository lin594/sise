<template>
  <section class="zone">
    <header class="header" @click="expanded = !expanded">
      <strong>{{ title }}</strong>
      <span>{{ expanded ? "收起" : "展开" }}</span>
    </header>
    <div class="cards" v-show="expanded">
      <CardComp v-for="card in cards" :key="card.id" :card="card" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from "vue";
import type { Card } from "@/types/game";
import CardComp from "./Card.vue";

defineProps<{
  title: string;
  cards: Card[];
}>();

const expanded = ref(true);
</script>

<style scoped>
.zone {
  border: 1px solid #334155;
  border-radius: 10px;
  background: #111827;
  padding: 8px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #e2e8f0;
  cursor: pointer;
  margin-bottom: 8px;
}

.cards {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
</style>

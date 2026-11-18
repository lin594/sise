<template>
  <div
    v-if="cardCount"
    class="opponent-rack"
    :data-card-count="cardCount"
    :style="{ '--rack-count': cardCount }"
    aria-hidden="true"
  >
    <span v-for="slot in cardCount" :key="slot" class="opponent-rack-card"></span>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ count: number }>();
const cardCount = computed(() => Number.isSafeInteger(props.count) ? Math.max(0, Math.min(112, props.count)) : 0);
</script>

<template>
  <div class="card-back" :class="`mode-${mode}`" :data-card-mode="mode" data-card-back="red-four-color" aria-hidden="true"></div>
</template>
<script setup lang="ts">
import type { RenderedCardMode } from "@/types/game";
withDefaults(defineProps<{ mode?: RenderedCardMode }>(), { mode: "large" });
</script>
<style scoped>
.card-back { width: 100%; height: 100%; box-sizing: border-box; border: 1px solid #f7b0a0; background: var(--card-back); border-radius: 6px; }
.card-back.mode-long { border-radius: var(--long-card-radius); }
</style>

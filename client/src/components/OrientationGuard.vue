<template>
  <div v-if="portrait" class="guard">
    <div class="panel">
      <h2>请横屏</h2>
      <p>该游戏需要横屏操作</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";

const portrait = ref(false);

function update() {
  portrait.value = window.matchMedia("(orientation: portrait)").matches;
}

onMounted(() => {
  update();
  window.addEventListener("resize", update);
  window.addEventListener("orientationchange", update);
  const orientation = (screen as Screen & { orientation?: { lock?: (kind: string) => Promise<void> } }).orientation;
  if (orientation?.lock) {
    orientation.lock("landscape").catch(() => {
      // Ignore unsupported browsers and permission failures.
    });
  }
});

onUnmounted(() => {
  window.removeEventListener("resize", update);
  window.removeEventListener("orientationchange", update);
});
</script>

<style scoped>
.guard {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.98);
  z-index: 999;
  display: flex;
  align-items: center;
  justify-content: center;
}

.panel {
  text-align: center;
  color: #fff;
}

@media (orientation: landscape) {
  .guard {
    display: none;
  }
}
</style>

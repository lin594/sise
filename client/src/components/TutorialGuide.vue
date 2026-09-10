<template>
  <aside class="tutorial-guide" data-testid="tutorial-guide" :data-step="step" aria-label="教学进度">
    <p role="status" aria-live="polite">{{ copy }}</p>
    <button v-if="step === 'intro'" type="button" @click="$emit('next')">开始演练</button>
    <button v-if="step === 'retry'" type="button" @click="$emit('restart')">重新演练</button>
  </aside>
</template>
<script setup lang="ts">
import { computed } from "vue";
const props = defineProps<{ step: string; actions: Array<{ action: string; enabled?: boolean }> }>();
defineEmits<{ next: []; restart: [] }>();
const copy = computed(() => {
  const expected: Record<string, string> = { grab: "pass", eat: "chi", peng: "peng", hu: "hu" };
  const action = expected[props.step];
  if (action && !props.actions.some(item => item.action === action && item.enabled !== false)) return "正在继续牌局，请稍候…";
  return ({
    intro: "1/7 认牌：先看颜色，再看字。这局用少量牌练习基本操作，不计入战绩。",
    grab: "2/7 中央这张白卒用不上，点「抓」从牌堆翻一张。",
    eat: "3/7 红车、红马、红炮可成组。点「吃」收下红炮。",
    discard_chi: "4/7 吃后要弃一张。选白仕，再点「出牌」。",
    peng: "5/7 两张绿马遇到第三张可「碰」。三张遇到第四张可「开」。现在点碰。",
    discard_peng: "6/7 碰后也要弃一张。选白炮，再点「出牌」。",
    hu: "7/7 黄车、黄马遇到黄炮，手牌全部成组。点「胡」查看结算。",
    complete: "演练完成：小胡赢家坐庄；含鱼或开为大胡，由赢家对家翻牌定庄。",
    retry: "你选择了另一种合法走法。可继续体验，或重新演练这段抓、吃、碰、胡。",
  } as Record<string, string>)[props.step] ?? "";
});
</script>
<style scoped>
.tutorial-guide { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border: 1px solid #c5a46b; border-radius: 10px; background: #fff9e9; color: #3d3020; font-size: 13px; max-width: 100%; }
p { margin: 0; flex: 1; }
button { flex-shrink: 0; min-height: 36px; border-radius: 6px; }
@media (max-height: 400px) { .tutorial-guide { font-size: 11px; padding: 3px 6px; } }
</style>

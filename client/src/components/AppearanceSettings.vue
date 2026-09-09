<template>
  <div class="appearance-settings">
    <fieldset v-if="section !== 'layout'"><legend>皮肤</legend><div class="appearance-options" role="radiogroup" aria-label="皮肤">
      <button v-for="skin in skins" :key="skin.id" type="button" role="radio" :aria-checked="modelValue.skin === skin.id" :data-testid="`skin-${skin.id}`" @click="emit('update:modelValue', { ...modelValue, skin: skin.id })">
        <span class="skin-preview" :data-skin="skin.id" aria-hidden="true"><i>将</i><i>相</i></span>
        <strong>{{ skin.name }}</strong><small>{{ skin.description }}</small>
      </button>
    </div></fieldset>
    <fieldset v-if="section !== 'appearance'"><legend>牌桌布局</legend><div class="appearance-options" role="radiogroup" aria-label="牌桌布局">
      <button v-for="layout in tableLayouts" :key="layout.id" type="button" role="radio" :aria-checked="modelValue.tableLayout === layout.id" :data-testid="`layout-${layout.id}`" @click="emit('update:modelValue', { ...modelValue, tableLayout: layout.id })">
        <span class="layout-preview" :class="layout.id" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
        <strong>{{ layout.name }}</strong><small>{{ layout.id === "adaptive" ? `当前${tableLayouts.find(item => item.id === resolvedLayout)?.name ?? "经典布局"}` : layout.description }}</small>
      </button>
    </div></fieldset>
  </div>
</template>
<script setup lang="ts">
import type { GameDisplayPreferences, RenderedTableLayoutId } from "@/types/game";
import { skins, tableLayouts } from "@/utils/appearance";
defineProps<{ modelValue: GameDisplayPreferences; section?: "appearance" | "layout"; resolvedLayout?: RenderedTableLayoutId }>();
const emit = defineEmits<{ 'update:modelValue': [value: GameDisplayPreferences] }>();
</script>
<style scoped>
fieldset { border: 0; padding: 0; margin: .8rem 0; min-width: 0; }
legend { font-weight: 700; margin-bottom: .5rem; }
.appearance-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .45rem; }
button { min-width: 0; padding: .5rem; border: 1px solid var(--ui-border, #475569); border-radius: .6rem; background: var(--ui-panel, #0f172a); color: var(--ui-text, #e2e8f0); cursor: pointer; text-align: left; }
button[aria-checked="true"] { border-color: var(--ui-accent-text, #38bdf8); box-shadow: inset 0 0 0 1px var(--ui-accent, #38bdf8); }
strong, small { display: block; } small { font-size: 13px; margin-top: .2rem; }
.skin-preview { display: flex; justify-content: center; gap: .3rem; padding: .45rem; background: var(--ui-table, #14332d); border-radius: .4rem; margin-bottom: .4rem; }
.skin-preview i { font-style: normal; background: #f2cc54; color: #23170e; padding: .4rem .2rem; border-radius: 50% / 20%; } .skin-preview i + i { background: #f6efdd; }
.layout-preview { position: relative; display: block; height: 44px; margin-bottom: .4rem; border: 1px solid currentColor; border-radius: .3rem; opacity: .75; }
.layout-preview i { position: absolute; width: 24%; height: 10px; background: currentColor; border-radius: 2px; }
.layout-preview i:nth-child(1) { left: 38%; top: 3px; }.layout-preview i:nth-child(2) { left: 3%; top: 16px; }.layout-preview i:nth-child(3) { right: 3%; top: 16px; }.layout-preview i:nth-child(4) { left: 25%; width: 50%; bottom: 3px; }
.layout-preview.classic { border-radius: 35%; }.layout-preview.classic i:nth-child(2), .layout-preview.classic i:nth-child(3) { width: 16%; height: 18px; top: 12px; }
.layout-preview.mahjong { border-width: 2px; }
.layout-preview.mahjong::after { content: ""; position: absolute; inset: 16px 44%; border: 1px solid currentColor; }
.layout-preview.mahjong i:nth-child(1) { left: 37%; width: 26%; top: 7px; height: 6px; }
.layout-preview.mahjong i:nth-child(2) { left: 24%; top: 14px; width: 7%; height: 17px; }
.layout-preview.mahjong i:nth-child(3) { right: 24%; top: 14px; width: 7%; height: 17px; }
.layout-preview.mahjong i:nth-child(4) { left: 37%; width: 26%; bottom: 7px; height: 6px; }
</style>

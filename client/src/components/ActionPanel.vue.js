import { computed, ref } from "vue";
const props = defineProps();
const emit = defineEmits();
const busy = ref(false);
const defaultOrder = ["hu", "open", "peng", "eat", "grab", "pass"];
const normalized = computed(() => {
    const map = new Map(props.actions.map((x) => [x.action, x.enabled]));
    return defaultOrder
        .filter((action) => map.has(action))
        .map((action) => ({ action, enabled: Boolean(map.get(action)) }));
});
function text(action) {
    const map = {
        hu: "胡",
        open: "开",
        peng: "碰",
        eat: "吃",
        grab: "抓",
        pass: "过",
    };
    return map[action];
}
function onClick(action) {
    busy.value = true;
    emit("submit", action);
    window.setTimeout(() => {
        busy.value = false;
    }, 220);
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "panel" },
});
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.normalized))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.onClick(item.action);
            } },
        key: (item.action),
        ...{ class: "btn" },
        ...{ class: ({ enabled: item.enabled }) },
        disabled: (!item.enabled || __VLS_ctx.busy),
    });
    (__VLS_ctx.text(item.action));
}
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            busy: busy,
            normalized: normalized,
            text: text,
            onClick: onClick,
        };
    },
    __typeEmits: {},
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */

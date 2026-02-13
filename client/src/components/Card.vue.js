import { computed } from "vue";
const props = defineProps();
const labelMap = {
    jiang: "将",
    shi: "士",
    xiang: "象",
    ju: "车",
    ma: "马",
    pao: "炮",
    zu: "卒",
    gong: "公",
    hou: "侯",
    bo: "伯",
    zi: "子",
    nan: "男",
};
const colorMap = {
    yellow: "黄",
    red: "红",
    green: "绿",
    white: "白",
    gold: "金",
};
const label = computed(() => `${colorMap[props.card.color] ?? "?"}${labelMap[props.card.type] ?? props.card.type}`);
const colorClass = computed(() => `color-${props.card.color}`);
const isResponseCard = computed(() => Boolean(props.card.isResponseCard));
const sizeClass = computed(() => props.size ?? "md");
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['card']} */ ;
/** @type {__VLS_StyleScopedClasses['card']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "card" },
    ...{ class: ([__VLS_ctx.colorClass, `size-${__VLS_ctx.sizeClass}`, { response: __VLS_ctx.isResponseCard }]) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "text" },
});
(__VLS_ctx.label);
if (__VLS_ctx.isResponseCard) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "star" },
    });
}
/** @type {__VLS_StyleScopedClasses['card']} */ ;
/** @type {__VLS_StyleScopedClasses['text']} */ ;
/** @type {__VLS_StyleScopedClasses['star']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            label: label,
            colorClass: colorClass,
            isResponseCard: isResponseCard,
            sizeClass: sizeClass,
        };
    },
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */

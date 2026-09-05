import { computed } from "vue";
import { getCardAccessibleText, getCardFaceText } from "@/utils/cardText";
const props = defineProps();
const label = computed(() => getCardFaceText(props.card));
const colorSeal = computed(() => ({
    yellow: "黄",
    red: "红",
    green: "绿",
    white: "白",
    gold: "金",
}[props.card.color] ?? ""));
const accessibleLabel = computed(() => getCardAccessibleText(props.card));
const colorClass = computed(() => `color-${props.card.color}`);
const isResponseCard = computed(() => Boolean(props.card.isResponseCard));
const sizeClass = computed(() => props.size ?? "md");
const modeClass = computed(() => props.mode ?? "long");
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['mode-large']} */ ;
/** @type {__VLS_StyleScopedClasses['color-seal']} */ ;
/** @type {__VLS_StyleScopedClasses['color-seal']} */ ;
/** @type {__VLS_StyleScopedClasses['mode-long']} */ ;
/** @type {__VLS_StyleScopedClasses['mode-long']} */ ;
/** @type {__VLS_StyleScopedClasses['text-top']} */ ;
/** @type {__VLS_StyleScopedClasses['mode-long']} */ ;
/** @type {__VLS_StyleScopedClasses['color-seal']} */ ;
/** @type {__VLS_StyleScopedClasses['color-seal']} */ ;
/** @type {__VLS_StyleScopedClasses['size-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['mode-long']} */ ;
/** @type {__VLS_StyleScopedClasses['size-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['mode-large']} */ ;
/** @type {__VLS_StyleScopedClasses['size-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['mode-large']} */ ;
/** @type {__VLS_StyleScopedClasses['size-md']} */ ;
/** @type {__VLS_StyleScopedClasses['mode-large']} */ ;
/** @type {__VLS_StyleScopedClasses['size-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['mode-large']} */ ;
/** @type {__VLS_StyleScopedClasses['size-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['size-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['mode-large']} */ ;
/** @type {__VLS_StyleScopedClasses['card']} */ ;
/** @type {__VLS_StyleScopedClasses['text-top']} */ ;
/** @type {__VLS_StyleScopedClasses['text-bottom']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "card" },
    ...{ class: ([__VLS_ctx.colorClass, `size-${__VLS_ctx.sizeClass}`, `mode-${__VLS_ctx.modeClass}`, { 'response-card': __VLS_ctx.isResponseCard }]) },
    'data-card-mode': (__VLS_ctx.modeClass),
    'data-face-id': (__VLS_ctx.card.id),
    role: "img",
    'aria-label': (__VLS_ctx.accessibleLabel),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "color-seal" },
    'aria-hidden': "true",
});
(__VLS_ctx.colorSeal);
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "text text-top" },
});
(__VLS_ctx.label);
if (__VLS_ctx.modeClass === 'long') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "text text-bottom" },
    });
    (__VLS_ctx.label);
}
/** @type {__VLS_StyleScopedClasses['card']} */ ;
/** @type {__VLS_StyleScopedClasses['color-seal']} */ ;
/** @type {__VLS_StyleScopedClasses['text']} */ ;
/** @type {__VLS_StyleScopedClasses['text-top']} */ ;
/** @type {__VLS_StyleScopedClasses['text']} */ ;
/** @type {__VLS_StyleScopedClasses['text-bottom']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            label: label,
            colorSeal: colorSeal,
            accessibleLabel: accessibleLabel,
            colorClass: colorClass,
            isResponseCard: isResponseCard,
            sizeClass: sizeClass,
            modeClass: modeClass,
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

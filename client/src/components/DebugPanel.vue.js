const __VLS_props = defineProps();
const __VLS_emit = defineEmits();
const scenarios = [
    { key: "hu_ready_mode2", label: "开局可胡（模式2）" },
    { key: "mode2_pass", label: "模式2 过牌" },
    { key: "collective_no_actions", label: "他人待响可过" },
    { key: "hu_fail_case", label: "单将胡失败" },
    { key: "discard_public", label: "弃牌区公开演示" },
];
function labelOf(key) {
    return scenarios.find((x) => x.key === key)?.label ?? key;
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['result']} */ ;
/** @type {__VLS_StyleScopedClasses['result']} */ ;
/** @type {__VLS_StyleScopedClasses['result']} */ ;
/** @type {__VLS_StyleScopedClasses['result']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "debug" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "list" },
});
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.scenarios))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.$emit('run', item.key);
            } },
        key: (item.key),
        ...{ class: "btn" },
    });
    (item.label);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "tips" },
});
(__VLS_ctx.hint);
if (__VLS_ctx.result) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "result" },
        ...{ class: (__VLS_ctx.result.ok ? 'ok' : 'fail') },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.result.ok ? "PASS" : "FAIL");
    (__VLS_ctx.labelOf(__VLS_ctx.result.scenario));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    (__VLS_ctx.result.summary);
    if (__VLS_ctx.result.errors.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.ul, __VLS_intrinsicElements.ul)({});
        for (const [err] of __VLS_getVForSourceType((__VLS_ctx.result.errors))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({
                key: (err),
            });
            (err);
        }
    }
}
/** @type {__VLS_StyleScopedClasses['debug']} */ ;
/** @type {__VLS_StyleScopedClasses['list']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['tips']} */ ;
/** @type {__VLS_StyleScopedClasses['result']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            scenarios: scenarios,
            labelOf: labelOf,
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

import { computed } from "vue";
const props = defineProps();
const __VLS_emit = defineEmits();
const copy = computed(() => {
    const expected = { grab: "pass", eat: "chi", peng: "peng", hu: "hu" };
    const action = expected[props.step];
    if (action && !props.actions.some(item => item.action === action && item.enabled !== false))
        return "正在继续牌局，请稍候…";
    return {
        intro: "1/7 认牌：先看颜色，再看字。演练使用缩短手牌，不计入战绩。",
        grab: "2/7 中央是待响应牌。白卒不合用，点「抓」从牌堆翻一张。",
        eat: "3/7 红车、红马、红炮可成组。点「吃」收下红炮。",
        discard_chi: "4/7 吃后要弃一张。选白仕，再点「出牌」。",
        peng: "5/7 两张绿马遇到第三张可「碰」。三张遇到第四张可「开」。现在点碰。",
        discard_peng: "6/7 碰后也要弃一张。选白炮，再点「出牌」。",
        hu: "7/7 黄车、黄马遇到黄炮，手牌全部成组。点「胡」查看结算。",
        complete: "演练完成：小胡赢家坐庄；含鱼或开为大胡，由赢家对家翻牌定庄。",
        retry: "你选择了另一种合法走法。可继续体验，或重新演练这段抓、吃、碰、胡。",
    }[props.step] ?? "";
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['tutorial-guide']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
    ...{ class: "tutorial-guide" },
    'data-testid': "tutorial-guide",
    'data-step': (__VLS_ctx.step),
    'aria-label': "教学进度",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    role: "status",
    'aria-live': "polite",
});
(__VLS_ctx.copy);
if (__VLS_ctx.step === 'intro') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.step === 'intro'))
                    return;
                __VLS_ctx.$emit('next');
            } },
        type: "button",
    });
}
if (__VLS_ctx.step === 'retry') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.step === 'retry'))
                    return;
                __VLS_ctx.$emit('restart');
            } },
        type: "button",
    });
}
/** @type {__VLS_StyleScopedClasses['tutorial-guide']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            copy: copy,
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

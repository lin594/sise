import { onMounted, onUnmounted, ref } from "vue";
const portrait = ref(false);
function update() {
    portrait.value = window.matchMedia("(orientation: portrait)").matches;
}
onMounted(() => {
    update();
    window.addEventListener("resize", update);
    const orientation = screen.orientation;
    if (orientation?.lock) {
        orientation.lock("landscape").catch(() => {
            // Ignore unsupported browsers and permission failures.
        });
    }
});
onUnmounted(() => {
    window.removeEventListener("resize", update);
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
if (__VLS_ctx.portrait) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "guard" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "panel" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
}
/** @type {__VLS_StyleScopedClasses['guard']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            portrait: portrait,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */

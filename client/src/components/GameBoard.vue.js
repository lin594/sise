import { computed } from "vue";
import CardComp from "./Card.vue";
import DiscardZone from "./DiscardZone.vue";
const props = defineProps();
const responseCard = computed(() => {
    const card = props.state?.responseCard;
    if (!card?.id) {
        return null;
    }
    return card;
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "board" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "grid" },
});
for (const [player] of __VLS_getVForSourceType((__VLS_ctx.players))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        key: (player.clientId),
        ...{ class: "player" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
        ...{ class: "player-head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (player.name);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
    (player.declaredKongs);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "areas" },
    });
    /** @type {[typeof DiscardZone, ]} */ ;
    // @ts-ignore
    const __VLS_0 = __VLS_asFunctionalComponent(DiscardZone, new DiscardZone({
        title: (`${player.name} 弃牌区`),
        cards: (player.discardPile),
    }));
    const __VLS_1 = __VLS_0({
        title: (`${player.name} 弃牌区`),
        cards: (player.discardPile),
    }, ...__VLS_functionalComponentArgsRest(__VLS_0));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "exposed" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "cards" },
    });
    for (const [card] of __VLS_getVForSourceType((player.exposedArea))) {
        /** @type {[typeof CardComp, ]} */ ;
        // @ts-ignore
        const __VLS_3 = __VLS_asFunctionalComponent(CardComp, new CardComp({
            key: (`exp-${card.id}`),
            card: (card),
        }));
        const __VLS_4 = __VLS_3({
            key: (`exp-${card.id}`),
            card: (card),
        }, ...__VLS_functionalComponentArgsRest(__VLS_3));
    }
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "center" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
if (__VLS_ctx.responseCard) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "response-wrap" },
    });
    /** @type {[typeof CardComp, ]} */ ;
    // @ts-ignore
    const __VLS_6 = __VLS_asFunctionalComponent(CardComp, new CardComp({
        card: (__VLS_ctx.responseCard),
    }));
    const __VLS_7 = __VLS_6({
        card: (__VLS_ctx.responseCard),
    }, ...__VLS_functionalComponentArgsRest(__VLS_6));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
    (__VLS_ctx.responseCard.source === "draw" ? "抓取" : "上家");
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "hint" },
});
(__VLS_ctx.state?.lastAction || "等待中");
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "self" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "cards" },
});
for (const [card] of __VLS_getVForSourceType((__VLS_ctx.privateHand))) {
    /** @type {[typeof CardComp, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(CardComp, new CardComp({
        key: (`me-${card.id}`),
        card: (card),
    }));
    const __VLS_10 = __VLS_9({
        key: (`me-${card.id}`),
        card: (card),
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
}
/** @type {__VLS_StyleScopedClasses['board']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['player']} */ ;
/** @type {__VLS_StyleScopedClasses['player-head']} */ ;
/** @type {__VLS_StyleScopedClasses['areas']} */ ;
/** @type {__VLS_StyleScopedClasses['exposed']} */ ;
/** @type {__VLS_StyleScopedClasses['cards']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['response-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['hint']} */ ;
/** @type {__VLS_StyleScopedClasses['self']} */ ;
/** @type {__VLS_StyleScopedClasses['cards']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            CardComp: CardComp,
            DiscardZone: DiscardZone,
            responseCard: responseCard,
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

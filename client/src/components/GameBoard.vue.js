import { computed } from "vue";
import CardComp from "./Card.vue";
import DiscardZone from "./DiscardZone.vue";
const props = defineProps();
const emit = defineEmits();
const latestDiscardFromAction = computed(() => {
    const match = String(props.state?.lastAction ?? "").match(/^(\S+)\s+DISCARD$/);
    if (!match) {
        return null;
    }
    const ownerId = match[1];
    const owner = props.players.find((x) => x.clientId === ownerId);
    const latestDiscard = owner?.discardPile?.[0];
    if (latestDiscard?.id) {
        return { ...latestDiscard, source: "upper" };
    }
    const publicTop = props.state?.publicDiscardPile?.[0];
    if (publicTop?.id) {
        return { ...publicTop, source: "upper" };
    }
    return null;
});
const responseCard = computed(() => {
    const collective = props.state?.responsePhase === "collective";
    if (collective) {
        const publicTop = props.state?.publicDiscardPile?.[0];
        if (publicTop?.id) {
            return { ...publicTop, source: "upper" };
        }
        if (latestDiscardFromAction.value?.id) {
            return latestDiscardFromAction.value;
        }
    }
    const card = props.state?.responseCard;
    if (card?.id) {
        return card;
    }
    return latestDiscardFromAction.value;
});
const publicDiscardCards = computed(() => {
    const cards = props.state?.publicDiscardPile;
    if (Array.isArray(cards) && cards.length > 0) {
        return cards;
    }
    const latest = latestDiscardFromAction.value;
    return latest ? [latest] : [];
});
const currentPlayer = computed(() => {
    const playerId = props.state?.currentPlayerId;
    if (!playerId) {
        return null;
    }
    return props.players.find((x) => x.clientId === playerId) ?? null;
});
const currentPlayerName = computed(() => {
    const playerId = props.state?.currentPlayerId;
    if (!playerId) {
        return "-";
    }
    return currentPlayer.value?.name || playerId;
});
const isMyTurn = computed(() => Boolean(props.mySeatId) &&
    props.state?.currentPlayerId === props.mySeatId &&
    !Boolean(currentPlayer.value?.isBot));
const canDiscard = computed(() => Boolean(props.canDiscard));
function isCurrentTurn(playerId) {
    return props.state?.currentPlayerId === playerId;
}
function isMe(playerId) {
    return props.mySeatId === playerId;
}
function statusText(player) {
    if (player.isBot) {
        return "BOT托管";
    }
    return player.connected ? "在线" : "离线";
}
function canDiscardCard(card) {
    return canDiscard.value && card.type !== "jiang";
}
function onDiscard(cardId) {
    if (!canDiscard.value) {
        return;
    }
    emit("discardCard", cardId);
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['player']} */ ;
/** @type {__VLS_StyleScopedClasses['player']} */ ;
/** @type {__VLS_StyleScopedClasses['tag']} */ ;
/** @type {__VLS_StyleScopedClasses['me']} */ ;
/** @type {__VLS_StyleScopedClasses['tag']} */ ;
/** @type {__VLS_StyleScopedClasses['tag']} */ ;
/** @type {__VLS_StyleScopedClasses['exposed']} */ ;
/** @type {__VLS_StyleScopedClasses['fish']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['self']} */ ;
/** @type {__VLS_StyleScopedClasses['hand-card']} */ ;
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
        ...{ class: ({ active: __VLS_ctx.isCurrentTurn(player.clientId), me: __VLS_ctx.isMe(player.clientId) }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
        ...{ class: "player-head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "head-left" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (player.name);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
    (player.declaredKongs);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "tags" },
    });
    if (__VLS_ctx.isMe(player.clientId)) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "tag me" },
        });
    }
    if (__VLS_ctx.isCurrentTurn(player.clientId)) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "tag turn" },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "tag status" },
    });
    (__VLS_ctx.statusText(player));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "areas" },
    });
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
        const __VLS_0 = __VLS_asFunctionalComponent(CardComp, new CardComp({
            key: (`exp-${card.id}`),
            card: (card),
        }));
        const __VLS_1 = __VLS_0({
            key: (`exp-${card.id}`),
            card: (card),
        }, ...__VLS_functionalComponentArgsRest(__VLS_0));
    }
    if (player.generalArea.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "fish" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "cards" },
        });
        for (const [card] of __VLS_getVForSourceType((player.generalArea))) {
            /** @type {[typeof CardComp, ]} */ ;
            // @ts-ignore
            const __VLS_3 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                key: (`general-${card.id}`),
                card: (card),
            }));
            const __VLS_4 = __VLS_3({
                key: (`general-${card.id}`),
                card: (card),
            }, ...__VLS_functionalComponentArgsRest(__VLS_3));
        }
    }
    if (player.fishArea.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "fish" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "cards" },
        });
        for (const [card] of __VLS_getVForSourceType((player.fishArea))) {
            /** @type {[typeof CardComp, ]} */ ;
            // @ts-ignore
            const __VLS_6 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                key: (`fish-${card.id}`),
                card: (card),
            }));
            const __VLS_7 = __VLS_6({
                key: (`fish-${card.id}`),
                card: (card),
            }, ...__VLS_functionalComponentArgsRest(__VLS_6));
        }
    }
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "center" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "turn-line" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
(__VLS_ctx.currentPlayerName);
if (__VLS_ctx.isMyTurn) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
}
/** @type {[typeof DiscardZone, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(DiscardZone, new DiscardZone({
    title: "公共弃牌区",
    cards: (__VLS_ctx.publicDiscardCards),
}));
const __VLS_10 = __VLS_9({
    title: "公共弃牌区",
    cards: (__VLS_ctx.publicDiscardCards),
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
if (__VLS_ctx.responseCard) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "response-wrap" },
    });
    /** @type {[typeof CardComp, ]} */ ;
    // @ts-ignore
    const __VLS_12 = __VLS_asFunctionalComponent(CardComp, new CardComp({
        key: (`resp-${__VLS_ctx.responseCard.id}-${__VLS_ctx.responseCard.source || 'upper'}`),
        card: (__VLS_ctx.responseCard),
    }));
    const __VLS_13 = __VLS_12({
        key: (`resp-${__VLS_ctx.responseCard.id}-${__VLS_ctx.responseCard.source || 'upper'}`),
        card: (__VLS_ctx.responseCard),
    }, ...__VLS_functionalComponentArgsRest(__VLS_12));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
    (__VLS_ctx.responseCard.source === "draw" ? "摸牌" : "他人弃牌");
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "hint" },
});
(__VLS_ctx.state?.lastAction || "等待中...");
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "self" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
if (__VLS_ctx.canDiscard) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "discard-tip" },
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "cards hand" },
});
for (const [card] of __VLS_getVForSourceType((__VLS_ctx.privateHand))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.onDiscard(card.id);
            } },
        key: (`me-${card.id}`),
        ...{ class: "hand-card" },
        disabled: (!__VLS_ctx.canDiscardCard(card)),
    });
    /** @type {[typeof CardComp, ]} */ ;
    // @ts-ignore
    const __VLS_15 = __VLS_asFunctionalComponent(CardComp, new CardComp({
        card: (card),
    }));
    const __VLS_16 = __VLS_15({
        card: (card),
    }, ...__VLS_functionalComponentArgsRest(__VLS_15));
}
/** @type {__VLS_StyleScopedClasses['board']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['player']} */ ;
/** @type {__VLS_StyleScopedClasses['player-head']} */ ;
/** @type {__VLS_StyleScopedClasses['head-left']} */ ;
/** @type {__VLS_StyleScopedClasses['tags']} */ ;
/** @type {__VLS_StyleScopedClasses['tag']} */ ;
/** @type {__VLS_StyleScopedClasses['me']} */ ;
/** @type {__VLS_StyleScopedClasses['tag']} */ ;
/** @type {__VLS_StyleScopedClasses['turn']} */ ;
/** @type {__VLS_StyleScopedClasses['tag']} */ ;
/** @type {__VLS_StyleScopedClasses['status']} */ ;
/** @type {__VLS_StyleScopedClasses['areas']} */ ;
/** @type {__VLS_StyleScopedClasses['exposed']} */ ;
/** @type {__VLS_StyleScopedClasses['cards']} */ ;
/** @type {__VLS_StyleScopedClasses['fish']} */ ;
/** @type {__VLS_StyleScopedClasses['cards']} */ ;
/** @type {__VLS_StyleScopedClasses['fish']} */ ;
/** @type {__VLS_StyleScopedClasses['cards']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['turn-line']} */ ;
/** @type {__VLS_StyleScopedClasses['response-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['hint']} */ ;
/** @type {__VLS_StyleScopedClasses['self']} */ ;
/** @type {__VLS_StyleScopedClasses['discard-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['cards']} */ ;
/** @type {__VLS_StyleScopedClasses['hand']} */ ;
/** @type {__VLS_StyleScopedClasses['hand-card']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            CardComp: CardComp,
            DiscardZone: DiscardZone,
            responseCard: responseCard,
            publicDiscardCards: publicDiscardCards,
            currentPlayerName: currentPlayerName,
            isMyTurn: isMyTurn,
            canDiscard: canDiscard,
            isCurrentTurn: isCurrentTurn,
            isMe: isMe,
            statusText: statusText,
            canDiscardCard: canDiscardCard,
            onDiscard: onDiscard,
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

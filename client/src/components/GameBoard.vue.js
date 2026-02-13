import { computed } from "vue";
import CardComp from "./Card.vue";
const props = defineProps();
const emit = defineEmits();
const orderedPlayers = computed(() => {
    const list = props.players ?? [];
    if (!list.length) {
        return [];
    }
    const idx = list.findIndex((p) => p.clientId === props.mySeatId);
    if (idx < 0) {
        return list;
    }
    return [...list.slice(idx), ...list.slice(0, idx)];
});
const selfPlayer = computed(() => orderedPlayers.value[0] ?? null);
const rightPlayer = computed(() => orderedPlayers.value[1] ?? null);
const topPlayer = computed(() => orderedPlayers.value[2] ?? null);
const leftPlayer = computed(() => orderedPlayers.value[3] ?? null);
const seatEntries = computed(() => {
    const entries = [
        { position: "top", player: topPlayer.value },
        { position: "left", player: leftPlayer.value },
        { position: "right", player: rightPlayer.value },
    ];
    return entries
        .filter((x) => Boolean(x.player))
        .map((entry) => ({
        ...entry,
        openCards: [...entry.player.exposedArea, ...entry.player.generalArea],
    }));
});
const selfOpenCards = computed(() => {
    const player = selfPlayer.value;
    if (!player) {
        return [];
    }
    return [...player.exposedArea, ...player.generalArea];
});
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
/** @type {__VLS_StyleScopedClasses['seat']} */ ;
/** @type {__VLS_StyleScopedClasses['seat']} */ ;
/** @type {__VLS_StyleScopedClasses['seat']} */ ;
/** @type {__VLS_StyleScopedClasses['seat']} */ ;
/** @type {__VLS_StyleScopedClasses['seat']} */ ;
/** @type {__VLS_StyleScopedClasses['tag']} */ ;
/** @type {__VLS_StyleScopedClasses['tag']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-zone']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-zone']} */ ;
/** @type {__VLS_StyleScopedClasses['cards']} */ ;
/** @type {__VLS_StyleScopedClasses['center-head']} */ ;
/** @type {__VLS_StyleScopedClasses['center-head']} */ ;
/** @type {__VLS_StyleScopedClasses['response-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['self-head']} */ ;
/** @type {__VLS_StyleScopedClasses['self-head']} */ ;
/** @type {__VLS_StyleScopedClasses['self-area']} */ ;
/** @type {__VLS_StyleScopedClasses['self-area']} */ ;
/** @type {__VLS_StyleScopedClasses['cards']} */ ;
/** @type {__VLS_StyleScopedClasses['hand-card']} */ ;
/** @type {__VLS_StyleScopedClasses['hand-card']} */ ;
/** @type {__VLS_StyleScopedClasses['table']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['board']} */ ;
/** @type {__VLS_StyleScopedClasses['table']} */ ;
/** @type {__VLS_StyleScopedClasses['seat']} */ ;
/** @type {__VLS_StyleScopedClasses['seat']} */ ;
/** @type {__VLS_StyleScopedClasses['top']} */ ;
/** @type {__VLS_StyleScopedClasses['seat']} */ ;
/** @type {__VLS_StyleScopedClasses['left']} */ ;
/** @type {__VLS_StyleScopedClasses['seat']} */ ;
/** @type {__VLS_StyleScopedClasses['right']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['center-head']} */ ;
/** @type {__VLS_StyleScopedClasses['center-head']} */ ;
/** @type {__VLS_StyleScopedClasses['response-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['response-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['hint']} */ ;
/** @type {__VLS_StyleScopedClasses['ghost-card']} */ ;
/** @type {__VLS_StyleScopedClasses['self-zone']} */ ;
/** @type {__VLS_StyleScopedClasses['self-head']} */ ;
/** @type {__VLS_StyleScopedClasses['self-head']} */ ;
/** @type {__VLS_StyleScopedClasses['hand']} */ ;
/** @type {__VLS_StyleScopedClasses['board']} */ ;
/** @type {__VLS_StyleScopedClasses['table']} */ ;
/** @type {__VLS_StyleScopedClasses['seat']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['seat']} */ ;
/** @type {__VLS_StyleScopedClasses['top']} */ ;
/** @type {__VLS_StyleScopedClasses['seat']} */ ;
/** @type {__VLS_StyleScopedClasses['left']} */ ;
/** @type {__VLS_StyleScopedClasses['seat']} */ ;
/** @type {__VLS_StyleScopedClasses['right']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-zone']} */ ;
/** @type {__VLS_StyleScopedClasses['cards']} */ ;
/** @type {__VLS_StyleScopedClasses['self-area']} */ ;
/** @type {__VLS_StyleScopedClasses['cards']} */ ;
/** @type {__VLS_StyleScopedClasses['self-zone']} */ ;
/** @type {__VLS_StyleScopedClasses['self-areas']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "board" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "table" },
});
for (const [entry] of __VLS_getVForSourceType((__VLS_ctx.seatEntries))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        key: (entry.position),
        ...{ class: "seat" },
        ...{ class: ([entry.position, { active: __VLS_ctx.isCurrentTurn(entry.player.clientId), 'with-fish': entry.player.fishArea.length > 0 }]) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
        ...{ class: "seat-head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (entry.player.name);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "seat-tags" },
    });
    if (__VLS_ctx.isCurrentTurn(entry.player.clientId)) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "tag turn" },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "tag status" },
    });
    (__VLS_ctx.statusText(entry.player));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "seat-meta" },
    });
    (entry.player.declaredKongs);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "seat-zone" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    if (entry.openCards.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "cards" },
        });
        for (const [card] of __VLS_getVForSourceType((entry.openCards))) {
            /** @type {[typeof CardComp, ]} */ ;
            // @ts-ignore
            const __VLS_0 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                key: (`exp-${entry.player.clientId}-${card.id}`),
                card: (card),
                size: "sm",
            }));
            const __VLS_1 = __VLS_0({
                key: (`exp-${entry.player.clientId}-${card.id}`),
                card: (card),
                size: "sm",
            }, ...__VLS_functionalComponentArgsRest(__VLS_0));
        }
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "empty" },
        });
    }
    if (entry.player.fishArea.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "seat-zone" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        if (entry.player.fishArea.length) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "cards" },
            });
            for (const [card] of __VLS_getVForSourceType((entry.player.fishArea))) {
                /** @type {[typeof CardComp, ]} */ ;
                // @ts-ignore
                const __VLS_3 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                    key: (`fish-${entry.player.clientId}-${card.id}`),
                    card: (card),
                    size: "sm",
                }));
                const __VLS_4 = __VLS_3({
                    key: (`fish-${entry.player.clientId}-${card.id}`),
                    card: (card),
                    size: "sm",
                }, ...__VLS_functionalComponentArgsRest(__VLS_3));
            }
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "empty" },
            });
        }
    }
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "center" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "center-head" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
(__VLS_ctx.currentPlayerName);
if (__VLS_ctx.isMyTurn) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
}
if (__VLS_ctx.responseCard) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "response-wrap" },
    });
    /** @type {[typeof CardComp, ]} */ ;
    // @ts-ignore
    const __VLS_6 = __VLS_asFunctionalComponent(CardComp, new CardComp({
        key: (`resp-${__VLS_ctx.responseCard.id}-${__VLS_ctx.responseCard.source || 'upper'}`),
        card: (__VLS_ctx.responseCard),
        size: "lg",
    }));
    const __VLS_7 = __VLS_6({
        key: (`resp-${__VLS_ctx.responseCard.id}-${__VLS_ctx.responseCard.source || 'upper'}`),
        card: (__VLS_ctx.responseCard),
        size: "lg",
    }, ...__VLS_functionalComponentArgsRest(__VLS_6));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
    (__VLS_ctx.responseCard.source === "draw" ? "摸牌" : "他人弃牌");
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "response-wrap response-empty" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "ghost-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "hint" },
});
(__VLS_ctx.state?.lastAction || "等待中...");
if (__VLS_ctx.selfPlayer) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "self-zone" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
        ...{ class: "self-head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
    (__VLS_ctx.selfPlayer.name);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    (__VLS_ctx.selfPlayer.declaredKongs);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "seat-tags" },
    });
    if (__VLS_ctx.isMyTurn) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "tag turn" },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "tag status" },
    });
    (__VLS_ctx.statusText(__VLS_ctx.selfPlayer));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "self-areas" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "self-area" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    if (__VLS_ctx.selfOpenCards.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "cards" },
        });
        for (const [card] of __VLS_getVForSourceType((__VLS_ctx.selfOpenCards))) {
            /** @type {[typeof CardComp, ]} */ ;
            // @ts-ignore
            const __VLS_9 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                key: (`self-exp-${card.id}`),
                card: (card),
            }));
            const __VLS_10 = __VLS_9({
                key: (`self-exp-${card.id}`),
                card: (card),
            }, ...__VLS_functionalComponentArgsRest(__VLS_9));
        }
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "empty" },
        });
    }
    if (__VLS_ctx.selfPlayer.fishArea.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "self-area" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        if (__VLS_ctx.selfPlayer.fishArea.length) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "cards" },
            });
            for (const [card] of __VLS_getVForSourceType((__VLS_ctx.selfPlayer.fishArea))) {
                /** @type {[typeof CardComp, ]} */ ;
                // @ts-ignore
                const __VLS_12 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                    key: (`self-fish-${card.id}`),
                    card: (card),
                }));
                const __VLS_13 = __VLS_12({
                    key: (`self-fish-${card.id}`),
                    card: (card),
                }, ...__VLS_functionalComponentArgsRest(__VLS_12));
            }
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "empty" },
            });
        }
    }
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
                    if (!(__VLS_ctx.selfPlayer))
                        return;
                    __VLS_ctx.onDiscard(card.id);
                } },
            key: (`me-${card.id}`),
            ...{ class: "hand-card" },
            ...{ class: ({ playable: __VLS_ctx.canDiscardCard(card), blocked: !__VLS_ctx.canDiscardCard(card) }) },
            disabled: (!__VLS_ctx.canDiscardCard(card)),
        });
        /** @type {[typeof CardComp, ]} */ ;
        // @ts-ignore
        const __VLS_15 = __VLS_asFunctionalComponent(CardComp, new CardComp({
            card: (card),
            size: "xl",
        }));
        const __VLS_16 = __VLS_15({
            card: (card),
            size: "xl",
        }, ...__VLS_functionalComponentArgsRest(__VLS_15));
    }
}
/** @type {__VLS_StyleScopedClasses['board']} */ ;
/** @type {__VLS_StyleScopedClasses['table']} */ ;
/** @type {__VLS_StyleScopedClasses['seat']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-head']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-tags']} */ ;
/** @type {__VLS_StyleScopedClasses['tag']} */ ;
/** @type {__VLS_StyleScopedClasses['turn']} */ ;
/** @type {__VLS_StyleScopedClasses['tag']} */ ;
/** @type {__VLS_StyleScopedClasses['status']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-zone']} */ ;
/** @type {__VLS_StyleScopedClasses['cards']} */ ;
/** @type {__VLS_StyleScopedClasses['empty']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-zone']} */ ;
/** @type {__VLS_StyleScopedClasses['cards']} */ ;
/** @type {__VLS_StyleScopedClasses['empty']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['center-head']} */ ;
/** @type {__VLS_StyleScopedClasses['response-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['response-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['response-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['ghost-card']} */ ;
/** @type {__VLS_StyleScopedClasses['hint']} */ ;
/** @type {__VLS_StyleScopedClasses['self-zone']} */ ;
/** @type {__VLS_StyleScopedClasses['self-head']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-tags']} */ ;
/** @type {__VLS_StyleScopedClasses['tag']} */ ;
/** @type {__VLS_StyleScopedClasses['turn']} */ ;
/** @type {__VLS_StyleScopedClasses['tag']} */ ;
/** @type {__VLS_StyleScopedClasses['status']} */ ;
/** @type {__VLS_StyleScopedClasses['self-areas']} */ ;
/** @type {__VLS_StyleScopedClasses['self-area']} */ ;
/** @type {__VLS_StyleScopedClasses['cards']} */ ;
/** @type {__VLS_StyleScopedClasses['empty']} */ ;
/** @type {__VLS_StyleScopedClasses['self-area']} */ ;
/** @type {__VLS_StyleScopedClasses['cards']} */ ;
/** @type {__VLS_StyleScopedClasses['empty']} */ ;
/** @type {__VLS_StyleScopedClasses['discard-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['cards']} */ ;
/** @type {__VLS_StyleScopedClasses['hand']} */ ;
/** @type {__VLS_StyleScopedClasses['hand-card']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            CardComp: CardComp,
            selfPlayer: selfPlayer,
            seatEntries: seatEntries,
            selfOpenCards: selfOpenCards,
            responseCard: responseCard,
            currentPlayerName: currentPlayerName,
            isMyTurn: isMyTurn,
            canDiscard: canDiscard,
            isCurrentTurn: isCurrentTurn,
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

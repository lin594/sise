import type { ActionFeedback, ActionRequest, ActionType, AvailableAction, Card, DecisionTimerState, ParsedActionLog, PlayerState, RoomStateSnapshot, RoomConnectionState, RoundResultPayload } from "@/types/game";
type ConnectOptions = {
    nameOverride?: string;
    roomId?: string;
    playerToken?: string;
    hostKey?: string;
    forceNew?: boolean;
    reconnecting?: boolean;
    preserveState?: boolean;
    matchmaking?: boolean;
    exposeRoomIdInUrl?: boolean;
};
export declare function useRoom(playerName?: string): {
    connected: import("vue").Ref<boolean, boolean>;
    connectionState: import("vue").Ref<RoomConnectionState, RoomConnectionState>;
    reconnectAttempt: import("vue").Ref<number, number>;
    myId: import("vue").Ref<string, string>;
    mySeatId: import("vue").Ref<string, string>;
    playerToken: import("vue").Ref<string, string>;
    activeRoomId: import("vue").Ref<string, string>;
    state: import("vue").Ref<{
        roomId?: string | undefined;
        roomMode: "practice" | "friends" | "match";
        scoringMode: import("@/types/game").ScoringMode;
        completedRounds: number;
        phase: string;
        serverNow?: number | undefined;
        matchStartsAt: number;
        hostPlayerId: string;
        dealerId: string;
        dealerPickerId?: string | undefined;
        currentPlayerId: string;
        currentTurnPlayerId: string;
        previousPlayerId: string;
        pollOriginPlayerId?: string | undefined;
        activeResponderId?: string | undefined;
        responsePhase: string;
        responseEndsAt: number;
        lastAction: string;
        deckCount: number;
        isMoCard: boolean;
        targetCard: {
            id: string;
            color: string;
            type: string;
            source?: "upper" | "draw" | undefined;
            isResponseCard?: boolean | undefined;
        } | null;
        responseCard: {
            id: string;
            color: string;
            type: string;
            source?: "upper" | "draw" | undefined;
            isResponseCard?: boolean | undefined;
        } | null;
        dealerCard?: {
            id: string;
            color: string;
            type: string;
            source?: "upper" | "draw" | undefined;
            isResponseCard?: boolean | undefined;
        } | null | undefined;
        publicDiscardPile: {
            id: string;
            color: string;
            type: string;
            source?: "upper" | "draw" | undefined;
            isResponseCard?: boolean | undefined;
        }[];
        publicGeneralPool?: {
            id: string;
            color: string;
            type: string;
            source?: "upper" | "draw" | undefined;
            isResponseCard?: boolean | undefined;
        }[] | undefined;
        declareEndsAt: number;
        players: {
            clientId: string;
            seatIndex: number;
            name: string;
            handCount?: number | undefined;
            declaredKongs: number;
            declaredReady: boolean;
            lobbyReady: boolean;
            isBot: boolean;
            isAutoPlay: boolean;
            isConfiguredBot: boolean;
            botStrength: number;
            cumulativeScore: number;
            connected: boolean;
            discardPile: {
                id: string;
                color: string;
                type: string;
                source?: "upper" | "draw" | undefined;
                isResponseCard?: boolean | undefined;
            }[];
            exposedArea: {
                id: string;
                color: string;
                type: string;
                source?: "upper" | "draw" | undefined;
                isResponseCard?: boolean | undefined;
            }[];
            exposedGroupSizes: number[];
            exposedGroupKinds: string[];
            generalArea: {
                id: string;
                color: string;
                type: string;
                source?: "upper" | "draw" | undefined;
                isResponseCard?: boolean | undefined;
            }[];
            wildcardPool: {
                id: string;
                color: string;
                type: string;
                source?: "upper" | "draw" | undefined;
                isResponseCard?: boolean | undefined;
            }[];
            fishArea: {
                id: string;
                color: string;
                type: string;
                source?: "upper" | "draw" | undefined;
                isResponseCard?: boolean | undefined;
            }[];
        }[];
        privateHand?: {
            id: string;
            color: string;
            type: string;
            source?: "upper" | "draw" | undefined;
            isResponseCard?: boolean | undefined;
        }[] | undefined;
        availableActions?: {
            action: ActionType;
            enabled: boolean;
            candidates?: {
                id: string;
                action: "kai" | "peng" | "chi";
                kind?: string | undefined;
                cardIds: string[];
                source: "hand" | "hand+pool";
                title: string;
            }[] | undefined;
            deferred?: boolean | undefined;
        }[] | undefined;
        roundResult?: {
            winnerId: string | null;
            groups: string[];
            players: {
                clientId: string;
                name: string;
                isConfiguredBot: boolean;
                hand: {
                    id: string;
                    color: string;
                    type: string;
                    source?: "upper" | "draw" | undefined;
                    isResponseCard?: boolean | undefined;
                }[];
                declaredKongs: number;
                huType?: "small" | "big" | null | undefined;
                winningGroups: {
                    key: string;
                    cards: {
                        id: string;
                        color: string;
                        type: string;
                        source?: "upper" | "draw" | undefined;
                        isResponseCard?: boolean | undefined;
                    }[];
                }[];
                resolvedHandGroups: {
                    key: string;
                    cards: {
                        id: string;
                        color: string;
                        type: string;
                        source?: "upper" | "draw" | undefined;
                        isResponseCard?: boolean | undefined;
                    }[];
                }[];
                exposedArea: {
                    id: string;
                    color: string;
                    type: string;
                    source?: "upper" | "draw" | undefined;
                    isResponseCard?: boolean | undefined;
                }[];
                exposedGroupSizes: number[];
                exposedGroupKinds: string[];
                generalArea: {
                    id: string;
                    color: string;
                    type: string;
                    source?: "upper" | "draw" | undefined;
                    isResponseCard?: boolean | undefined;
                }[];
                fishArea: {
                    id: string;
                    color: string;
                    type: string;
                    source?: "upper" | "draw" | undefined;
                    isResponseCard?: boolean | undefined;
                }[];
                discardCount: number;
                scoreBreakdown: {
                    key: string;
                    label: string;
                    count: number;
                    unit: number;
                    total: number;
                }[];
                totalScore: number;
                cumulativeScore: number;
            }[];
            remainingDeck?: {
                id: string;
                color: string;
                type: string;
                source?: "upper" | "draw" | undefined;
                isResponseCard?: boolean | undefined;
            }[] | undefined;
            scoringMode: import("@/types/game").ScoringMode;
            roundNumber: number;
        } | null | undefined;
    } | null, RoomStateSnapshot | {
        roomId?: string | undefined;
        roomMode: "practice" | "friends" | "match";
        scoringMode: import("@/types/game").ScoringMode;
        completedRounds: number;
        phase: string;
        serverNow?: number | undefined;
        matchStartsAt: number;
        hostPlayerId: string;
        dealerId: string;
        dealerPickerId?: string | undefined;
        currentPlayerId: string;
        currentTurnPlayerId: string;
        previousPlayerId: string;
        pollOriginPlayerId?: string | undefined;
        activeResponderId?: string | undefined;
        responsePhase: string;
        responseEndsAt: number;
        lastAction: string;
        deckCount: number;
        isMoCard: boolean;
        targetCard: {
            id: string;
            color: string;
            type: string;
            source?: "upper" | "draw" | undefined;
            isResponseCard?: boolean | undefined;
        } | null;
        responseCard: {
            id: string;
            color: string;
            type: string;
            source?: "upper" | "draw" | undefined;
            isResponseCard?: boolean | undefined;
        } | null;
        dealerCard?: {
            id: string;
            color: string;
            type: string;
            source?: "upper" | "draw" | undefined;
            isResponseCard?: boolean | undefined;
        } | null | undefined;
        publicDiscardPile: {
            id: string;
            color: string;
            type: string;
            source?: "upper" | "draw" | undefined;
            isResponseCard?: boolean | undefined;
        }[];
        publicGeneralPool?: {
            id: string;
            color: string;
            type: string;
            source?: "upper" | "draw" | undefined;
            isResponseCard?: boolean | undefined;
        }[] | undefined;
        declareEndsAt: number;
        players: {
            clientId: string;
            seatIndex: number;
            name: string;
            handCount?: number | undefined;
            declaredKongs: number;
            declaredReady: boolean;
            lobbyReady: boolean;
            isBot: boolean;
            isAutoPlay: boolean;
            isConfiguredBot: boolean;
            botStrength: number;
            cumulativeScore: number;
            connected: boolean;
            discardPile: {
                id: string;
                color: string;
                type: string;
                source?: "upper" | "draw" | undefined;
                isResponseCard?: boolean | undefined;
            }[];
            exposedArea: {
                id: string;
                color: string;
                type: string;
                source?: "upper" | "draw" | undefined;
                isResponseCard?: boolean | undefined;
            }[];
            exposedGroupSizes: number[];
            exposedGroupKinds: string[];
            generalArea: {
                id: string;
                color: string;
                type: string;
                source?: "upper" | "draw" | undefined;
                isResponseCard?: boolean | undefined;
            }[];
            wildcardPool: {
                id: string;
                color: string;
                type: string;
                source?: "upper" | "draw" | undefined;
                isResponseCard?: boolean | undefined;
            }[];
            fishArea: {
                id: string;
                color: string;
                type: string;
                source?: "upper" | "draw" | undefined;
                isResponseCard?: boolean | undefined;
            }[];
        }[];
        privateHand?: {
            id: string;
            color: string;
            type: string;
            source?: "upper" | "draw" | undefined;
            isResponseCard?: boolean | undefined;
        }[] | undefined;
        availableActions?: {
            action: ActionType;
            enabled: boolean;
            candidates?: {
                id: string;
                action: "kai" | "peng" | "chi";
                kind?: string | undefined;
                cardIds: string[];
                source: "hand" | "hand+pool";
                title: string;
            }[] | undefined;
            deferred?: boolean | undefined;
        }[] | undefined;
        roundResult?: {
            winnerId: string | null;
            groups: string[];
            players: {
                clientId: string;
                name: string;
                isConfiguredBot: boolean;
                hand: {
                    id: string;
                    color: string;
                    type: string;
                    source?: "upper" | "draw" | undefined;
                    isResponseCard?: boolean | undefined;
                }[];
                declaredKongs: number;
                huType?: "small" | "big" | null | undefined;
                winningGroups: {
                    key: string;
                    cards: {
                        id: string;
                        color: string;
                        type: string;
                        source?: "upper" | "draw" | undefined;
                        isResponseCard?: boolean | undefined;
                    }[];
                }[];
                resolvedHandGroups: {
                    key: string;
                    cards: {
                        id: string;
                        color: string;
                        type: string;
                        source?: "upper" | "draw" | undefined;
                        isResponseCard?: boolean | undefined;
                    }[];
                }[];
                exposedArea: {
                    id: string;
                    color: string;
                    type: string;
                    source?: "upper" | "draw" | undefined;
                    isResponseCard?: boolean | undefined;
                }[];
                exposedGroupSizes: number[];
                exposedGroupKinds: string[];
                generalArea: {
                    id: string;
                    color: string;
                    type: string;
                    source?: "upper" | "draw" | undefined;
                    isResponseCard?: boolean | undefined;
                }[];
                fishArea: {
                    id: string;
                    color: string;
                    type: string;
                    source?: "upper" | "draw" | undefined;
                    isResponseCard?: boolean | undefined;
                }[];
                discardCount: number;
                scoreBreakdown: {
                    key: string;
                    label: string;
                    count: number;
                    unit: number;
                    total: number;
                }[];
                totalScore: number;
                cumulativeScore: number;
            }[];
            remainingDeck?: {
                id: string;
                color: string;
                type: string;
                source?: "upper" | "draw" | undefined;
                isResponseCard?: boolean | undefined;
            }[] | undefined;
            scoringMode: import("@/types/game").ScoringMode;
            roundNumber: number;
        } | null | undefined;
    } | null>;
    players: import("vue").ComputedRef<PlayerState[]>;
    privateHand: import("vue").Ref<{
        id: string;
        color: string;
        type: string;
        source?: "upper" | "draw" | undefined;
        isResponseCard?: boolean | undefined;
    }[], Card[] | {
        id: string;
        color: string;
        type: string;
        source?: "upper" | "draw" | undefined;
        isResponseCard?: boolean | undefined;
    }[]>;
    availableActions: import("vue").Ref<{
        action: ActionType;
        enabled: boolean;
        candidates?: {
            id: string;
            action: "kai" | "peng" | "chi";
            kind?: string | undefined;
            cardIds: string[];
            source: "hand" | "hand+pool";
            title: string;
        }[] | undefined;
        deferred?: boolean | undefined;
    }[], AvailableAction[] | {
        action: ActionType;
        enabled: boolean;
        candidates?: {
            id: string;
            action: "kai" | "peng" | "chi";
            kind?: string | undefined;
            cardIds: string[];
            source: "hand" | "hand+pool";
            title: string;
        }[] | undefined;
        deferred?: boolean | undefined;
    }[]>;
    huResult: import("vue").Ref<{
        winnerId: string;
        groups: string[];
    } | null, {
        winnerId: string;
        groups: string[];
    } | {
        winnerId: string;
        groups: string[];
    } | null>;
    roundResult: import("vue").Ref<{
        winnerId: string | null;
        groups: string[];
        players: {
            clientId: string;
            name: string;
            isConfiguredBot: boolean;
            hand: {
                id: string;
                color: string;
                type: string;
                source?: "upper" | "draw" | undefined;
                isResponseCard?: boolean | undefined;
            }[];
            declaredKongs: number;
            huType?: "small" | "big" | null | undefined;
            winningGroups: {
                key: string;
                cards: {
                    id: string;
                    color: string;
                    type: string;
                    source?: "upper" | "draw" | undefined;
                    isResponseCard?: boolean | undefined;
                }[];
            }[];
            resolvedHandGroups: {
                key: string;
                cards: {
                    id: string;
                    color: string;
                    type: string;
                    source?: "upper" | "draw" | undefined;
                    isResponseCard?: boolean | undefined;
                }[];
            }[];
            exposedArea: {
                id: string;
                color: string;
                type: string;
                source?: "upper" | "draw" | undefined;
                isResponseCard?: boolean | undefined;
            }[];
            exposedGroupSizes: number[];
            exposedGroupKinds: string[];
            generalArea: {
                id: string;
                color: string;
                type: string;
                source?: "upper" | "draw" | undefined;
                isResponseCard?: boolean | undefined;
            }[];
            fishArea: {
                id: string;
                color: string;
                type: string;
                source?: "upper" | "draw" | undefined;
                isResponseCard?: boolean | undefined;
            }[];
            discardCount: number;
            scoreBreakdown: {
                key: string;
                label: string;
                count: number;
                unit: number;
                total: number;
            }[];
            totalScore: number;
            cumulativeScore: number;
        }[];
        remainingDeck?: {
            id: string;
            color: string;
            type: string;
            source?: "upper" | "draw" | undefined;
            isResponseCard?: boolean | undefined;
        }[] | undefined;
        scoringMode: import("@/types/game").ScoringMode;
        roundNumber: number;
    } | null, RoundResultPayload | {
        winnerId: string | null;
        groups: string[];
        players: {
            clientId: string;
            name: string;
            isConfiguredBot: boolean;
            hand: {
                id: string;
                color: string;
                type: string;
                source?: "upper" | "draw" | undefined;
                isResponseCard?: boolean | undefined;
            }[];
            declaredKongs: number;
            huType?: "small" | "big" | null | undefined;
            winningGroups: {
                key: string;
                cards: {
                    id: string;
                    color: string;
                    type: string;
                    source?: "upper" | "draw" | undefined;
                    isResponseCard?: boolean | undefined;
                }[];
            }[];
            resolvedHandGroups: {
                key: string;
                cards: {
                    id: string;
                    color: string;
                    type: string;
                    source?: "upper" | "draw" | undefined;
                    isResponseCard?: boolean | undefined;
                }[];
            }[];
            exposedArea: {
                id: string;
                color: string;
                type: string;
                source?: "upper" | "draw" | undefined;
                isResponseCard?: boolean | undefined;
            }[];
            exposedGroupSizes: number[];
            exposedGroupKinds: string[];
            generalArea: {
                id: string;
                color: string;
                type: string;
                source?: "upper" | "draw" | undefined;
                isResponseCard?: boolean | undefined;
            }[];
            fishArea: {
                id: string;
                color: string;
                type: string;
                source?: "upper" | "draw" | undefined;
                isResponseCard?: boolean | undefined;
            }[];
            discardCount: number;
            scoreBreakdown: {
                key: string;
                label: string;
                count: number;
                unit: number;
                total: number;
            }[];
            totalScore: number;
            cumulativeScore: number;
        }[];
        remainingDeck?: {
            id: string;
            color: string;
            type: string;
            source?: "upper" | "draw" | undefined;
            isResponseCard?: boolean | undefined;
        }[] | undefined;
        scoringMode: import("@/types/game").ScoringMode;
        roundNumber: number;
    } | null>;
    debugApplied: import("vue").Ref<{
        scenario: string;
        ok: boolean;
        ts: number;
        actions?: {
            action: ActionType;
            enabled: boolean;
            candidates?: {
                id: string;
                action: "kai" | "peng" | "chi";
                kind?: string | undefined;
                cardIds: string[];
                source: "hand" | "hand+pool";
                title: string;
            }[] | undefined;
            deferred?: boolean | undefined;
        }[] | undefined;
    } | null, {
        scenario: string;
        ok: boolean;
        ts: number;
        actions?: AvailableAction[];
    } | {
        scenario: string;
        ok: boolean;
        ts: number;
        actions?: {
            action: ActionType;
            enabled: boolean;
            candidates?: {
                id: string;
                action: "kai" | "peng" | "chi";
                kind?: string | undefined;
                cardIds: string[];
                source: "hand" | "hand+pool";
                title: string;
            }[] | undefined;
            deferred?: boolean | undefined;
        }[] | undefined;
    } | null>;
    joinError: import("vue").Ref<string, string>;
    declareError: import("vue").Ref<string, string>;
    actionLogs: import("vue").Ref<{
        id: number;
        at: string;
        text: string;
        actorId: string;
        actionKey: string;
        displayText: string;
        isSystem: boolean;
        cardLabel?: string | undefined;
    }[], ParsedActionLog[] | {
        id: number;
        at: string;
        text: string;
        actorId: string;
        actionKey: string;
        displayText: string;
        isSystem: boolean;
        cardLabel?: string | undefined;
    }[]>;
    actionFeedback: import("vue").Ref<{
        status: "pending" | "received" | "rejected";
        message: string;
        decisionKey: string;
        visible?: boolean | undefined;
    } | null, ActionFeedback | {
        status: "pending" | "received" | "rejected";
        message: string;
        decisionKey: string;
        visible?: boolean | undefined;
    } | null>;
    matchClockSync: import("vue").Ref<{
        deadline: number;
        offsetMs: number;
    }, {
        deadline: number;
        offsetMs: number;
    } | {
        deadline: number;
        offsetMs: number;
    }>;
    decisionTimer: import("vue").Ref<{
        untimed: boolean;
        canRequestMoreTime: boolean;
        extensionSeconds: number;
        totalMs: number;
        endsAt: number;
        decisionKey: string;
    }, DecisionTimerState | {
        untimed: boolean;
        canRequestMoreTime: boolean;
        extensionSeconds: number;
        totalMs: number;
        endsAt: number;
        decisionKey: string;
    }>;
    connect: (options?: string | ConnectOptions) => Promise<boolean>;
    retryConnection: () => void;
    clearActionLogs: () => void;
    sendAction: (input: ActionRequest) => void;
    sendDiscardCard: (cardId: string) => void;
    declareKongs: (count: number) => void;
    declareSetup: (payload: {
        declaredKongs: number;
        fishCardIds: string[];
    }) => boolean;
    requestMoreTime: () => void;
    debugSetup: (scenario: string) => void;
    startGame: () => boolean;
    nextRound: () => void;
    returnLobby: () => void;
    dissolveRoom: () => void;
    setScoringMode: (mode: "single" | "cumulative") => void;
    setLobbyReady: (ready: boolean) => void;
    setAutoPlay: (enabled: boolean) => void;
    leaveRoom: () => Promise<void>;
    claimSeat: (seatIndex: number) => void;
    addBot: (seatIndex: number, strength?: number) => void;
    fillBots: () => void;
    updateBot: (seatIndex: number, strength: number) => void;
    removeSeat: (seatIndex: number) => void;
};
export {};

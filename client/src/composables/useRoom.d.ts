import type { ActionRequest, ActionType, AvailableAction, Card, ParsedActionLog, PlayerState, RoomStateSnapshot, RoomConnectionState, RoundResultPayload } from "@/types/game";
type ConnectOptions = {
    nameOverride?: string;
    roomId?: string;
    playerToken?: string;
    hostKey?: string;
    forceNew?: boolean;
    reconnecting?: boolean;
    preserveState?: boolean;
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
        roomMode: "practice" | "friends";
        phase: string;
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
            isBot: boolean;
            isConfiguredBot: boolean;
            botStrength: number;
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
            }[];
            remainingDeck?: {
                id: string;
                color: string;
                type: string;
                source?: "upper" | "draw" | undefined;
                isResponseCard?: boolean | undefined;
            }[] | undefined;
        } | null | undefined;
    } | null, RoomStateSnapshot | {
        roomId?: string | undefined;
        roomMode: "practice" | "friends";
        phase: string;
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
            isBot: boolean;
            isConfiguredBot: boolean;
            botStrength: number;
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
            }[];
            remainingDeck?: {
                id: string;
                color: string;
                type: string;
                source?: "upper" | "draw" | undefined;
                isResponseCard?: boolean | undefined;
            }[] | undefined;
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
        }[];
        remainingDeck?: {
            id: string;
            color: string;
            type: string;
            source?: "upper" | "draw" | undefined;
            isResponseCard?: boolean | undefined;
        }[] | undefined;
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
        }[];
        remainingDeck?: {
            id: string;
            color: string;
            type: string;
            source?: "upper" | "draw" | undefined;
            isResponseCard?: boolean | undefined;
        }[] | undefined;
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
    connect: (options?: string | ConnectOptions) => Promise<boolean>;
    retryConnection: () => void;
    clearActionLogs: () => void;
    sendAction: (input: ActionRequest) => void;
    sendDiscardCard: (cardId: string) => void;
    declareKongs: (count: number) => void;
    declareSetup: (payload: {
        declaredKongs: number;
        fishCardIds: string[];
    }) => void;
    debugSetup: (scenario: string) => void;
    startGame: () => void;
    nextRound: () => void;
    returnLobby: () => void;
    leaveRoom: () => Promise<void>;
    claimSeat: (seatIndex: number) => void;
    addBot: (seatIndex: number, strength?: number) => void;
    updateBot: (seatIndex: number, strength: number) => void;
    removeSeat: (seatIndex: number) => void;
};
export {};

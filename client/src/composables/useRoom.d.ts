import type { ActionRequest, ActionType, AvailableAction, Card, ParsedActionLog, PlayerState, RoomStateSnapshot, RoundResultPayload } from "@/types/game";
export declare function useRoom(playerName?: string): {
    connected: import("vue").Ref<boolean, boolean>;
    myId: import("vue").Ref<string, string>;
    mySeatId: import("vue").Ref<string, string>;
    playerToken: import("vue").Ref<string, string>;
    state: import("vue").Ref<{
        phase: string;
        hostPlayerId: string;
        dealerId: string;
        currentPlayerId: string;
        currentTurnPlayerId: string;
        previousPlayerId: string;
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
        publicDiscardPile: {
            id: string;
            color: string;
            type: string;
            source?: "upper" | "draw" | undefined;
            isResponseCard?: boolean | undefined;
        }[];
        declareEndsAt: number;
        players: {
            clientId: string;
            name: string;
            declaredKongs: number;
            declaredReady: boolean;
            isBot: boolean;
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
    } | null, RoomStateSnapshot | {
        phase: string;
        hostPlayerId: string;
        dealerId: string;
        currentPlayerId: string;
        currentTurnPlayerId: string;
        previousPlayerId: string;
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
        publicDiscardPile: {
            id: string;
            color: string;
            type: string;
            source?: "upper" | "draw" | undefined;
            isResponseCard?: boolean | undefined;
        }[];
        declareEndsAt: number;
        players: {
            clientId: string;
            name: string;
            declaredKongs: number;
            declaredReady: boolean;
            isBot: boolean;
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
            source: "hand" | "hand+pool" | "reusable_pair";
            title: string;
        }[] | undefined;
    }[], AvailableAction[] | {
        action: ActionType;
        enabled: boolean;
        candidates?: {
            id: string;
            action: "kai" | "peng" | "chi";
            kind?: string | undefined;
            cardIds: string[];
            source: "hand" | "hand+pool" | "reusable_pair";
            title: string;
        }[] | undefined;
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
            hand: {
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
    } | null, RoundResultPayload | {
        winnerId: string | null;
        groups: string[];
        players: {
            clientId: string;
            name: string;
            hand: {
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
    } | null>;
    debugApplied: import("vue").Ref<{
        scenario: string;
        ok: boolean;
        ts: number;
    } | null, {
        scenario: string;
        ok: boolean;
        ts: number;
    } | {
        scenario: string;
        ok: boolean;
        ts: number;
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
    }[], ParsedActionLog[] | {
        id: number;
        at: string;
        text: string;
        actorId: string;
        actionKey: string;
        displayText: string;
        isSystem: boolean;
    }[]>;
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
};

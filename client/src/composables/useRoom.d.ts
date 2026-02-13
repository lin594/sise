import type { ActionType, AvailableAction, Card, PlayerState, RoundResultPayload } from "@/types/game";
export declare function useRoom(playerName?: string): {
    connected: import("vue").Ref<boolean, boolean>;
    myId: import("vue").Ref<string, string>;
    mySeatId: import("vue").Ref<string, string>;
    playerToken: import("vue").Ref<string, string>;
    state: import("vue").Ref<any, any>;
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
    }[], AvailableAction[] | {
        action: ActionType;
        enabled: boolean;
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
    }[], {
        id: number;
        at: string;
        text: string;
    }[] | {
        id: number;
        at: string;
        text: string;
    }[]>;
    sendAction: (action: ActionType) => void;
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

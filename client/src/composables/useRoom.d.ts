import type { ActionType, AvailableAction, Card, PlayerState } from "@/types/game";
export declare function useRoom(playerName?: string): {
    connected: import("vue").Ref<boolean, boolean>;
    myId: import("vue").Ref<string, string>;
    state: import("vue").ShallowRef<any, any>;
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
    sendAction: (action: ActionType) => void;
    declareKongs: (count: number) => void;
    debugSetup: (scenario: string) => void;
};

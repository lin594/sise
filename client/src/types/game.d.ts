export type ActionType = "hu" | "open" | "peng" | "eat" | "grab" | "pass";
export interface Card {
    id: string;
    color: string;
    type: string;
    source?: "upper" | "draw";
    isResponseCard?: boolean;
}
export interface PlayerState {
    clientId: string;
    name: string;
    declaredKongs: number;
    discardPile: Card[];
    exposedArea: Card[];
    fishArea: Card[];
}
export interface AvailableAction {
    action: ActionType;
    enabled: boolean;
}

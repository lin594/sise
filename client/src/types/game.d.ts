export type ActionType = "hu" | "kai" | "peng" | "chi" | "pass" | "open" | "eat" | "grab";
export type ResponsePhase = "collective" | "local_upper" | "local_draw";
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
    declaredReady: boolean;
    isBot: boolean;
    connected: boolean;
    discardPile: Card[];
    exposedArea: Card[];
    exposedGroupSizes: number[];
    generalArea: Card[];
    wildcardPool: Card[];
    fishArea: Card[];
}
export interface RoomStateSnapshot {
    phase: string;
    hostPlayerId: string;
    dealerId: string;
    currentPlayerId: string;
    currentTurnPlayerId: string;
    previousPlayerId: string;
    responsePhase: string;
    lastAction: string;
    deckCount: number;
    isMoCard: boolean;
    targetCard: Card | null;
    responseCard: Card | null;
    publicDiscardPile: Card[];
    declareEndsAt: number;
    players: PlayerState[];
}
export interface AvailableAction {
    action: ActionType;
    enabled: boolean;
    candidates?: ActionCandidate[];
}
export interface ActionCandidate {
    id: string;
    action: "kai" | "peng" | "chi";
    kind?: string;
    cardIds: string[];
    source: "hand" | "hand+pool" | "reusable_pair";
    title: string;
}
export type ActionRequest = ActionType | {
    action: ActionType;
    candidateId?: string;
};
export interface SessionTokenPayload {
    playerToken: string;
    seatId: string;
    hostPlayerId: string;
    roomId: string;
    reclaimed: boolean;
}
export interface RoundResultPlayer {
    clientId: string;
    name: string;
    hand: Card[];
    exposedArea: Card[];
    exposedGroupSizes: number[];
    generalArea: Card[];
    fishArea: Card[];
    discardCount: number;
    scoreBreakdown: Array<{
        key: string;
        label: string;
        count: number;
        unit: number;
        total: number;
    }>;
    totalScore: number;
}
export interface RoundResultPayload {
    winnerId: string | null;
    groups: string[];
    players: RoundResultPlayer[];
}

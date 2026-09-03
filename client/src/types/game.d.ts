export type ActionType = "hu" | "kai" | "peng" | "chi" | "pass";
export type ResponsePhase = "collective" | "local_upper" | "local_draw";
export type CardDisplayMode = "large" | "adaptive" | "long";
export type RenderedCardMode = Exclude<CardDisplayMode, "adaptive">;
export type SeatDirection = "clockwise" | "counterclockwise";
export type ScoringMode = "single" | "cumulative";
export type TurnAlertMode = "sound-vibration" | "sound" | "off";
export type RoomConnectionState = "idle" | "connecting" | "connected" | "reconnecting" | "retry_wait" | "offline" | "restored" | "closed" | "failed";
export interface GameDisplayPreferences {
    ownCards: CardDisplayMode;
    tableCards: CardDisplayMode;
    seatDirection: SeatDirection;
    turnAlert: TurnAlertMode;
    keepScreenAwake: boolean;
}
export interface Card {
    id: string;
    color: string;
    type: string;
    source?: "upper" | "draw";
    isResponseCard?: boolean;
}
export interface PlayerState {
    clientId: string;
    seatIndex: number;
    name: string;
    handCount?: number;
    declaredKongs: number;
    declaredReady: boolean;
    isBot: boolean;
    isAutoPlay: boolean;
    isConfiguredBot: boolean;
    botStrength: number;
    cumulativeScore: number;
    connected: boolean;
    discardPile: Card[];
    exposedArea: Card[];
    exposedGroupSizes: number[];
    exposedGroupKinds: string[];
    generalArea: Card[];
    wildcardPool: Card[];
    fishArea: Card[];
}
export interface RoomStateSnapshot {
    roomId?: string;
    roomMode: "practice" | "friends";
    scoringMode: ScoringMode;
    completedRounds: number;
    phase: string;
    hostPlayerId: string;
    dealerId: string;
    dealerPickerId?: string;
    currentPlayerId: string;
    currentTurnPlayerId: string;
    previousPlayerId: string;
    pollOriginPlayerId?: string;
    activeResponderId?: string;
    responsePhase: string;
    responseEndsAt: number;
    lastAction: string;
    deckCount: number;
    isMoCard: boolean;
    targetCard: Card | null;
    responseCard: Card | null;
    dealerCard?: Card | null;
    publicDiscardPile: Card[];
    publicGeneralPool?: Card[];
    declareEndsAt: number;
    players: PlayerState[];
    privateHand?: Card[];
    availableActions?: AvailableAction[];
    roundResult?: RoundResultPayload | null;
}
export interface ParsedActionLog {
    id: number;
    at: string;
    text: string;
    actorId: string;
    actionKey: string;
    displayText: string;
    isSystem: boolean;
    cardLabel?: string;
}
export interface AvailableAction {
    action: ActionType;
    enabled: boolean;
    candidates?: ActionCandidate[];
    deferred?: boolean;
}
export interface DecisionTimerState {
    untimed: boolean;
    canRequestMoreTime: boolean;
    extensionSeconds: number;
    totalMs: number;
    endsAt: number;
    decisionKey: string;
}
export interface ActionCandidate {
    id: string;
    action: "kai" | "peng" | "chi";
    kind?: string;
    cardIds: string[];
    source: "hand" | "hand+pool";
    title: string;
}
export type ActionRequest = ActionType | {
    action: ActionType;
    candidateId?: string;
    deferred?: boolean;
    decisionKey?: string;
};
export interface SessionTokenPayload {
    playerToken: string;
    seatId: string;
    seatIndex?: number;
    hostPlayerId: string;
    roomId: string;
    reclaimed: boolean;
}
export interface RoundResultPlayer {
    clientId: string;
    name: string;
    isConfiguredBot: boolean;
    hand: Card[];
    declaredKongs: number;
    huType?: "small" | "big" | null;
    winningGroups: Array<{
        key: string;
        cards: Card[];
    }>;
    resolvedHandGroups: Array<{
        key: string;
        cards: Card[];
    }>;
    exposedArea: Card[];
    exposedGroupSizes: number[];
    exposedGroupKinds: string[];
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
    cumulativeScore: number;
}
export interface RoundResultPayload {
    winnerId: string | null;
    groups: string[];
    players: RoundResultPlayer[];
    remainingDeck?: Card[];
    scoringMode: ScoringMode;
    roundNumber: number;
}

import type { ActionCandidate, ActionRequest, AvailableAction, Card, PlayerState } from "@/types/game";
type __VLS_Props = {
    state: any;
    players: PlayerState[];
    privateHand: Card[];
    mySeatId: string;
    canDiscard?: boolean;
    actions?: AvailableAction[];
    canAct?: boolean;
    isCurrentTurn?: boolean;
    responsePhase?: string;
    currentPlayerName?: string;
    turnHint?: string;
    embeddedActionPanel?: boolean;
    tableCardMode?: "simple" | "full";
    selectionMode?: "kai" | "peng" | "chi" | null;
    selectedCandidateId?: string | null;
    activeCandidates?: ActionCandidate[];
};
declare const _default: import("vue").DefineComponent<__VLS_Props, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    selectionChange: (payload: {
        mode: "kai" | "peng" | "chi" | null;
        selectedCandidateId: string | null;
    }) => any;
    discardCard: (cardId: string) => any;
    submitAction: (request: ActionRequest) => any;
}, string, import("vue").PublicProps, Readonly<__VLS_Props> & Readonly<{
    onSelectionChange?: ((payload: {
        mode: "kai" | "peng" | "chi" | null;
        selectedCandidateId: string | null;
    }) => any) | undefined;
    onDiscardCard?: ((cardId: string) => any) | undefined;
    onSubmitAction?: ((request: ActionRequest) => any) | undefined;
}>, {}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
export default _default;

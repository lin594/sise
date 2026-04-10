import type { ActionRequest, AvailableAction } from "@/types/game";
type SelectionMode = "kai" | "peng" | "chi" | null;
type __VLS_Props = {
    actions: AvailableAction[];
    canAct?: boolean;
    isCurrentTurn?: boolean;
    responsePhase?: string;
    currentPlayerName?: string;
    selectionMode?: SelectionMode;
    selectedCandidateId?: string | null;
};
declare const _default: import("vue").DefineComponent<__VLS_Props, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    submit: (request: ActionRequest) => any;
    selectionChange: (payload: {
        mode: SelectionMode;
        selectedCandidateId: string | null;
    }) => any;
}, string, import("vue").PublicProps, Readonly<__VLS_Props> & Readonly<{
    onSubmit?: ((request: ActionRequest) => any) | undefined;
    onSelectionChange?: ((payload: {
        mode: SelectionMode;
        selectedCandidateId: string | null;
    }) => any) | undefined;
}>, {
    canAct: boolean;
    isCurrentTurn: boolean;
    responsePhase: string;
    currentPlayerName: string;
    selectionMode: SelectionMode;
    selectedCandidateId: string | null;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
export default _default;

import type { ActionType, AvailableAction } from "@/types/game";
type __VLS_Props = {
    actions: AvailableAction[];
    canAct?: boolean;
    isCurrentTurn?: boolean;
    responsePhase?: string;
    currentPlayerName?: string;
};
declare const _default: import("vue").DefineComponent<__VLS_Props, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    submit: (action: ActionType) => any;
}, string, import("vue").PublicProps, Readonly<__VLS_Props> & Readonly<{
    onSubmit?: ((action: ActionType) => any) | undefined;
}>, {
    canAct: boolean;
    isCurrentTurn: boolean;
    responsePhase: string;
    currentPlayerName: string;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
export default _default;

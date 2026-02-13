import type { Card, PlayerState } from "@/types/game";
type __VLS_Props = {
    state: any;
    players: PlayerState[];
    privateHand: Card[];
    mySeatId: string;
    canDiscard?: boolean;
};
declare const _default: import("vue").DefineComponent<__VLS_Props, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    discardCard: (cardId: string) => any;
}, string, import("vue").PublicProps, Readonly<__VLS_Props> & Readonly<{
    onDiscardCard?: ((cardId: string) => any) | undefined;
}>, {}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
export default _default;

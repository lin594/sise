type __VLS_Props = {
    step: string;
    actions: Array<{
        action: string;
        enabled?: boolean;
    }>;
};
declare const _default: import("vue").DefineComponent<__VLS_Props, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    next: () => any;
    restart: () => any;
}, string, import("vue").PublicProps, Readonly<__VLS_Props> & Readonly<{
    onNext?: (() => any) | undefined;
    onRestart?: (() => any) | undefined;
}>, {}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
export default _default;

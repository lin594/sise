import { type PwaInstallGuide } from "./usePwaInstall";
/** App-level installation guide and return focus, on top of browser capability detection. */
export declare function useInstallGuide({ onError, onNotice, onGuideClosed }: {
    onError: (message: string) => void;
    onNotice: (message: string) => void;
    onGuideClosed: () => void;
}): {
    canOfferPwaInstall: import("vue").ComputedRef<boolean>;
    pwaInstallGuide: import("vue").Ref<{
        kind: "wechat" | "ios" | "mac-safari" | "android" | "browser";
        title: string;
        description: string;
        steps: string[];
    } | null, PwaInstallGuide | {
        kind: "wechat" | "ios" | "mac-safari" | "android" | "browser";
        title: string;
        description: string;
        steps: string[];
    } | null>;
    requestPwaInstall: () => Promise<void>;
    closePwaInstallGuide: (restoreFocus?: boolean) => void;
};

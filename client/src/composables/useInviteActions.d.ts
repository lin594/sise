import { type Ref } from "vue";
/** Invitation UI state; room ownership and admission remain with useRoom. */
export declare function useInviteActions({ activeRoomId, globalError, showGlobalNotice }: {
    activeRoomId: Readonly<Ref<string>>;
    globalError: Ref<string>;
    showGlobalNotice: (message: string) => void;
}): {
    inviteCopyFallbackUrl: Ref<string, string>;
    inviteQrUrl: Ref<string, string>;
    inviteQrRoomId: Ref<string, string>;
    inviteActionPending: Ref<"copy" | "share" | null, "copy" | "share" | null>;
    copyInviteLink: () => Promise<void>;
    shareInviteLink: () => Promise<void>;
    shareGame: () => Promise<void>;
    showInviteQr: () => void;
    closeInviteQr: (restoreFocus?: boolean) => void;
    closeInviteCopyFallback: (restoreFocus?: boolean) => void;
};

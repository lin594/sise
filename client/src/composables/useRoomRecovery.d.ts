import { type Ref } from "vue";
import type { useRoom } from "./useRoom";
import type { StartingRoomMode } from "./useRoomLifecycle";
type Room = ReturnType<typeof useRoom>;
type RecoveryOptions = Pick<Room, "state" | "connected" | "connect" | "retryConnection" | "connectionState" | "joinError" | "acceptedStateRevision" | "mySeatId"> & {
    entryName: Ref<string>;
    entryInviteRoomId: Ref<string>;
    enteredFrontLobby: Ref<boolean>;
    enteringLobby: Ref<boolean>;
    restoringStoredSession: Ref<boolean>;
    joiningFriendInvite: Ref<boolean>;
    startingRoomMode: Ref<StartingRoomMode>;
    globalError: Ref<string>;
    nicknameHistory: Ref<string[]>;
    storedEntryNameAtBoot: string;
    nicknameHistoryAtBoot: string[];
    generateRandomNickname: () => string;
    enterLobby: () => Promise<void>;
    privateHandSynchronized: Readonly<Ref<boolean>>;
    returnToModeSelectionFromRoom: () => Promise<void>;
};
/** Saved-seat entry, recovery messaging, cancellation and authority-based recovery metrics. */
export declare function useRoomRecovery({ state, connected, connect, retryConnection, connectionState, joinError, acceptedStateRevision, mySeatId, entryName, entryInviteRoomId, enteredFrontLobby, enteringLobby, restoringStoredSession, joiningFriendInvite, startingRoomMode, globalError, nicknameHistory, storedEntryNameAtBoot, nicknameHistoryAtBoot, generateRandomNickname, enterLobby, privateHandSynchronized, returnToModeSelectionFromRoom }: RecoveryOptions): {
    confirmingResumeAbandon: Ref<boolean, boolean>;
    syncExitButtonRef: Ref<HTMLButtonElement | null, HTMLButtonElement | null>;
    resumeAbandonDialogRef: Ref<HTMLElement | null, HTMLElement | null>;
    resumeAbandonCancelRef: Ref<HTMLButtonElement | null, HTMLButtonElement | null>;
    bootstrapRoomEntry: () => Promise<void>;
    syncCanRetry: import("vue").ComputedRef<boolean>;
    syncScreenCopy: import("vue").ComputedRef<{
        kicker: string;
        title: string;
        description: string;
        cancelLabel: string;
    }>;
    syncCancelDialogCopy: import("vue").ComputedRef<{
        title: string;
        description: string;
        keepLabel: string;
        confirmLabel: string;
    }>;
    requestResumeAbandon: () => Promise<void>;
    cancelResumeAbandon: () => void;
    confirmResumeAbandon: () => Promise<void>;
    trapResumeAbandonFocus: (event: KeyboardEvent) => void;
};
export {};

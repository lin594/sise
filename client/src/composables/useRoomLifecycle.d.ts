import { type Ref } from "vue";
import type { useRoom } from "./useRoom";
import type { LobbyModeId } from "./useLobbyPresentation";
export type StartingRoomMode = "practice" | "friends" | "quick_match" | null;
type Room = ReturnType<typeof useRoom>;
type LifecycleOptions = Pick<Room, "state" | "tutorial" | "connected" | "connect" | "leaveRoom" | "joinError" | "activeRoomId"> & {
    entryName: Ref<string>;
    entryInviteRoomId: Ref<string>;
    globalError: Ref<string>;
    enteredFrontLobby: Ref<boolean>;
    enteringLobby: Ref<boolean>;
    restoringStoredSession: Ref<boolean>;
    joiningFriendInvite: Ref<boolean>;
    startingRoomMode: Ref<StartingRoomMode>;
    pendingPracticeAutoStart: Ref<boolean>;
    selectedLobbyMode: Ref<LobbyModeId>;
    hasLobbySession: Readonly<Ref<boolean>>;
    generateRandomNickname: () => string;
    clearRoundStartPending: () => void;
    clearSeatClaimPending: () => void;
    clearLobbyReadyPending: () => void;
    clearSettlementTransitionPending: () => void;
    requestRoundStart: () => boolean;
    maybeAutoStartPractice: () => void;
};
/** Mode creation/entry and exit orchestration over the existing room client. */
export declare function useRoomLifecycle({ state, tutorial, connected, connect, leaveRoom, joinError, activeRoomId, entryName, entryInviteRoomId, globalError, enteredFrontLobby, enteringLobby, restoringStoredSession, joiningFriendInvite, startingRoomMode, pendingPracticeAutoStart, selectedLobbyMode, hasLobbySession, generateRandomNickname, clearRoundStartPending, clearSeatClaimPending, clearLobbyReadyPending, clearSettlementTransitionPending, requestRoundStart, maybeAutoStartPractice }: LifecycleOptions): {
    returnToModeSelectionFromRoom: () => Promise<void>;
    handleLeaveRoom: () => Promise<void>;
    startLobbyMode: (mode: string) => void;
    startSelectedMode: () => void;
    finishTutorial: (invite: boolean) => Promise<void>;
    startPracticeLobby: (tutorial?: boolean) => Promise<void>;
};
export {};

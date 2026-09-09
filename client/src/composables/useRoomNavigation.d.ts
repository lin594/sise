import { type Ref } from "vue";
import type { useRoom } from "./useRoom";
type Room = ReturnType<typeof useRoom>;
type NavigationOptions = Pick<Room, "activeRoomId" | "state" | "connectionState"> & {
    roomNavigationProtected: Readonly<Ref<boolean>>;
    showEntry: Readonly<Ref<boolean>>;
    hasFriendInvite: Readonly<Ref<boolean>>;
    hasLobbySession: Readonly<Ref<boolean>>;
    confirmingResumeAbandon: Ref<boolean>;
    requestRoomExitFromBrowserBack: () => Promise<void>;
};
/** Browser-history guard only; modal priority and exit policy remain at the composition root. */
export declare function useRoomNavigation({ roomNavigationProtected, activeRoomId, state, connectionState, showEntry, hasFriendInvite, hasLobbySession, confirmingResumeAbandon, requestRoomExitFromBrowserBack }: NavigationOptions): void;
export {};

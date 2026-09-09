export declare const ENTRY_NAME_KEY = "sise_entry_name";
/** Local entry identity and nickname UI, backed by the existing guest profile. */
export declare function useEntryProfile({ browserStoragePersistent, canChangeName }: {
    browserStoragePersistent: boolean;
    canChangeName: () => boolean;
}): {
    guestProfile: import("vue").Ref<{
        nickname: string;
        roundsPlayed: number;
        huWins: number;
        totalScore: number;
        createdAt: number;
        updatedAt: number;
    } | null, import("./useGuestProfile").GuestProfile | {
        nickname: string;
        roundsPlayed: number;
        huWins: number;
        totalScore: number;
        createdAt: number;
        updatedAt: number;
    } | null>;
    refreshGuestProfileAfterSettlement: () => void;
    updateGuestProfileNickname: (nickname: string) => Promise<import("./useGuestProfile").GuestProfile | null>;
    guestProfileSummary: import("vue").ComputedRef<string>;
    storedEntryNameAtBoot: string;
    nicknameHistoryAtBoot: string[];
    entryName: import("vue").Ref<string, string>;
    nicknameHistory: import("vue").Ref<string[], string[]>;
    nicknameDialogOpen: import("vue").Ref<boolean, boolean>;
    nicknameDraftRandom: import("vue").Ref<string, string>;
    generateRandomNickname: () => string;
    writeNicknameHistory: (names: string[]) => void;
    openNicknameDialog: () => Promise<void>;
    closeNicknameDialog: () => Promise<void>;
    saveNickname: (value: string) => void;
};

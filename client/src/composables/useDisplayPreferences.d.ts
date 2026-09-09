import type { CardDisplayMode, GameDisplayPreferences, TurnAlertMode } from "@/types/game";
/** Persist display choices with the existing legacy and restricted-storage fallback. */
export declare function useDisplayPreferences(): import("vue").Ref<{
    skin: import("@/types/game").SkinId;
    tableLayout: import("@/types/game").TableLayoutId;
    handLayout: "single" | "paged";
    ownCards: CardDisplayMode;
    tableCards: CardDisplayMode;
    seatDirection: import("@/types/game").SeatDirection;
    turnAlert: TurnAlertMode;
    spokenTurnGuidance: boolean;
    showCardColorAssist: boolean;
    reduceMotion: boolean;
    keepScreenAwake: boolean;
}, GameDisplayPreferences | {
    skin: import("@/types/game").SkinId;
    tableLayout: import("@/types/game").TableLayoutId;
    handLayout: "single" | "paged";
    ownCards: CardDisplayMode;
    tableCards: CardDisplayMode;
    seatDirection: import("@/types/game").SeatDirection;
    turnAlert: TurnAlertMode;
    spokenTurnGuidance: boolean;
    showCardColorAssist: boolean;
    reduceMotion: boolean;
    keepScreenAwake: boolean;
}>;

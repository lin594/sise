import { type Ref } from "vue";
import type { useRoom } from "./useRoom";
type Room = ReturnType<typeof useRoom>;
export type LobbyModeId = "practice_bots" | "quick_match" | "friends";
export type LobbyMode = {
    id: LobbyModeId;
    name: string;
    description: string;
    badge: string;
    enabled: boolean;
};
export declare const lobbyModes: LobbyMode[];
type LobbyOptions = Pick<Room, "state" | "players" | "connected" | "mySeatId" | "matchClockSync"> & {
    isWaiting: Readonly<Ref<boolean>>;
    isHost: Readonly<Ref<boolean>>;
    mePlayer: Readonly<Ref<Room["players"]["value"][number] | null>>;
    hasLobbySession: Readonly<Ref<boolean>>;
    enteringLobby: Ref<boolean>;
    roundStartPending: Ref<boolean>;
    selectedLobbyMode: Ref<LobbyModeId>;
    pendingPracticeAutoStart: Ref<boolean>;
    lobbyReadyPending: Ref<boolean | null>;
};
/** Lobby copy and readiness derived from the existing authoritative room state. */
export declare function useLobbyPresentation({ state, players, connected, mySeatId, matchClockSync, isWaiting, isHost, mePlayer, hasLobbySession, enteringLobby, roundStartPending, selectedLobbyMode, pendingPracticeAutoStart, lobbyReadyPending }: LobbyOptions): {
    canPressStartGame: import("vue").ComputedRef<boolean>;
    canStartSelectedMode: import("vue").ComputedRef<boolean>;
    lobbyTitle: import("vue").ComputedRef<string>;
    lobbySubtitle: import("vue").ComputedRef<string>;
    lobbyStartLabel: import("vue").ComputedRef<"创建好友房" | "请先选择座位" | "等待房主开始" | "正在创建好友房…" | "正在寻找牌友…" | "正在创建练习房…" | "开始快速配桌" | "开始单人练习" | "正在补齐并开局…" | "正在开始好友对局…" | "正在开始练习…" | "正在自动开始..." | "电脑补位，立即开始" | "开始好友对局">;
    lobbyStartHint: import("vue").ComputedRef<string>;
    nowMs: Ref<number, number>;
    matchSecondsLeft: import("vue").ComputedRef<number>;
};
export {};

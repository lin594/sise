type Mode = "practice" | "match" | "friends";
type ClientEvent = "app_open" | "lobby_view" | "practice_start" | "quick_match_start" | "friend_room_create" | "invite_open" | "play_again" | "room_exit" | "join_failed" | "reconnect_started" | "reconnect_success" | "reconnect_failed";
export declare function productVisitId(): string;
export declare function trackProductEvent(name: ClientEvent, fields?: {
    id?: string;
    mode?: Mode;
    outcome?: "started" | "ready" | "failed";
    durationMs?: number;
    persistent?: boolean;
}): void;
export declare function openProductSession(invited: boolean): void;
export declare function beginProductMode(mode: Mode): void;
export declare function readyProductMode(): void;
export declare function failProductMode(): void;
export {};

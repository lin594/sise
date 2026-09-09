import { onMounted, onUnmounted, watch } from "vue";
/** Browser-history guard only; modal priority and exit policy remain at the composition root. */
export function useRoomNavigation({ roomNavigationProtected, activeRoomId, state, connectionState, showEntry, hasFriendInvite, hasLobbySession, confirmingResumeAbandon, requestRoomExitFromBrowserBack }) {
    const ROOM_HISTORY_GUARD_KEY = "__siseRoomGuard";
    let roomNavigationGuardMounted = false;
    let roomNavigationGuardArmed = false;
    let roomNavigationGuardReleasing = false;
    let roomNavigationReleaseTimer = null;
    function historyStateWithoutRoomGuard() {
        const current = window.history.state;
        if (!current || typeof current !== "object" || Array.isArray(current)) {
            return current;
        }
        const clean = { ...current };
        delete clean[ROOM_HISTORY_GUARD_KEY];
        return Object.keys(clean).length ? clean : null;
    }
    function isCurrentRoomHistoryGuard() {
        const current = window.history.state;
        return Boolean(current &&
            typeof current === "object" &&
            !Array.isArray(current) &&
            current[ROOM_HISTORY_GUARD_KEY] === true);
    }
    function cleanRoomUrl(preserveInviteRoomId = false) {
        const url = new URL(window.location.href);
        if (!preserveInviteRoomId) {
            url.searchParams.delete("roomId");
        }
        url.searchParams.delete("playerToken");
        url.searchParams.delete("new");
        return url.toString();
    }
    function sanitizeCurrentHistoryEntry() {
        const preserveInviteRoomId = showEntry.value && hasFriendInvite.value && !hasLobbySession.value;
        window.history.replaceState(historyStateWithoutRoomGuard(), "", cleanRoomUrl(preserveInviteRoomId));
    }
    function armRoomNavigationGuard() {
        if (!roomNavigationGuardMounted || !roomNavigationProtected.value) {
            return;
        }
        if (isCurrentRoomHistoryGuard()) {
            roomNavigationGuardArmed = true;
            return;
        }
        const current = window.history.state;
        const base = current && typeof current === "object" && !Array.isArray(current)
            ? current
            : {};
        window.history.pushState({ ...base, [ROOM_HISTORY_GUARD_KEY]: true }, "", window.location.href);
        roomNavigationGuardArmed = true;
    }
    function finishRoomNavigationGuardRelease() {
        roomNavigationGuardReleasing = false;
        if (roomNavigationReleaseTimer !== null) {
            window.clearTimeout(roomNavigationReleaseTimer);
            roomNavigationReleaseTimer = null;
        }
        sanitizeCurrentHistoryEntry();
    }
    function releaseRoomNavigationGuard() {
        const shouldStepBack = roomNavigationGuardArmed && isCurrentRoomHistoryGuard();
        roomNavigationGuardArmed = false;
        confirmingResumeAbandon.value = false;
        if (!shouldStepBack) {
            sanitizeCurrentHistoryEntry();
            return;
        }
        sanitizeCurrentHistoryEntry();
        roomNavigationGuardReleasing = true;
        window.history.back();
        if (roomNavigationReleaseTimer !== null) {
            window.clearTimeout(roomNavigationReleaseTimer);
        }
        roomNavigationReleaseTimer = window.setTimeout(finishRoomNavigationGuardRelease, 500);
    }
    function handleRoomNavigationPopState() {
        if (roomNavigationGuardReleasing) {
            finishRoomNavigationGuardRelease();
            return;
        }
        if (!roomNavigationGuardMounted || !roomNavigationProtected.value) {
            roomNavigationGuardArmed = false;
            return;
        }
        const current = window.history.state;
        const base = current && typeof current === "object" && !Array.isArray(current)
            ? current
            : {};
        window.history.pushState({ ...base, [ROOM_HISTORY_GUARD_KEY]: true }, "", window.location.href);
        roomNavigationGuardArmed = true;
        void requestRoomExitFromBrowserBack();
    }
    watch(() => [
        roomNavigationProtected.value,
        activeRoomId.value,
        state.value?.phase ?? "",
        connectionState.value,
    ], ([protectedNow]) => {
        if (!roomNavigationGuardMounted) {
            return;
        }
        if (protectedNow) {
            armRoomNavigationGuard();
        }
        else {
            releaseRoomNavigationGuard();
        }
    }, { flush: "post" });
    onMounted(() => {
        roomNavigationGuardMounted = true;
        window.addEventListener("popstate", handleRoomNavigationPopState);
        armRoomNavigationGuard();
    });
    onUnmounted(() => {
        roomNavigationGuardMounted = false;
        window.removeEventListener("popstate", handleRoomNavigationPopState);
        if (roomNavigationReleaseTimer !== null) {
            window.clearTimeout(roomNavigationReleaseTimer);
            roomNavigationReleaseTimer = null;
        }
    });
}

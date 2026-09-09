import { nextTick } from "vue";
import { BACKEND_HTTP_URL } from "@/config/backend";
import { apiErrorMessage } from "@/utils/http";
import { beginProductMode, failProductMode, trackProductEvent } from "@/utils/productAnalytics";
const HTTP_URL = BACKEND_HTTP_URL;
/** Mode creation/entry and exit orchestration over the existing room client. */
export function useRoomLifecycle({ state, tutorial, connected, connect, leaveRoom, joinError, activeRoomId, entryName, entryInviteRoomId, globalError, enteredFrontLobby, enteringLobby, restoringStoredSession, joiningFriendInvite, startingRoomMode, pendingPracticeAutoStart, selectedLobbyMode, hasLobbySession, generateRandomNickname, clearRoundStartPending, clearSeatClaimPending, clearLobbyReadyPending, clearSettlementTransitionPending, requestRoundStart, maybeAutoStartPractice }) {
    async function returnToModeSelectionFromRoom() {
        const departingRoomId = entryInviteRoomId.value || activeRoomId.value;
        restoringStoredSession.value = false;
        joiningFriendInvite.value = false;
        startingRoomMode.value = null;
        entryInviteRoomId.value = "";
        enteringLobby.value = false;
        globalError.value = "";
        await leaveRoom(departingRoomId);
        enteredFrontLobby.value = true;
        await nextTick();
        document.querySelector("[data-testid='mode-practice_bots']")?.focus();
    }
    async function handleLeaveRoom() {
        trackProductEvent("room_exit", { mode: tutorial.value ? "tutorial" : state.value?.roomMode });
        globalError.value = "";
        pendingPracticeAutoStart.value = false;
        clearRoundStartPending();
        clearSeatClaimPending();
        clearLobbyReadyPending();
        clearSettlementTransitionPending();
        await leaveRoom();
        entryInviteRoomId.value = "";
    }
    function startLobbyMode(mode) {
        if (enteringLobby.value || hasLobbySession.value)
            return;
        selectedLobbyMode.value = mode;
        startSelectedMode();
    }
    function startSelectedMode() {
        globalError.value = "";
        if (!hasLobbySession.value) {
            if (selectedLobbyMode.value === "friends") {
                void startFriendLobby();
            }
            else if (selectedLobbyMode.value === "quick_match") {
                void startQuickMatchLobby();
            }
            else {
                void startPracticeLobby();
            }
            return;
        }
        if (state.value?.roomMode === "friends" || state.value?.roomMode === "match") {
            requestRoundStart();
        }
        else {
            requestPracticeAutoStart();
        }
    }
    async function startQuickMatchLobby() {
        if (enteringLobby.value) {
            return;
        }
        const nickname = entryName.value.trim().slice(0, 16) || generateRandomNickname();
        entryName.value = nickname;
        startingRoomMode.value = "quick_match";
        enteringLobby.value = true;
        beginProductMode("match");
        try {
            const ok = await connect({
                nameOverride: nickname,
                forceNew: true,
                matchmaking: true,
            });
            if (!ok) {
                throw new Error(joinError.value || "暂时无法快速配桌，请稍后重试。");
            }
        }
        catch (error) {
            failProductMode();
            globalError.value = error instanceof Error ? error.message : "暂时无法快速配桌，请稍后重试。";
        }
        finally {
            enteringLobby.value = false;
            if (!connected.value) {
                startingRoomMode.value = null;
            }
        }
    }
    function requestPracticeAutoStart() {
        pendingPracticeAutoStart.value = true;
        maybeAutoStartPractice();
    }
    async function finishTutorial(invite) {
        if (enteringLobby.value)
            return;
        await leaveRoom();
        if (invite)
            await startFriendLobby();
        else
            await startPracticeLobby();
    }
    async function startPracticeLobby(tutorial = false) {
        if (enteringLobby.value) {
            return;
        }
        const nickname = entryName.value.trim().slice(0, 16) || generateRandomNickname();
        entryName.value = nickname;
        startingRoomMode.value = "practice";
        enteringLobby.value = true;
        beginProductMode(tutorial ? "tutorial" : "practice");
        try {
            const response = await fetch(`${HTTP_URL}/rooms`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mode: "practice", tutorial }),
            });
            if (!response.ok) {
                throw new Error(await apiErrorMessage(response, "创建单人练习房间失败，请稍后重试。"));
            }
            const payload = (await response.json());
            if (!payload?.ok || !payload.roomId) {
                throw new Error(payload?.message || "创建单人练习房间失败");
            }
            const ok = await connect({
                nameOverride: nickname,
                roomId: payload.roomId,
                hostKey: payload.hostKey,
                forceNew: true,
            });
            if (!ok) {
                throw new Error(joinError.value || "进入大厅失败");
            }
            requestPracticeAutoStart();
        }
        catch (error) {
            failProductMode();
            globalError.value = error instanceof Error ? error.message : "进入大厅失败";
        }
        finally {
            enteringLobby.value = false;
            if (!connected.value) {
                startingRoomMode.value = null;
            }
        }
    }
    async function startFriendLobby() {
        if (enteringLobby.value) {
            return;
        }
        const nickname = entryName.value.trim().slice(0, 16) || generateRandomNickname();
        startingRoomMode.value = "friends";
        enteringLobby.value = true;
        beginProductMode("friends");
        try {
            const response = await fetch(`${HTTP_URL}/rooms`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mode: "friends" }),
            });
            if (!response.ok) {
                throw new Error(await apiErrorMessage(response, "创建好友房失败，请稍后重试。"));
            }
            const payload = (await response.json());
            if (!payload.ok || !payload.roomId || !payload.hostKey) {
                throw new Error(payload.message || "创建好友房失败");
            }
            const ok = await connect({
                nameOverride: nickname,
                roomId: payload.roomId,
                hostKey: payload.hostKey,
                forceNew: true,
                exposeRoomIdInUrl: true,
            });
            if (!ok) {
                throw new Error(joinError.value || "进入好友房失败");
            }
        }
        catch (error) {
            failProductMode();
            globalError.value = error instanceof Error ? error.message : "创建好友房失败";
        }
        finally {
            enteringLobby.value = false;
            if (!connected.value) {
                startingRoomMode.value = null;
            }
        }
    }
    return { returnToModeSelectionFromRoom, handleLeaveRoom, startLobbyMode, startSelectedMode, finishTutorial, startPracticeLobby };
}

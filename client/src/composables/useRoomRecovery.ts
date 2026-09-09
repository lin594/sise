import { computed, nextTick, ref, watch, type Ref } from "vue";
import type { useRoom } from "./useRoom";
import type { StartingRoomMode } from "./useRoomLifecycle";
import { readStoredValue } from "@/utils/safeStorage";
import { productVisitId, trackProductEvent } from "@/utils/productAnalytics";

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
export function useRoomRecovery({ state, connected, connect, retryConnection, connectionState, joinError, acceptedStateRevision, mySeatId, entryName, entryInviteRoomId, enteredFrontLobby, enteringLobby, restoringStoredSession, joiningFriendInvite, startingRoomMode, globalError, nicknameHistory, storedEntryNameAtBoot, nicknameHistoryAtBoot, generateRandomNickname, enterLobby, privateHandSynchronized, returnToModeSelectionFromRoom }: RecoveryOptions) {
  const confirmingResumeAbandon = ref(false);
  const syncExitButtonRef = ref<HTMLButtonElement | null>(null);
  const resumeAbandonDialogRef = ref<HTMLElement | null>(null);
  const resumeAbandonCancelRef = ref<HTMLButtonElement | null>(null);
  type StoredRoomSession = {
    roomId: string;
    playerToken: string;
    name: string;
  };

  function readBrowserStorage(key: string): string {
    return readStoredValue(key).trim();
  }

  function readStoredRoomSession(): StoredRoomSession | null {
    const query = new URLSearchParams(window.location.search);
    if (query.get("new") === "1") {
      return null;
    }
    const queryRoomId = query.get("roomId")?.trim() || "";
    const cachedRoomId = readBrowserStorage("four_room_id");
    const roomId = queryRoomId || cachedRoomId;
    if (!roomId) {
      return null;
    }
    const playerToken =
      readBrowserStorage(`four_player_token:${roomId}`) ||
      (roomId === cachedRoomId ? readBrowserStorage("four_player_token") : "");
    const name = entryName.value.trim() || readBrowserStorage("four_player_name");
    if (!playerToken || !name) {
      return null;
    }
    return { roomId, playerToken, name };
  }

  async function resumeStoredRoomSession(): Promise<void> {
    if (enteredFrontLobby.value || connected.value) {
      return;
    }
    const storedSession = readStoredRoomSession();
    if (!storedSession) {
      return;
    }
    entryName.value = storedSession.name;
    enteredFrontLobby.value = true;
    enteringLobby.value = true;
    restoringStoredSession.value = true;
    globalError.value = "";
    try {
      const ok = await connect({
        nameOverride: storedSession.name,
        roomId: storedSession.roomId,
        playerToken: storedSession.playerToken,
        reconnecting: true,
        preserveState: true,
      });
      if (!ok) {
        retryConnection();
      }
    } finally {
      enteringLobby.value = false;
      restoringStoredSession.value = false;
    }
  }

  async function bootstrapRoomEntry(): Promise<void> {
    const storedSession = readStoredRoomSession();
    if (storedSession) {
      await resumeStoredRoomSession();
      return;
    }
    entryName.value = entryName.value.trim() || nicknameHistory.value[0] || generateRandomNickname();
    if (entryInviteRoomId.value && !storedEntryNameAtBoot && nicknameHistoryAtBoot.length === 0) return;
    await enterLobby();
  }

  const syncCanRetry = computed(
    () => connectionState.value === "retry_wait" || connectionState.value === "failed",
  );
  const syncScreenCopy = computed(() => {
    if (connectionState.value === "closed" && entryInviteRoomId.value) {
      const practiceRoomRejected = joinError.value.includes("单人练习房");
      return {
        kicker: practiceRoomRejected ? "链接不可用" : "邀请已失效",
        title: practiceRoomRejected ? "这个练习房不能加入" : "这个好友房已经关闭",
        description: joinError.value || "房间已经结束或被回收，请返回玩法选择重新开始。",
        cancelLabel: "返回玩法选择",
      };
    }
    if (joiningFriendInvite.value) {
      return {
        kicker: "加入好友房",
        title: "正在进入朋友的牌桌",
        description: "正在连接房间，请稍候。请不要重复点击。",
        cancelLabel: "取消加入，返回玩法选择",
      };
    }
    if (entryInviteRoomId.value) {
      if (connectionState.value === "offline") {
        return {
          kicker: "等待网络",
          title: "联网后继续加入好友房",
          description: "邀请和昵称仍然保留；网络恢复后系统会自动继续。",
          cancelLabel: "放弃加入，返回玩法选择",
        };
      }
      return {
        kicker: "暂时未连上",
        title: "正在重新连接好友房",
        description: joinError.value || "系统会继续重试，你也可以立即重试或返回玩法选择。",
        cancelLabel: "放弃加入，返回玩法选择",
      };
    }
    if (startingRoomMode.value === "quick_match") {
      return {
        kicker: "快速配桌",
        title: "正在寻找牌友",
        description: "正在连接配桌服务，请稍候。",
        cancelLabel: "取消，返回玩法选择",
      };
    }
    if (startingRoomMode.value === "practice") {
      return {
        kicker: "单人练习",
        title: "正在准备练习牌桌",
        description: "正在连接牌桌，请稍候。",
        cancelLabel: "取消，返回玩法选择",
      };
    }
    if (startingRoomMode.value === "friends") {
      return {
        kicker: "好友同桌",
        title: "正在创建好友房",
        description: "正在连接牌桌，请稍候。",
        cancelLabel: "取消，返回玩法选择",
      };
    }
    if (connectionState.value === "closed") {
      return {
        kicker: "原牌局已关闭",
        title: "无法回到原来的牌桌",
        description: joinError.value || "原牌局已经结束，系统不会继续重试。",
        cancelLabel: "清除旧牌局并返回玩法选择",
      };
    }
    if (connectionState.value === "offline") {
      return {
        kicker: "等待网络",
        title: "联网后会自动继续",
        description: "你的座位和身份凭证仍保存在这台设备上，无需重新输入昵称。",
        cancelLabel: "放弃恢复，返回玩法选择",
      };
    }
    return {
      kicker: "恢复牌局",
      title: "正在回到原来的牌桌",
      description: "正在使用这台设备保存的房间身份恢复座位和手牌，请稍候。",
      cancelLabel: "放弃恢复，返回玩法选择",
    };
  });
  const syncCancelDialogCopy = computed(() => {
    if (startingRoomMode.value !== null) {
      return {
        title: "取消正在开始的玩法？",
        description: "牌桌仍在连接中。确认取消后会返回玩法选择。",
        keepLabel: "继续等待",
        confirmLabel: "取消并返回玩法选择",
      };
    }
    if (joiningFriendInvite.value) {
      return {
        title: "取消加入好友房？",
        description: "房间仍在连接中。确认取消后会停止本次加入并返回玩法选择。",
        keepLabel: "继续加入",
        confirmLabel: "取消并返回玩法选择",
      };
    }
    return {
      title: "放弃恢复原牌局？",
      description: "系统正在为你找回原来的座位和手牌。确认放弃后会清除这台设备保存的房间身份并返回玩法选择。",
      keepLabel: "继续恢复",
      confirmLabel: "放弃并返回玩法选择",
    };
  });
  async function requestResumeAbandon(): Promise<void> {
    confirmingResumeAbandon.value = true;
    await nextTick();
    resumeAbandonCancelRef.value?.focus();
  }

  function cancelResumeAbandon(): void {
    if (!confirmingResumeAbandon.value) {
      return;
    }
    confirmingResumeAbandon.value = false;
    void nextTick(() => document.querySelector<HTMLElement>("[data-testid='cancel-session-resume']")?.focus());
  }

  async function confirmResumeAbandon(): Promise<void> {
    confirmingResumeAbandon.value = false;
    await returnToModeSelectionFromRoom();
  }

  function trapResumeAbandonFocus(event: KeyboardEvent): void {
    const panel = resumeAbandonDialogRef.value;
    if (!panel) {
      return;
    }
    const focusable = Array.from(panel.querySelectorAll<HTMLElement>("button:not([disabled])"));
    if (!focusable.length) {
      event.preventDefault();
      panel.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel)) {
      event.preventDefault();
      first.focus();
    }
  }

  let productRecoveryId = "";
  let productRecoveryRevision = -1;
  watch(connectionState, (nextState) => {
    if (["offline", "reconnecting", "retry_wait"].includes(nextState) && !productRecoveryId) {
      productRecoveryRevision = acceptedStateRevision.value;
      productRecoveryId = `${productVisitId()}_${Date.now()}`;
      trackProductEvent("reconnect_started", { id: productRecoveryId, mode: state.value?.roomMode });
    }
    if (productRecoveryId && (nextState === "closed" || nextState === "failed")) {
      trackProductEvent("reconnect_failed", { id: productRecoveryId, mode: state.value?.roomMode });
      productRecoveryId = "";
    }
    if (nextState !== "closed") {
      return;
    }
    void nextTick(() => {
      const terminalAction = syncExitButtonRef.value
        ?? document.querySelector<HTMLButtonElement>("[data-testid='terminal-return-to-modes']");
      terminalAction?.focus({ preventScroll: true });
    });
  });

  watch(() => [connectionState.value, acceptedStateRevision.value, privateHandSynchronized.value, mySeatId.value], () => {
    if (productRecoveryId && connected.value && mySeatId.value && privateHandSynchronized.value && acceptedStateRevision.value > productRecoveryRevision) {
      trackProductEvent("reconnect_success", { id: productRecoveryId, mode: state.value?.roomMode });
      productRecoveryId = "";
    }
  });

  return { confirmingResumeAbandon, syncExitButtonRef, resumeAbandonDialogRef, resumeAbandonCancelRef, bootstrapRoomEntry, syncCanRetry, syncScreenCopy, syncCancelDialogCopy, requestResumeAbandon, cancelResumeAbandon, confirmResumeAbandon, trapResumeAbandonFocus };
}

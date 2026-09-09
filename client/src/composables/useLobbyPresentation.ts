import { computed, ref, watch, type Ref } from "vue";
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

export const lobbyModes: LobbyMode[] = [
  {
    id: "practice_bots" as const,
    name: "单人练习",
    description: "系统补 3 位电脑，马上开一局。适合第一次玩和熟悉规则。",
    badge: "推荐新手",
    enabled: true,
  },
  {
    id: "quick_match" as const,
    name: "快速配桌",
    description: "先等真人牌友；人数不足时电脑自动补位，不会一直空等。",
    badge: "一键开桌",
    enabled: true,
  },
  {
    id: "friends" as const,
    name: "好友同桌",
    description: "创建房间，把链接发给朋友；空位也可以添加电脑。",
    badge: "邀请朋友",
    enabled: true,
  },
];


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
export function useLobbyPresentation({ state, players, connected, mySeatId, matchClockSync, isWaiting, isHost, mePlayer, hasLobbySession, enteringLobby, roundStartPending, selectedLobbyMode, pendingPracticeAutoStart, lobbyReadyPending }: LobbyOptions) {
  const canPressStartGame = computed(
    () =>
      Boolean(connected.value) &&
      Boolean(state.value) &&
      Boolean(mySeatId.value) &&
      isWaiting.value &&
      isHost.value &&
      (state.value?.roomMode === "match"
        ? players.value.every((player) => player.isConfiguredBot || player.connected)
        : state.value?.roomMode !== "friends" ||
          (players.value.length === 4 &&
            players.value.every(
              (player) =>
                player.isConfiguredBot ||
                (player.connected &&
                  (player.clientId === state.value?.hostPlayerId || player.lobbyReady)),
            ))),
  );
  const canStartSelectedMode = computed(
    () =>
      !enteringLobby.value &&
      !roundStartPending.value &&
      ((!hasLobbySession.value &&
          (selectedLobbyMode.value === "practice_bots" ||
            selectedLobbyMode.value === "quick_match" ||
            selectedLobbyMode.value === "friends")) ||
        canPressStartGame.value),
  );
  const remainingFriendSeats = computed(() => Math.max(0, 4 - players.value.length));
  const hasOfflineFriend = computed(() =>
    players.value.some((player) => !player.isConfiguredBot && !player.connected),
  );
  const unreadyFriendCount = computed(
    () =>
      players.value.filter(
        (player) =>
          !player.isConfiguredBot &&
          player.clientId !== state.value?.hostPlayerId &&
          !player.lobbyReady,
      ).length,
  );
  const lobbyTitle = computed(() => {
    if (!isWaiting.value) {
      return "游戏模式选择";
    }
    if (state.value?.roomMode === "match") {
      return "正在快速配桌";
    }
    if (state.value?.roomMode !== "friends") {
      return "房间准备中";
    }
    if (!mySeatId.value) {
      return "请先选择座位";
    }
    if (hasOfflineFriend.value) {
      return "等待牌友重新上线";
    }
    if (remainingFriendSeats.value > 0) {
      return isHost.value ? `还差 ${remainingFriendSeats.value} 位即可开局` : "等待房主安排座位";
    }
    if (unreadyFriendCount.value > 0) {
      if (isHost.value) {
        return `还有 ${unreadyFriendCount.value} 位牌友未准备`;
      }
      return mePlayer.value?.lobbyReady
        ? `等待 ${unreadyFriendCount.value} 位牌友准备`
        : "请确认准备";
    }
    return isHost.value ? "四席已就绪" : "等待房主开始";
  });
  const lobbySubtitle = computed(() => {
    if (!isWaiting.value) {
      return "选择一种玩法。第一次玩，建议选单人练习。";
    }
    if (state.value?.roomMode === "match") {
      const humanCount = players.value.filter((player) => !player.isConfiguredBot).length;
      if (hasOfflineFriend.value) {
        return "有牌友正在恢复连接，座位会为对方暂时保留。";
      }
      return matchSecondsLeft.value > 0
        ? `已找到 ${humanCount} 位真人，${matchSecondsLeft.value} 秒后电脑补位自动开始。`
        : "正在准备开局，请稍候。";
    }
    if (state.value?.roomMode !== "friends") {
      return "正在补齐机器人并准备开始单人练习。";
    }
    if (!mySeatId.value) {
      return "请选择一个写着“等待入座”的空座位；入座后等待房主开始。";
    }
    if (isHost.value) {
      if (hasOfflineFriend.value) {
        return "有真人暂时离线；请等对方重新上线，或移出该座位后再安排电脑。";
      }
      if (remainingFriendSeats.value > 0) {
        return `把邀请链接发给朋友，或点击“补齐 ${remainingFriendSeats.value} 位电脑”后开始。`;
      }
      if (unreadyFriendCount.value > 0) {
        return `请等 ${unreadyFriendCount.value} 位真人牌友点击“我准备好了”。`;
      }
      return "四个座位都准备好了，请确认后开始好友对局。";
    }
    if (!mePlayer.value?.lobbyReady) {
      return "确认座位和设置后，请点击“我准备好了”。";
    }
    return "你已准备；等待房主开始，如需调整可取消准备。";
  });
  const lobbyStartLabel = computed(() => {
    if (!hasLobbySession.value) {
      if (enteringLobby.value) {
        if (selectedLobbyMode.value === "friends") return "正在创建好友房…";
        return selectedLobbyMode.value === "quick_match" ? "正在寻找牌友…" : "正在创建练习房…";
      }
      if (selectedLobbyMode.value === "friends") return "创建好友房";
      return selectedLobbyMode.value === "quick_match" ? "开始快速配桌" : "开始单人练习";
    }
    if (roundStartPending.value) {
      if (state.value?.roomMode === "match") return "正在补齐并开局…";
      return state.value?.roomMode === "friends" ? "正在开始好友对局…" : "正在开始练习…";
    }
    if (pendingPracticeAutoStart.value) {
      return "正在自动开始...";
    }
    if (state.value?.roomMode === "friends" && !mySeatId.value) {
      return "请先选择座位";
    }
    if (state.value?.roomMode === "match") {
      return "电脑补位，立即开始";
    }
    return isHost.value ? (state.value?.roomMode === "friends" ? "开始好友对局" : "开始单人练习") : "等待房主开始";
  });
  const lobbyStartHint = computed(() => {
    if (!hasLobbySession.value) return enteringLobby.value ? "请稍候，不用重复点击" : "";
    if (roundStartPending.value) return "开局请求已发送，请稍候";
    if (lobbyReadyPending.value !== null) return "准备状态已发送，请稍候";
    if (!isWaiting.value) return "";
    if (!mySeatId.value) return "请先选择一个空座位";
    if (state.value?.roomMode === "match") {
      if (hasOfflineFriend.value) {
        return "有牌友正在恢复连接，暂不能开始";
      }
      if (isHost.value) return "不想等待时，可立即补齐电脑";
      return matchSecondsLeft.value > 0
        ? `约 ${matchSecondsLeft.value} 秒后自动开始`
        : "正在准备自动开始";
    }
    if (!isHost.value) return mePlayer.value?.lobbyReady ? "已准备，等待房主开始" : "请先确认准备";
    if (state.value?.roomMode !== "friends") return "";
    if (players.value.length < 4) return `还差 ${4 - players.value.length} 个座位，可一键补电脑`;
    if (players.value.some((player) => !player.isConfiguredBot && !player.connected)) return "仍有真人玩家离线";
    if (unreadyFriendCount.value > 0) return `还有 ${unreadyFriendCount.value} 位牌友未准备`;
    return "四席已就绪，请点开始好友对局";
  });
  const nowMs = ref(Date.now());
  const matchSecondsLeft = computed(() => {
    const startsAt = Number(state.value?.matchStartsAt ?? 0);
    if (startsAt <= 0 || matchClockSync.value.deadline !== startsAt) {
      return 0;
    }
    const estimatedServerNow = nowMs.value + matchClockSync.value.offsetMs;
    return Math.max(0, Math.ceil((startsAt - estimatedServerNow) / 1000));
  });
  watch(
    () => state.value?.matchStartsAt,
    () => {
      // Keep the first rendered second aligned with the server deadline instead of
      // reusing a timer sample that may already be almost half a second old.
      nowMs.value = Date.now();
    },
    { flush: "sync" },
  );
  watch(
    () => [matchClockSync.value.deadline, matchClockSync.value.offsetMs] as const,
    () => {
      // A full snapshot can enrich the clock after its same-revision Schema
      // patch has already updated the room state. Refresh the local sample too,
      // otherwise the old sample plus the new offset can briefly add a second.
      nowMs.value = Date.now();
    },
    { flush: "sync" },
  );
  return { canPressStartGame, canStartSelectedMode, lobbyTitle, lobbySubtitle, lobbyStartLabel, lobbyStartHint, nowMs, matchSecondsLeft };
}

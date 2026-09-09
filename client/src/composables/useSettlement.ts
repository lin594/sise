import { computed, nextTick, ref, watch, type Ref } from "vue";
import type { Card, RenderedCardMode, RoundResultPlayer } from "@/types/game";
import type { useRoom } from "./useRoom";
import { getCardLabelText } from "@/utils/cardText";
import { beginProductMode, trackProductEvent } from "@/utils/productAnalytics";

type Room = ReturnType<typeof useRoom>;
type SettlementGroupBlock = {
  id: string;
  cards: Card[];
  badge?: string;
  label?: string;
  tone: "meld" | "fish" | "public" | "strong";
};

type SettlementOptions = Pick<Room, "state" | "huResult" | "roundResult" | "players" | "mySeatId" | "activeRoomId" | "nextRound" | "returnLobby" | "connect" | "leaveRoom" | "joinError"> & {
  isEnded: Readonly<Ref<boolean>>;
  isHost: Readonly<Ref<boolean>>;
  resolvedOwnCardMode: Readonly<Ref<RenderedCardMode>>;
  resolvedTableCardMode: Readonly<Ref<RenderedCardMode>>;
  entryName: Ref<string>;
  globalError: Ref<string>;
  enteredFrontLobby: Ref<boolean>;
  handleLeaveRoom: () => Promise<void>;
  generateRandomNickname: () => string;
  cardLabel: (card: Card) => string;
};

/** Public settlement presentation and receipt-locked transitions; scoring stays server-owned. */
export function useSettlement({ state, huResult, roundResult, players, mySeatId, activeRoomId, nextRound, returnLobby, connect, leaveRoom, joinError, isEnded, isHost, resolvedOwnCardMode, resolvedTableCardMode, entryName, globalError, enteredFrontLobby, handleLeaveRoom, generateRandomNickname, cardLabel }: SettlementOptions) {
  const settlementPanelRef = ref<HTMLElement | null>(null);
  const confirmingNextRound = ref(false);
  const nextRoundTriggerRef = ref<HTMLButtonElement | null>(null);
  const nextRoundDialogRef = ref<HTMLElement | null>(null);
  const nextRoundCancelRef = ref<HTMLButtonElement | null>(null);
  const confirmingReturnLobby = ref(false);
  const returnLobbyTriggerRef = ref<HTMLButtonElement | null>(null);
  const returnLobbyDialogRef = ref<HTMLElement | null>(null);
  const returnLobbyCancelRef = ref<HTMLButtonElement | null>(null);
  type SettlementTransition = "next_round" | "return_lobby";
  const settlementTransitionPending = ref<SettlementTransition | null>(null);
  let settlementTransitionReceiptTimer: number | null = null;
  const quickRematchPending = ref(false);
  const endPanelTitle = computed(() => {
    if (derivedWinnerId.value) {
      return "胡牌结算";
    }
    return "流局结算";
  });
  const derivedWinnerId = computed(() => {
    const explicit = huResult.value?.winnerId ?? roundResult.value?.winnerId;
    if (explicit) {
      return explicit;
    }
    const match = String(state.value?.lastAction ?? "").match(/^(\S+)\s+HU$/);
    return match?.[1] ?? "";
  });

  function participantDisplayName(player: { name: string; isConfiguredBot?: boolean }): string {
    return player.isConfiguredBot ? `${player.name}（机器人）` : player.name;
  }

  const winnerName = computed(() => {
    const winnerId = derivedWinnerId.value;
    if (!winnerId) {
      return "-";
    }
    const player = players.value.find((x) => x.clientId === winnerId);
    return player ? participantDisplayName(player) : winnerId;
  });
  const roundOutcomeText = computed(() => {
    if (!derivedWinnerId.value) {
      return "本局流局";
    }
    return derivedWinnerId.value === mySeatId.value ? "你胡牌了" : `${winnerName.value} 胡牌`;
  });

  const settlementPlayers = computed<RoundResultPlayer[]>(() => roundResult.value?.players ?? []);
  const settlementReady = computed(
    () => isEnded.value && Boolean(roundResult.value) && settlementPlayers.value.length === 4,
  );
  const isCumulativeSettlement = computed(() => roundResult.value?.scoringMode === "cumulative");
  const settlementRoundNumber = computed(() => Math.max(1, Number(roundResult.value?.roundNumber ?? 1)));
  const mySettlementPlayer = computed<RoundResultPlayer | null>(() =>
    settlementPlayers.value.find((player) => player.clientId === mySeatId.value) ?? null,
  );
  const orderedSettlementPlayers = computed<RoundResultPlayer[]>(() => {
    const winnerId = derivedWinnerId.value;
    return settlementPlayers.value
      .map((player, index) => ({ player, index }))
      .sort((a, b) => {
        const rank = (player: RoundResultPlayer): number => {
          if (player.clientId === mySeatId.value) return 0;
          if (winnerId && player.clientId === winnerId) return 1;
          return 2;
        };
        return rank(a.player) - rank(b.player) || a.index - b.index;
      })
      .map(({ player }) => player);
  });
  const remainingDeckPreview = computed<Card[]>(() => roundResult.value?.remainingDeck ?? []);

  function splitCardGroups(cards: Card[], sizes: number[]): Card[][] {
    const groups: Card[][] = [];
    let offset = 0;
    for (const size of sizes) {
      if (!Number.isFinite(size) || size <= 0) {
        continue;
      }
      const chunk = cards.slice(offset, offset + size);
      offset += size;
      if (chunk.length === size) {
        groups.push(chunk);
      }
    }
    if (!groups.length && cards.length) {
      groups.push([...cards]);
    }
    return groups;
  }

  function splitExposedGroupsWithKinds(cards: Card[], sizes: number[], kinds: string[]): Array<{ cards: Card[]; kind: string }> {
    const groups = splitCardGroups(cards, sizes);
    return groups.map((group, index) => ({
      cards: group,
      kind: kinds[index] ?? "",
    }));
  }

  function splitFishGroups(cards: Card[]): Card[][] {
    if (!cards.length) {
      return [];
    }
    if (cards.every((card) => card.color === "gold")) {
      return [[...cards]];
    }
    const grouped = new Map<string, Card[]>();
    for (const card of cards) {
      const key = `${card.color}:${card.type}`;
      const list = grouped.get(key) ?? [];
      list.push(card);
      grouped.set(key, list);
    }
    return [...grouped.values()];
  }

  function isSameSettlementFace(cards: Card[]): boolean {
    if (!cards.length) {
      return false;
    }
    const head = cards[0];
    return cards.every((card) => card.color === head.color && card.type === head.type);
  }

  function settlementBadge(cards: Card[], kind = ""): string | undefined {
    if (!cards.length) {
      return undefined;
    }
    const head = cards[0];
    if (kind === "peng" || kind === "Peng") {
      return "碰";
    }
    if (kind === "kai" || ["Quad", "JiangQuad", "GoldQuad"].includes(kind)) {
      return "开";
    }
    if (head.color === "gold" && cards.length >= 3) {
      return cards.length >= 4 ? "开" : "坎";
    }
    if (cards.length === 2 && isSameSettlementFace(cards)) {
      return "对";
    }
    if (isSameSettlementFace(cards)) {
      if (cards.length >= 4) {
        return "开";
      }
      if (cards.length === 3) {
        return "坎";
      }
      return undefined;
    }
    if (cards.length === 4) {
      return "鱼";
    }
    return undefined;
  }

  function settlementGroupLabel(cards: Card[], kind = ""): string | undefined {
    if (!cards.length) {
      return undefined;
    }
    const head = cards[0];
    if (head.color === "gold") {
      if (cards.length >= 4 || kind === "kai") {
        return "金条开";
      }
      if (cards.length === 3) {
        return "金条坎";
      }
      if (cards.length === 1) {
        return "金条单张";
      }
    }
    if (kind === "peng" || kind === "Peng") {
      return `${cardLabel(head)}碰`;
    }
    if (kind === "kai" || ["Quad", "JiangQuad", "GoldQuad"].includes(kind)) {
      return `${cardLabel(head)}开`;
    }
    if (isSameSettlementFace(cards)) {
      if (cards.length >= 4) {
        return `${cardLabel(head)}开`;
      }
      if (cards.length === 3) {
        return `${cardLabel(head)}坎`;
      }
      if (cards.length === 2) {
        return `${cardLabel(head)}对子`;
      }
      if (cards.length === 1 && head.type === "jiang") {
        return `${cardLabel(head)}单张`;
      }
    }
    const sameColor = cards.every((card) => card.color === head.color);
    const types = new Set(cards.map((card) => card.type));
    const colorPrefix = cardLabel(head).slice(0, 1);
    if (sameColor && cards.length === 3 && types.has("ju") && types.has("ma") && types.has("pao")) {
      return `${colorPrefix}车马炮架`;
    }
    if (sameColor && cards.length === 3 && types.has("jiang") && types.has("shi") && types.has("xiang")) {
      const faces = ["jiang", "shi", "xiang"]
        .map((type) => getCardLabelText({ color: head.color, type }).slice(1))
        .join("");
      return `${colorPrefix}${faces}架`;
    }
    if (cards.length === 4) {
      return `${cardLabel(head)}鱼`;
    }
    return settlementBadge(cards, kind);
  }

  function settlementTone(cards: Card[]): SettlementGroupBlock["tone"] {
    const head = cards[0];
    if (!head) {
      return "meld";
    }
    if (head.color === "gold" || (isSameSettlementFace(cards) && cards.length >= 3)) {
      return "strong";
    }
    if (cards.length === 1 && (head.type === "jiang" || head.color === "gold")) {
      return "public";
    }
    if (cards.length === 4) {
      return "fish";
    }
    return "meld";
  }

  function settlementGroupBlocks(player: RoundResultPlayer): SettlementGroupBlock[] {
    const blocks: SettlementGroupBlock[] = [];
    (player.winningGroups ?? []).forEach((group, index) => {
      blocks.push({
        id: `winning-${index}-${group.cards.map((card) => card.id).join("-")}`,
        cards: group.cards,
        badge: settlementBadge(group.cards, group.key),
        label: settlementGroupLabel(group.cards, group.key),
        tone: settlementTone(group.cards),
      });
    });
    splitExposedGroupsWithKinds(player.exposedArea ?? [], player.exposedGroupSizes ?? [], player.exposedGroupKinds ?? []).forEach(({ cards, kind }, index) => {
      blocks.push({
        id: `meld-${index}-${cards.map((card) => card.id).join("-")}`,
        cards,
        badge: settlementBadge(cards, kind),
        label: settlementGroupLabel(cards, kind),
        tone: settlementTone(cards),
      });
    });
    (player.generalArea ?? []).forEach((card, index) => {
      blocks.push({
        id: `public-${index}-${card.id}`,
        cards: [card],
        badge: settlementBadge([card]),
        label: settlementGroupLabel([card]),
        tone: settlementTone([card]),
      });
    });
    splitFishGroups(player.fishArea ?? []).forEach((cards, index) => {
      blocks.push({
        id: `fish-${index}-${cards.map((card) => card.id).join("-")}`,
        cards,
        badge: settlementBadge(cards),
        label: settlementGroupLabel(cards),
        tone: settlementTone(cards),
      });
    });
    return blocks;
  }

  function settlementHandBlocks(player: RoundResultPlayer): SettlementGroupBlock[] {
    if (isSettlementWinner(player)) {
      return (player.resolvedHandGroups ?? []).map((group, index) => ({
        id: `hand-${index}-${group.cards.map((card) => card.id).join("-")}`,
        cards: group.cards,
        badge: settlementBadge(group.cards, group.key),
        label: settlementGroupLabel(group.cards, group.key),
        tone: settlementTone(group.cards),
      }));
    }

    return groupHandWithHiddenKans(player.hand ?? [], Number(player.declaredKongs ?? 0));
  }

  function groupHandWithHiddenKans(cards: Card[], declaredKongs: number): SettlementGroupBlock[] {
    const used = new Set<string>();
    const byFace = new Map<string, Card[]>();
    for (const card of cards) {
      const key = card.color === "gold" ? "gold" : `${card.color}:${card.type}`;
      const list = byFace.get(key) ?? [];
      list.push(card);
      byFace.set(key, list);
    }

    const blocks: SettlementGroupBlock[] = [];
    let remainingDeclaredKongs = Math.max(0, Math.floor(Number(declaredKongs) || 0));
    for (const [key, sameFaceCards] of byFace.entries()) {
      const kanCount = Math.floor(sameFaceCards.length / 3);
      for (let index = 0; index < kanCount; index += 1) {
        const chunk = sameFaceCards.slice(index * 3, index * 3 + 3);
        if (chunk.length !== 3) {
          continue;
        }
        chunk.forEach((card) => used.add(card.id));
        const isDeclaredKan = remainingDeclaredKongs > 0;
        if (isDeclaredKan) {
          remainingDeclaredKongs -= 1;
        }
        blocks.push({
          id: `${isDeclaredKan ? "hidden-kan" : "peng"}-${key}-${index}-${chunk.map((card) => card.id).join("-")}`,
          cards: chunk,
          badge: isDeclaredKan ? "坎" : "碰",
          label: settlementGroupLabel(chunk),
          tone: settlementTone(chunk),
        });
      }
    }

    const looseCards = cards.filter((card) => !used.has(card.id));
    if (looseCards.length) {
      blocks.push({
        id: `loose-${looseCards.map((card) => card.id).join("-")}`,
        cards: looseCards,
        tone: "meld",
      });
    }
    return blocks;
  }

  function signedScore(value: number): string {
    if (value > 0) {
      return `+${value}`;
    }
    return `${value}`;
  }

  function scoreToneClass(value: number): string {
    if (value > 0) {
      return "positive";
    }
    if (value < 0) {
      return "negative";
    }
    return "neutral";
  }

  function isSettlementWinner(player: RoundResultPlayer): boolean {
    return Boolean(roundResult.value?.winnerId) && roundResult.value?.winnerId === player.clientId;
  }

  function settlementHandCardMode(playerId: string): RenderedCardMode {
    return playerId === mySeatId.value ? resolvedOwnCardMode.value : resolvedTableCardMode.value;
  }

  function huFormulaLineOrder(key: string): number {
    if (key === "HuBase") {
      return 0;
    }
    if (String(key).startsWith("HuBigMultiplier")) {
      return 2;
    }
    return 1;
  }

  const winnerSettlementPlayer = computed<RoundResultPlayer | null>(() => {
    const winnerId = roundResult.value?.winnerId;
    if (!winnerId) {
      return null;
    }
    return settlementPlayers.value.find((player) => player.clientId === winnerId) ?? null;
  });

  const huCalculationLines = computed(() =>
    (winnerSettlementPlayer.value?.scoreBreakdown ?? [])
      .filter((line) => /^Hu(Base|Win|BigMultiplier)/.test(String(line.key ?? "")))
      .map((line) => ({
        ...line,
        label: String(line.key ?? "").startsWith("HuBigMultiplier") ? "大胡整体 ×2" : line.label,
      }))
      .sort((a, b) => huFormulaLineOrder(a.key) - huFormulaLineOrder(b.key)),
  );

  const winnerPerOpponentScore = computed(() => {
    const winner = winnerSettlementPlayer.value;
    if (!winner) {
      return 0;
    }
    const payerCount = Math.max(1, settlementPlayers.value.filter((player) => player.clientId !== winner.clientId).length);
    return Math.round(winner.totalScore / payerCount);
  });

  function settlementScoreLines(player: RoundResultPlayer): Array<{ key: string; label: string; total: number }> {
    const winnerId = roundResult.value?.winnerId;
    if (!winnerId) {
      return (player.scoreBreakdown ?? []).map((line) => ({
        key: line.key,
        label: line.label,
        total: line.total,
      }));
    }
    const winner = settlementPlayers.value.find((item) => item.clientId === winnerId);
    const payers = settlementPlayers.value.filter((item) => item.clientId !== winnerId);
    const payerCount = payers.length || 1;
    const winnerPerOpponent = winner ? Math.round(winner.totalScore / payerCount) : 0;

    if (winnerId !== player.clientId) {
      const nonHuLines = (player.scoreBreakdown ?? [])
        .filter((line) => !/^Hu(Base|Lose|Win|BigMultiplier)/.test(String(line.key ?? "")))
        .map((line) => ({
          key: line.key,
          label: line.label,
          total: line.total,
        }));
      const huLine =
        winner && winnerPerOpponent
          ? [
              {
                key: `hu-pay-${winner.clientId}-${player.clientId}`,
                label: `${participantDisplayName(winner)} 收胡牌分`,
                total: -winnerPerOpponent,
              },
            ]
          : [];
      return [...huLine, ...nonHuLines];
    }
    return payers.map((payer) => ({
      key: `hu-pay-${payer.clientId}`,
      label: `${participantDisplayName(payer)} 付胡牌分`,
      total: winnerPerOpponent,
    }));
  }

  const endSummary = computed(() => {
    const action = String(state.value?.lastAction ?? "");
    if (action === "DECK_EMPTY" || action === "DRAW_GAME") {
      return "牌堆耗尽，流局。";
    }
    const noDiscardMatch = action.match(/^(\S+)\s+NO_DISCARD$/);
    if (noDiscardMatch) {
      const seatId = noDiscardMatch[1];
      const player = players.value.find((x) => x.clientId === seatId);
      return `${player ? participantDisplayName(player) : seatId} 无可弃牌，流局。`;
    }
    return "对局结束。";
  });


  const roundDealerCard = computed<Card | null>(() => {
    const card = state.value?.dealerCard ?? null;
    return card?.id ? card : null;
  });

  const showEndPanel = computed(() => Boolean(huResult.value) || Boolean(roundResult.value) || isEnded.value);
  watch(
    showEndPanel,
    (visible) => {
      if (visible) {
        void nextTick(() => settlementPanelRef.value?.focus());
        return;
      }
      clearSettlementTransitionPending();
      confirmingNextRound.value = false;
      confirmingReturnLobby.value = false;
    },
    { immediate: true },
  );
  const hasOtherHumanAtSettlement = computed(() =>
    players.value.some((player) => player.clientId !== mySeatId.value && !player.isConfiguredBot),
  );

  function clearSettlementTransitionPending(): void {
    settlementTransitionPending.value = null;
    if (settlementTransitionReceiptTimer !== null) {
      window.clearTimeout(settlementTransitionReceiptTimer);
      settlementTransitionReceiptTimer = null;
    }
  }

  function submitSettlementTransition(transition: SettlementTransition): boolean {
    if (
      settlementTransitionPending.value !== null ||
      !settlementReady.value ||
      !isHost.value ||
      state.value?.phase !== "ended"
    ) {
      return false;
    }
    globalError.value = "";
    const sent = transition === "next_round" ? nextRound() : returnLobby();
    if (!sent) {
      globalError.value = state.value?.roomMode === "practice"
        ? "网络未连接，下一局请求没有发送，请稍候重试。"
        : "网络未连接，整桌操作没有发送，请稍候重试。";
      return false;
    }
    if (transition === "next_round") trackProductEvent("play_again", { id: `${activeRoomId.value}_${state.value?.completedRounds}`, mode: state.value?.roomMode });
    settlementTransitionPending.value = transition;
    const requestedRoomId = activeRoomId.value;
    settlementTransitionReceiptTimer = window.setTimeout(() => {
      settlementTransitionReceiptTimer = null;
      if (
        settlementTransitionPending.value !== transition ||
        state.value?.phase !== "ended" ||
        activeRoomId.value !== requestedRoomId
      ) {
        return;
      }
      settlementTransitionPending.value = null;
      globalError.value = state.value?.roomMode === "practice"
        ? "暂未确认下一局，请再点一次。"
        : "暂未确认整桌操作，请再点一次。";
    }, 8_000);
    return true;
  }

  async function requestNextRound(): Promise<void> {
    if (!settlementReady.value || !isHost.value || settlementTransitionPending.value !== null) {
      return;
    }
    if (state.value?.roomMode !== "friends" || !hasOtherHumanAtSettlement.value) {
      submitSettlementTransition("next_round");
      return;
    }
    confirmingNextRound.value = true;
    await nextTick();
    nextRoundCancelRef.value?.focus();
  }

  async function rematchQuickTable(): Promise<void> {
    if (!settlementReady.value || state.value?.roomMode !== "match" || quickRematchPending.value) {
      return;
    }
    trackProductEvent("play_again", { id: `${activeRoomId.value}_${state.value?.completedRounds}`, mode: "match" });
    beginProductMode("match");
    quickRematchPending.value = true;
    globalError.value = "";
    const nickname = entryName.value.trim().slice(0, 16) || generateRandomNickname();
    try {
      await leaveRoom();
      const ok = await connect({
        nameOverride: nickname,
        forceNew: true,
        matchmaking: true,
      });
      if (!ok) {
        throw new Error(joinError.value || "暂时无法重新配桌，请稍后再试。");
      }
    } catch (error) {
      globalError.value = error instanceof Error ? error.message : "暂时无法重新配桌，请稍后再试。";
    } finally {
      quickRematchPending.value = false;
    }
  }

  async function returnPracticeToModeSelection(): Promise<void> {
    if (
      !settlementReady.value ||
      state.value?.roomMode !== "practice" ||
      state.value?.phase !== "ended" ||
      settlementTransitionPending.value !== null
    ) {
      return;
    }
    await handleLeaveRoom();
    enteredFrontLobby.value = true;
  }

  function cancelNextRound(): void {
    if (!confirmingNextRound.value) {
      return;
    }
    confirmingNextRound.value = false;
    void nextTick(() => nextRoundTriggerRef.value?.focus());
  }

  function confirmNextRound(): void {
    confirmingNextRound.value = false;
    submitSettlementTransition("next_round");
  }

  function trapNextRoundFocus(event: KeyboardEvent): void {
    const panel = nextRoundDialogRef.value;
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

  async function requestReturnLobby(): Promise<void> {
    if (!settlementReady.value || !isHost.value || settlementTransitionPending.value !== null) {
      return;
    }
    confirmingReturnLobby.value = true;
    await nextTick();
    returnLobbyCancelRef.value?.focus();
  }

  function cancelReturnLobby(): void {
    if (!confirmingReturnLobby.value) {
      return;
    }
    confirmingReturnLobby.value = false;
    void nextTick(() => returnLobbyTriggerRef.value?.focus());
  }

  function confirmReturnLobby(): void {
    confirmingReturnLobby.value = false;
    submitSettlementTransition("return_lobby");
  }

  function trapReturnLobbyFocus(event: KeyboardEvent): void {
    const panel = returnLobbyDialogRef.value;
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

  return {
    settlementPanelRef,
    confirmingNextRound,
    nextRoundTriggerRef,
    nextRoundDialogRef,
    nextRoundCancelRef,
    confirmingReturnLobby,
    returnLobbyTriggerRef,
    returnLobbyDialogRef,
    returnLobbyCancelRef,
    settlementTransitionPending,
    quickRematchPending,
    endPanelTitle,
    derivedWinnerId,
    participantDisplayName,
    roundOutcomeText,
    settlementPlayers,
    settlementReady,
    isCumulativeSettlement,
    settlementRoundNumber,
    mySettlementPlayer,
    orderedSettlementPlayers,
    remainingDeckPreview,
    settlementGroupBlocks,
    settlementHandBlocks,
    signedScore,
    scoreToneClass,
    isSettlementWinner,
    settlementHandCardMode,
    winnerSettlementPlayer,
    huCalculationLines,
    winnerPerOpponentScore,
    settlementScoreLines,
    endSummary,
    roundDealerCard,
    showEndPanel,
    clearSettlementTransitionPending,
    requestNextRound,
    rematchQuickTable,
    returnPracticeToModeSelection,
    cancelNextRound,
    confirmNextRound,
    trapNextRoundFocus,
    requestReturnLobby,
    cancelReturnLobby,
    confirmReturnLobby,
    trapReturnLobbyFocus
  };
}

import { computed, onMounted, onUnmounted, shallowRef, ref, triggerRef } from "vue";
import { Client, Room } from "colyseus.js";
import type { ActionType, AvailableAction, Card, PlayerState } from "@/types/game";

const WS_URL = (import.meta.env.VITE_SERVER_URL as string) || "ws://localhost:2567";

function asCardArray(input: unknown): Card[] {
  const isCard = (x: any): x is Card =>
    x &&
    typeof x === "object" &&
    typeof x.id === "string" &&
    typeof x.color === "string" &&
    typeof x.type === "string" &&
    x.id.length > 0 &&
    x.type.length > 0;

  if (Array.isArray(input)) {
    return (input as unknown[]).filter(isCard);
  }
  if (input && typeof (input as any)[Symbol.iterator] === "function") {
    return Array.from(input as Iterable<unknown>).filter(isCard);
  }
  if (input && typeof input === "object") {
    return Object.values(input as Record<string, unknown>).filter(isCard);
  }
  return [];
}

function normalizePlayer(raw: any): PlayerState {
  return {
    clientId: String(raw?.clientId ?? ""),
    name: String(raw?.name ?? ""),
    declaredKongs: Number(raw?.declaredKongs ?? 0),
    discardPile: asCardArray(raw?.discardPile),
    exposedArea: asCardArray(raw?.exposedArea),
    fishArea: asCardArray(raw?.fishArea),
  };
}

export function useRoom(playerName = "Player") {
  const connected = ref(false);
  const room = ref<Room | null>(null);
  const state = shallowRef<any>(null);
  const myId = ref("");
  const privateHand = ref<Card[]>([]);
  const availableActions = ref<AvailableAction[]>([]);
  const huResult = ref<{ winnerId: string; groups: string[] } | null>(null);
  const debugApplied = ref<{ scenario: string; ok: boolean; ts: number } | null>(null);

  async function connect() {
    const client = new Client(WS_URL);
    const joined = await client.joinOrCreate("four-color", { name: playerName });
    room.value = joined;
    myId.value = joined.sessionId;
    connected.value = true;

    joined.onStateChange((next) => {
      // Avoid toJSON() recursion on Schema; force Vue update on each patch instead.
      state.value = next;
      triggerRef(state);
    });
    joined.onMessage("private_hand", (payload: Card[]) => {
      privateHand.value = payload;
    });
    joined.onMessage("available_actions", (payload: AvailableAction[]) => {
      availableActions.value = payload;
    });
    joined.onMessage("hu_result", (payload: { winnerId: string; groups: string[] }) => {
      huResult.value = payload;
    });
    joined.onMessage("debug_applied", (payload: { scenario: string; ok: boolean; ts: number }) => {
      debugApplied.value = payload;
    });
  }

  function sendAction(action: ActionType) {
    if (!room.value) {
      return;
    }
    room.value.send("action", action);
  }

  function declareKongs(count: number) {
    room.value?.send("declare_kongs", count);
  }

  function debugSetup(scenario: string) {
    room.value?.send("debug_setup", scenario);
  }

  onMounted(() => {
    void connect();
  });

  onUnmounted(() => {
    room.value?.leave();
  });

  const players = computed<PlayerState[]>(() => {
    const playersMap = state.value?.players;
    if (!playersMap) {
      return [];
    }

    const out: PlayerState[] = [];
    if (typeof playersMap.forEach === "function") {
      playersMap.forEach((value: unknown) => {
        out.push(normalizePlayer(value));
      });
      return out;
    }

    return Object.values(playersMap as Record<string, unknown>).map((p) => normalizePlayer(p));
  });

  return {
    connected,
    myId,
    state,
    players,
    privateHand,
    availableActions,
    huResult,
    debugApplied,
    sendAction,
    declareKongs,
    debugSetup,
  };
}

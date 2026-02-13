import { computed, onMounted, onUnmounted, shallowRef, ref, triggerRef } from "vue";
import { Client } from "colyseus.js";
const WS_URL = import.meta.env.VITE_SERVER_URL || "ws://localhost:2567";
function asCardArray(input) {
    const isCard = (x) => x &&
        typeof x === "object" &&
        typeof x.id === "string" &&
        typeof x.color === "string" &&
        typeof x.type === "string" &&
        x.id.length > 0 &&
        x.type.length > 0;
    if (Array.isArray(input)) {
        return input.filter(isCard);
    }
    if (input && typeof input[Symbol.iterator] === "function") {
        return Array.from(input).filter(isCard);
    }
    if (input && typeof input === "object") {
        return Object.values(input).filter(isCard);
    }
    return [];
}
function normalizePlayer(raw) {
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
    const room = ref(null);
    const state = shallowRef(null);
    const myId = ref("");
    const privateHand = ref([]);
    const availableActions = ref([]);
    const huResult = ref(null);
    const debugApplied = ref(null);
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
        joined.onMessage("private_hand", (payload) => {
            privateHand.value = payload;
        });
        joined.onMessage("available_actions", (payload) => {
            availableActions.value = payload;
        });
        joined.onMessage("hu_result", (payload) => {
            huResult.value = payload;
        });
        joined.onMessage("debug_applied", (payload) => {
            debugApplied.value = payload;
        });
    }
    function sendAction(action) {
        if (!room.value) {
            return;
        }
        room.value.send("action", action);
    }
    function declareKongs(count) {
        room.value?.send("declare_kongs", count);
    }
    function debugSetup(scenario) {
        room.value?.send("debug_setup", scenario);
    }
    onMounted(() => {
        void connect();
    });
    onUnmounted(() => {
        room.value?.leave();
    });
    const players = computed(() => {
        const playersMap = state.value?.players;
        if (!playersMap) {
            return [];
        }
        const out = [];
        if (typeof playersMap.forEach === "function") {
            playersMap.forEach((value) => {
                out.push(normalizePlayer(value));
            });
            return out;
        }
        return Object.values(playersMap).map((p) => normalizePlayer(p));
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

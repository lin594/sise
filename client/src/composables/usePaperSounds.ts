import { onMounted, onUnmounted, watch, type Ref } from "vue";
import type { RoomStateSnapshot } from "@/types/game";
import { getRoundKey, TABLE_CARD_TRAVEL_MS } from "@/utils/gameFlowPresentation";

type PaperSound = "discard" | "meld";
type Readable<T> = Readonly<Ref<T>>;

// A short paper tap, with a second softer contact as a group settles.
function makePaperBuffer(context: AudioContext, sound: PaperSound): AudioBuffer {
  const rate = context.sampleRate;
  const length = Math.ceil(rate * (sound === "meld" ? 0.14 : 0.085));
  const buffer = context.createBuffer(1, length, rate);
  const samples = buffer.getChannelData(0);
  let grain = 0;
  for (let i = 0; i < length; i++) {
    const time = i / rate;
    const settle = time - 0.045;
    const secondTap = sound === "meld" && settle >= 0 ? 0.65 * Math.exp(-settle * 68) : 0;
    const envelope = Math.min(1, time * 1800) * (Math.exp(-time * 72) + secondTap);
    grain = grain * 0.62 + (Math.random() * 2 - 1) * 0.38;
    samples[i] = envelope * (0.24 * grain + 0.075 * Math.sin(2 * Math.PI * 175 * time));
  }
  return buffer;
}

export function usePaperSounds(options: {
  state: Readable<RoomStateSnapshot | null>;
  connected: Readable<boolean>;
  enabled: Readable<boolean>;
  narrating: Readable<boolean>;
}) {
  let context: AudioContext | undefined;
  const buffers = new Map<PaperSound, AudioBuffer>();
  const timers = new Set<number>();
  let scope = "";
  let seen = 0;

  function unlock() {
    if (!options.enabled.value) return;
    const Context = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;
    try {
      context ??= new Context();
      if (context.state === "suspended") void context.resume().catch(() => {});
    } catch { /* Visual feedback remains available without audio. */ }
  }

  function play(sound: PaperSound) {
    if (!context || context.state !== "running" || !options.enabled.value || options.narrating.value ||
        document.hidden || window.speechSynthesis?.speaking) return;
    const buffer = buffers.get(sound) ?? makePaperBuffer(context, sound);
    buffers.set(sound, buffer);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.onended = () => source.disconnect();
    source.start();
  }

  function clearPending() {
    for (const timer of timers) window.clearTimeout(timer);
    timers.clear();
  }

  // Snapshot history is the reconnect baseline. Only subsequently appended public moves can sound.
  watch([options.connected, () => options.state.value?.tableTransitions], () => {
    const state = options.state.value;
    const events = state?.tableTransitions ?? [];
    const nextScope = options.connected.value && state
      ? getRoundKey(state.roomId, state.completedRounds, state.phase) : "";
    if (!nextScope || nextScope !== scope) {
      clearPending();
      scope = nextScope;
      seen = events.at(-1)?.id ?? 0;
      return;
    }
    const clockOffset = state?.presentationClockOffsetMs ?? 0;
    const now = Date.now() + clockOffset;
    for (const event of events) {
      if (event.id <= seen) continue;
      seen = event.id;
      if (!options.enabled.value || document.hidden || event.endsAt <= now) continue;
      if (event.kind !== "discard" && event.kind !== "meld" && event.kind !== "hu") continue;
      const sound = event.kind === "discard" ? "discard" : "meld";
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        const current = options.state.value;
        if (options.connected.value && current?.tableTransitions?.some(item => item.id === event.id && item.round === event.round) &&
            Date.now() + (current.presentationClockOffsetMs ?? 0) < event.endsAt) play(sound);
      }, Math.max(0, event.startsAt + TABLE_CARD_TRAVEL_MS - now));
      timers.add(timer);
    }
  }, { immediate: true });
  watch(options.enabled, enabled => { if (!enabled) clearPending(); });
  const onVisibility = () => { if (document.hidden) clearPending(); };
  onMounted(() => {
    document.addEventListener("click", unlock);
    document.addEventListener("keydown", unlock);
    document.addEventListener("visibilitychange", onVisibility);
  });
  onUnmounted(() => {
    document.removeEventListener("click", unlock);
    document.removeEventListener("keydown", unlock);
    document.removeEventListener("visibilitychange", onVisibility);
    clearPending();
    if (context) void context.close().catch(() => {});
  });
}

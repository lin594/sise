import { onMounted, onUnmounted, watch, type Ref } from "vue";
import type { TurnAlertMode } from "@/types/game";

interface TurnAlertOptions {
  active: Readonly<Ref<boolean>>;
  decisionKey: Readonly<Ref<string>>;
  mode: Readonly<Ref<TurnAlertMode>>;
  spokenEnabled: Readonly<Ref<boolean>>;
  spokenMessage: Readonly<Ref<string>>;
}

type SafariWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

const ACTIVE_TITLE = "轮到你了 · 四色牌";

/**
 * 作用：在新的真人操作窗口开始时提供一次温和的听觉/触觉提醒。
 * 关键输入/输出：监听操作状态、唯一决策键与用户偏好；无返回值。
 * 副作用：短暂修改页面标题，并按偏好调用 Web Audio 与振动 API。
 */
export function useTurnAlert(options: TurnAlertOptions): void {
  let audioContext: AudioContext | null = null;
  let originalTitle = "四色牌";
  let lastAlertKey = "";
  let lastSoundKey = "";
  let lastSpokenKey = "";
  let speechTimer: number | null = null;

  const clearPendingSpeech = (): void => {
    if (speechTimer === null) {
      return;
    }
    window.clearTimeout(speechTimer);
    speechTimer = null;
  };

  const cancelSpeech = (): void => {
    clearPendingSpeech();
    if (typeof window.speechSynthesis !== "undefined") {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Native speech is optional; sound, vibration, and visual cues remain.
      }
    }
  };

  const speakCurrentDecision = (decisionKey: string): void => {
    const message = options.spokenMessage.value.trim();
    if (
      !options.spokenEnabled.value ||
      !decisionKey ||
      !message ||
      lastSpokenKey === decisionKey ||
      typeof window.speechSynthesis === "undefined" ||
      typeof window.SpeechSynthesisUtterance === "undefined"
    ) {
      return;
    }
    try {
      cancelSpeech();
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.lang = "zh-CN";
      utterance.rate = 0.88;
      utterance.pitch = 1;
      utterance.volume = 0.95;
      window.speechSynthesis.speak(utterance);
      lastSpokenKey = decisionKey;
    } catch {
      // Some embedded browsers expose the API but reject speech at runtime.
    }
  };

  const scheduleSpeech = (decisionKey: string): void => {
    clearPendingSpeech();
    if (
      !options.active.value ||
      !options.spokenEnabled.value ||
      !decisionKey ||
      lastSpokenKey === decisionKey
    ) {
      return;
    }
    // Public state, actions and the authoritative timer arrive as adjacent
    // patches. Briefly settle them so one decision gets one useful sentence.
    speechTimer = window.setTimeout(() => {
      speechTimer = null;
      if (!options.active.value || options.decisionKey.value !== decisionKey) {
        return;
      }
      speakCurrentDecision(decisionKey);
    }, 250);
  };

  const ensureAudioContext = (): AudioContext | null => {
    if (options.mode.value === "off") {
      return null;
    }
    if (!audioContext) {
      const AudioContextClass = window.AudioContext ?? (window as SafariWindow).webkitAudioContext;
      if (!AudioContextClass) {
        return null;
      }
      try {
        audioContext = new AudioContextClass();
      } catch {
        return null;
      }
    }
    if (audioContext.state === "suspended") {
      void audioContext.resume().catch(() => undefined);
    }
    return audioContext;
  };

  const playChime = (decisionKey: string): void => {
    if (!decisionKey || options.mode.value === "off" || lastSoundKey === decisionKey) {
      return;
    }
    const context = ensureAudioContext();
    if (!context || context.state !== "running") {
      return;
    }
    try {
      const now = context.currentTime;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(659.25, now);
      oscillator.frequency.setValueAtTime(880, now + 0.16);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.07, now + 0.025);
      gain.gain.setValueAtTime(0.07, now + 0.22);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.4);
      lastSoundKey = decisionKey;
    } catch {
      // Audio is a best-effort enhancement; the visual cue remains authoritative.
    }
  };

  const alertCurrentDecision = (decisionKey: string): void => {
    document.title = ACTIVE_TITLE;
    if (options.mode.value === "sound-vibration" && typeof navigator.vibrate === "function") {
      navigator.vibrate([110, 70, 150]);
    }
    playChime(decisionKey);
  };

  const unlockAudio = (): void => {
    const context = ensureAudioContext();
    if (!context) {
      return;
    }
    void context.resume().then(() => {
      if (options.active.value) {
        playChime(options.decisionKey.value);
      }
    }).catch(() => undefined);
  };

  watch(
    () => [options.active.value, options.decisionKey.value] as const,
    ([active, decisionKey]) => {
      if (!active || !decisionKey) {
        lastAlertKey = "";
        document.title = originalTitle;
        if (typeof navigator.vibrate === "function") {
          navigator.vibrate(0);
        }
        return;
      }
      if (lastAlertKey === decisionKey) {
        return;
      }
      lastAlertKey = decisionKey;
      alertCurrentDecision(decisionKey);
      scheduleSpeech(decisionKey);
    },
  );

  watch(
    () => [
      options.active.value,
      options.decisionKey.value,
      options.spokenEnabled.value,
      options.spokenMessage.value,
    ] as const,
    ([active, decisionKey, spokenEnabled]) => {
      if (!spokenEnabled || !active) {
        cancelSpeech();
        return;
      }
      scheduleSpeech(decisionKey);
    },
    { flush: "post" },
  );

  onMounted(() => {
    originalTitle = document.title || "四色牌";
    window.addEventListener("pointerdown", unlockAudio, { passive: true });
    window.addEventListener("keydown", unlockAudio);
  });

  onUnmounted(() => {
    window.removeEventListener("pointerdown", unlockAudio);
    window.removeEventListener("keydown", unlockAudio);
    cancelSpeech();
    document.title = originalTitle;
    if (typeof navigator.vibrate === "function") {
      navigator.vibrate(0);
    }
    if (audioContext) {
      void audioContext.close().catch(() => undefined);
      audioContext = null;
    }
  });
}

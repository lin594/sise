import { onMounted, onUnmounted, ref, watch } from "vue";
import type { CardDisplayMode, GameDisplayPreferences, TurnAlertMode } from "@/types/game";
import { normalizeSkin, normalizeTableLayout } from "@/utils/appearance";
import { readStoredValue, writeStoredValue } from "@/utils/safeStorage";

const DISPLAY_PREFERENCES_KEY = "sise_game_display_preferences_v2";
const LEGACY_TABLE_CARD_MODE_KEY = "sise_table_card_mode";

function normalizeCardDisplayMode(value: unknown): CardDisplayMode | null {
  return value === "large" || value === "adaptive" || value === "long" ? value : null;
}

function normalizeTurnAlertMode(value: unknown): TurnAlertMode {
  return value === "sound" || value === "off" || value === "sound-vibration" ? value : "sound-vibration";
}

function readDisplayPreferences(): GameDisplayPreferences {
  try {
    const stored = readStoredValue(DISPLAY_PREFERENCES_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<GameDisplayPreferences>;
      return {
        skin: normalizeSkin(parsed.skin),
        tableLayout: normalizeTableLayout(parsed.tableLayout),
        handLayout: parsed.handLayout === "paged" ? "paged" : "single",
        ownCards: normalizeCardDisplayMode(parsed.ownCards) ?? "adaptive",
        tableCards: normalizeCardDisplayMode(parsed.tableCards) ?? "adaptive",
        seatDirection: parsed.seatDirection === "clockwise" ? "clockwise" : "counterclockwise",
        turnAlert: normalizeTurnAlertMode(parsed.turnAlert),
        spokenTurnGuidance: parsed.spokenTurnGuidance === true,
        showCardColorAssist: parsed.showCardColorAssist === true,
        reduceMotion: parsed.reduceMotion === true,
        keepScreenAwake: parsed.keepScreenAwake !== false,
      };
    }
  } catch {
    // Invalid local preferences fall back to the compatible defaults below.
  }

  const legacyMode = readStoredValue(LEGACY_TABLE_CARD_MODE_KEY);
  return {
    skin: normalizeSkin(null),
    tableLayout: normalizeTableLayout(null),
    handLayout: "single",
    ownCards: "adaptive",
    tableCards: legacyMode === "simple" ? "large" : legacyMode === "full" ? "long" : "adaptive",
    seatDirection: "counterclockwise",
    turnAlert: "sound-vibration",
    spokenTurnGuidance: false,
    showCardColorAssist: false,
    reduceMotion: false,
    keepScreenAwake: true,
  };
}

/** Persist display choices with the existing legacy and restricted-storage fallback. */
export function useDisplayPreferences() {
  const displayPreferences = ref<GameDisplayPreferences>(readDisplayPreferences());
watch(
  displayPreferences,
  (preferences) => {
    writeStoredValue(DISPLAY_PREFERENCES_KEY, JSON.stringify(preferences));
    document.documentElement.classList.toggle("show-card-color-assist", preferences.showCardColorAssist);
  },
  { deep: true },
);

  onMounted(() => {
  writeStoredValue(DISPLAY_PREFERENCES_KEY, JSON.stringify(displayPreferences.value));
  document.documentElement.classList.toggle("show-card-color-assist", displayPreferences.value.showCardColorAssist);
  });
  onUnmounted(() => {
  document.documentElement.classList.remove("show-card-color-assist");
  });
  return displayPreferences;
}

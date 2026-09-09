import { computed, nextTick, ref } from "vue";
import { useGuestProfile } from "./useGuestProfile";
import { readStoredValue, writeStoredValue } from "@/utils/safeStorage";
export const ENTRY_NAME_KEY = "sise_entry_name";
/** Local entry identity and nickname UI, backed by the existing guest profile. */
export function useEntryProfile({ browserStoragePersistent, canChangeName }) {
    function randomFrom(list) {
        return list[Math.floor(Math.random() * list.length)] ?? list[0] ?? "玩家";
    }
    function generateRandomNickname() {
        const prefix = ["青", "白", "赤", "黄", "东", "南", "西", "北", "云", "风", "星", "月"];
        const suffix = ["雀客", "牌友", "棋童", "将军", "行者", "小侠", "掌柜", "阿福", "阿宁", "子衿"];
        return `${randomFrom(prefix)}${randomFrom(suffix)}`;
    }
    function readNicknameHistory() {
        try {
            const raw = readStoredValue("sise_entry_name_history") || "[]";
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) {
                return [];
            }
            return parsed.map((item) => String(item ?? "").trim()).filter(Boolean).slice(0, 8);
        }
        catch {
            return [];
        }
    }
    function writeNicknameHistory(names) {
        writeStoredValue("sise_entry_name_history", JSON.stringify(names.slice(0, 8)));
    }
    const { profile: guestProfile, refresh: refreshGuestProfile, refreshAfterSettlement: refreshGuestProfileAfterSettlement, updateNickname: updateGuestProfileNickname, } = useGuestProfile();
    void refreshGuestProfile();
    const storedEntryNameAtBoot = readStoredValue(ENTRY_NAME_KEY).trim();
    const nicknameHistoryAtBoot = readNicknameHistory();
    const entryName = ref(storedEntryNameAtBoot);
    const nicknameHistory = ref(nicknameHistoryAtBoot);
    const guestProfileSummary = computed(() => {
        if (!browserStoragePersistent)
            return "";
        const current = guestProfile.value;
        if (!current)
            return "";
        return current.roundsPlayed > 0
            ? `已玩 ${current.roundsPlayed} 局 · 胡 ${current.huWins} 局`
            : "还没有完成牌局";
    });
    const nicknameDialogOpen = ref(false);
    const nicknameDraftRandom = ref("");
    let nicknameReturnFocus = null;
    async function openNicknameDialog() {
        if (!canChangeName())
            return;
        nicknameReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        nicknameDialogOpen.value = true;
    }
    async function closeNicknameDialog() {
        nicknameDialogOpen.value = false;
        await nextTick();
        nicknameReturnFocus?.focus();
    }
    function saveNickname(value) {
        const nickname = value.trim().slice(0, 16);
        if (!nickname)
            return;
        entryName.value = nickname;
        writeStoredValue(ENTRY_NAME_KEY, nickname);
        nicknameHistory.value = [nickname, ...nicknameHistory.value.filter(name => name !== nickname)].slice(0, 8);
        writeNicknameHistory(nicknameHistory.value);
        void updateGuestProfileNickname(nickname);
        void closeNicknameDialog();
    }
    return { guestProfile, refreshGuestProfileAfterSettlement, updateGuestProfileNickname, guestProfileSummary, storedEntryNameAtBoot, nicknameHistoryAtBoot, entryName, nicknameHistory, nicknameDialogOpen, nicknameDraftRandom, generateRandomNickname, writeNicknameHistory, openNicknameDialog, closeNicknameDialog, saveNickname };
}

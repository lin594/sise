import { computed, ref, watch, type Ref } from "vue";
import { readStoredValue, writeStoredValue } from "@/utils/safeStorage";
import { trackProductEvent } from "@/utils/productAnalytics";

const COPY = {
  hu: "接上这张牌就能胡，点“胡”查看结算。",
  kai: "用手中的三张牌接上中央这张，点“开”组成一组。",
  peng: "「碰」已可用：用两张相同的手牌收下中央这张，再弃一张牌。",
  chi: "「吃」已可用：中央牌能与手牌成组；有多种组合时先选组合。",
  grab: "「抓」会放过上家的待响应牌，从牌堆翻一张，再判断能否成组。",
  pass: "「过」会放弃这张牌的响应机会，牌局继续。",
  fish: "选择开局要亮出的鱼，再点“确认鱼”。",
  kan: "坎是三张同色同字的牌，三张金条也可成坎。亮鱼后再选择要声明的坎数。",
  general: "将已亮入公将区，不能当普通手牌主动打出。",
} as const;
export type HintConcept = keyof typeof COPY;
const KEY = "sise_context_hints_v1";

export function useContextHints(concepts: Ref<HintConcept[]>, decisionKey: Ref<string>) {
  let saved: { enabled?: boolean; seen?: unknown } = {};
  try { saved = JSON.parse(readStoredValue(KEY) || "{}"); } catch { /* Corrupt or unavailable storage starts a fresh local session. */ }
  const enabled = ref(saved?.enabled !== false);
  const seen = new Set<HintConcept>(Array.isArray(saved?.seen) ? saved.seen.filter((key): key is HintConcept => typeof key === "string" && Object.hasOwn(COPY, key)) : []);
  const current = ref<HintConcept | null>(null);
  const resetEpoch = ref(0);
  const persist = () => writeStoredValue(KEY, JSON.stringify({ enabled: enabled.value, seen: [...seen] }));
  watch([() => concepts.value.join("|"), decisionKey, enabled, resetEpoch], () => {
    current.value = null;
    if (!enabled.value) return;
    const concept = concepts.value.find(key => !seen.has(key));
    if (!concept) return;
    seen.add(concept); persist(); current.value = concept;
    trackProductEvent("context_hint_shown");
  }, { immediate: true, flush: "post" });
  const setEnabled = (value: boolean) => {
    if (enabled.value === value) return;
    enabled.value = value; persist();
    if (!value) trackProductEvent("context_hint_disabled");
  };
  return {
    enabled, current, text: computed<string>(() => current.value ? COPY[current.value] : ""),
    dismiss: () => { current.value = null; }, setEnabled,
    reset: () => { seen.clear(); enabled.value = true; resetEpoch.value++; persist(); },
  };
}

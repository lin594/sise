import { type Ref } from "vue";
declare const COPY: {
    readonly hu: "「胡」已可用：服务端确认手牌可以全部成组，点胡后查看计分。";
    readonly kai: "「开」已可用：三张手牌可与中央牌开成组。开成功后可抵一组已声明的坎。";
    readonly peng: "「碰」已可用：用两张相同的手牌收下中央这张，再弃一张牌。";
    readonly chi: "「吃」已可用：中央牌能与手牌成组；有多种组合时先选组合。";
    readonly grab: "「抓」会放过上家的待响应牌，从牌堆翻一张，再判断能否成组。";
    readonly pass: "「过」会放弃这张牌的响应机会，牌局继续。";
    readonly fish: "先亮鱼：从服务端给出的候选中选择要亮出的同牌组，再声明坎。";
    readonly kan: "声明坎只约束数量。整局须保留足够暗坎；转成开后可抵扣，碰和鱼不抵扣。";
    readonly general: "将已亮入公将区，不能当普通手牌主动打出。";
};
export type HintConcept = keyof typeof COPY;
export declare function useContextHints(concepts: Ref<HintConcept[]>, decisionKey: Ref<string>): {
    enabled: Ref<boolean, boolean>;
    current: Ref<"hu" | "kai" | "peng" | "chi" | "grab" | "pass" | "fish" | "kan" | "general" | null, "hu" | "kai" | "peng" | "chi" | "grab" | "pass" | "fish" | "kan" | "general" | null>;
    text: import("vue").ComputedRef<"「胡」已可用：服务端确认手牌可以全部成组，点胡后查看计分。" | "「开」已可用：三张手牌可与中央牌开成组。开成功后可抵一组已声明的坎。" | "「碰」已可用：用两张相同的手牌收下中央这张，再弃一张牌。" | "「吃」已可用：中央牌能与手牌成组；有多种组合时先选组合。" | "「抓」会放过上家的待响应牌，从牌堆翻一张，再判断能否成组。" | "「过」会放弃这张牌的响应机会，牌局继续。" | "先亮鱼：从服务端给出的候选中选择要亮出的同牌组，再声明坎。" | "声明坎只约束数量。整局须保留足够暗坎；转成开后可抵扣，碰和鱼不抵扣。" | "将已亮入公将区，不能当普通手牌主动打出。" | "">;
    dismiss: () => void;
    setEnabled: (value: boolean) => void;
    reset: () => void;
};
export {};

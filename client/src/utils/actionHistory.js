const ACTOR_FIRST_PREFIXES = ["seat_", "bot_"];
const ACTOR_SECOND_ACTIONS = new Set([
    "DEALER",
    "DEALER_PICK",
    "DEALER_CARD",
    "OFFLINE",
    "RECONNECT_WAIT",
    "TAKEOVER",
]);
const IGNORED_ACTIONS = new Set(["NO_RESPONSE", "TURN_DRAW", "KONG_DRAW"]);
const ACTION_TEXT = {
    DISCARD: "打出一张牌",
    PENG: "碰牌",
    CHI: "吃牌",
    KAI: "开牌",
    HU: "胡牌",
    ZHUA: "抓牌",
    PASS: "把牌让给下家",
    TIMEOUT_PASS: "超时，系统自动过",
    TIMEOUT_DISCARD: "超时，系统自动出牌",
    FORCE_TAKE: "收下将或金条",
    DRAW_GENERAL: "摸取公共将",
    DRAW_GAME: "本局流局",
    DEALER: "成为庄家",
    DEALER_PICK: "翻开定庄牌",
    DEALER_CARD: "定庄牌揭晓",
    OFFLINE: "暂时离线",
    RECONNECT_WAIT: "断线，等待恢复",
    TAKEOVER: "断线超时，暂由机器人托管",
};
function isSeatId(value) {
    return Boolean(value && ACTOR_FIRST_PREFIXES.some((prefix) => value.startsWith(prefix)));
}
export function parseActionDescriptor(action) {
    const parts = String(action ?? "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) {
        return { actorId: "", actionKey: "" };
    }
    if (isSeatId(parts[0])) {
        return { actorId: parts[0], actionKey: parts[1] ?? "" };
    }
    if (ACTOR_SECOND_ACTIONS.has(parts[0]) && isSeatId(parts[1])) {
        return { actorId: parts[1], actionKey: parts[0] };
    }
    return { actorId: "", actionKey: parts[0] };
}
export function actionHistoryText(actionKey) {
    if (!actionKey || IGNORED_ACTIONS.has(actionKey)) {
        return null;
    }
    return ACTION_TEXT[actionKey] ?? null;
}

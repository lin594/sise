import { expect, test } from "@playwright/test";
import { actionHistoryText, parseActionDescriptor } from "../../client/src/utils/actionHistory";

test("action history identifies actors in both server action formats", () => {
  expect(parseActionDescriptor("seat_2 DISCARD")).toEqual({ actorId: "seat_2", actionKey: "DISCARD" });
  expect(parseActionDescriptor("bot_3 FORCE_TAKE")).toEqual({ actorId: "bot_3", actionKey: "FORCE_TAKE" });
  expect(parseActionDescriptor("DEALER_PICK seat_1")).toEqual({ actorId: "seat_1", actionKey: "DEALER_PICK" });
  expect(parseActionDescriptor("TAKEOVER seat_2")).toEqual({ actorId: "seat_2", actionKey: "TAKEOVER" });
  expect(parseActionDescriptor("DRAW_GAME")).toEqual({ actorId: "", actionKey: "DRAW_GAME" });
});

test("action history exposes only player-facing Chinese events", () => {
  expect(actionHistoryText("TIMEOUT_DISCARD")).toBe("超时，系统自动出牌");
  expect(actionHistoryText("FORCE_TAKE")).toBe("收下将或金条");
  expect(actionHistoryText("RECONNECT_WAIT")).toBe("断线，等待恢复");
  expect(actionHistoryText("TURN_DRAW")).toBeNull();
  expect(actionHistoryText("DEBUG_EVENT")).toBeNull();
});

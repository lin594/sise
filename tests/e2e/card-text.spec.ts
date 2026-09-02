import { expect, test } from "@playwright/test";
import { getCardAccessibleText, getCardFaceText, getCardLabelText } from "../../client/src/utils/cardText";

test("card text preserves the traditional face while naming its color", () => {
  const card = { color: "red", type: "jiang" };
  expect(getCardFaceText(card)).toBe("帥");
  expect(getCardLabelText(card)).toBe("红帥");
  expect(getCardAccessibleText(card)).toBe("红帥");
});

test("gold cards are announced as gold bars with their individual face", () => {
  expect(getCardAccessibleText({ color: "gold", type: "hou" })).toBe("金条侯");
});

test("the active response card is announced without relying on its star marker", () => {
  expect(getCardAccessibleText({ color: "green", type: "xiang", isResponseCard: true })).toBe(
    "绿象，待响应牌",
  );
});

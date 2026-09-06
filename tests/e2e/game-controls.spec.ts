import { expect, test } from "@playwright/test";
import { finishDeclarationIfNeeded } from "./helpers/game";

test("a player can explicitly enable and cancel auto play", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("nickname-input").fill("托管体验玩家");
  await page.getByTestId("login-submit").click();
  await expect(page.getByText("游戏模式选择")).toBeVisible();
  await page.getByTestId("lobby-start").click();
  await finishDeclarationIfNeeded(page);

  const autoPlay = page.getByTestId("game-auto-play");
  await expect(autoPlay).toHaveAttribute("aria-pressed", "false");
  await autoPlay.click();
  await expect(page.getByRole("dialog", { name: "让机器人替你操作？" })).toBeVisible();
  await page.getByTestId("confirm-auto-play").click();

  await expect(autoPlay).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("status").filter({ hasText: "机器人正在替你操作，可在顶部取消托管" })).toBeVisible();

  await autoPlay.click();
  await expect(autoPlay).toHaveAttribute("aria-pressed", "false");
});

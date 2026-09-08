import { openGameAs, startLobbyAction, finishDeclarationIfNeeded } from "./helpers/game";
import { expect, test } from "@playwright/test";

test("a player can explicitly enable and cancel auto play", async ({ page }) => {
  await openGameAs(page, "/", "托管体验玩家");
  await expect(page.getByText("游戏模式选择")).toBeVisible();
  await startLobbyAction(page);

  await finishDeclarationIfNeeded(page);

  const autoPlay = page.getByTestId("game-auto-play");
  await expect(autoPlay).toHaveAttribute("aria-pressed", "false");
  await autoPlay.click();
  await expect(page.getByRole("dialog", { name: "让机器人替你操作？" })).toBeVisible();
  await page.getByTestId("confirm-auto-play").click();

  await expect(autoPlay).toHaveAttribute("aria-pressed", "true");
  await expect(autoPlay).toHaveAttribute("aria-label", "取消托管，恢复自己操作");
  await expect(autoPlay).toHaveText("取消托管");

  await autoPlay.click();
  await expect(autoPlay).toHaveAttribute("aria-pressed", "false");
});

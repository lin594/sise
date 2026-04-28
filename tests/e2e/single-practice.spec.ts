import { expect, test, type Locator, type Page } from "@playwright/test";

async function snapshotBoard(page: Page) {
  return page.evaluate(() => {
    const handCards = Array.from(document.querySelectorAll("[data-testid^='hand-card-']")).map((el) =>
      (el as HTMLElement).dataset.testid ?? "",
    );
    return {
      handCards,
      bodyExcerpt: document.body.innerText.slice(0, 1200),
    };
  });
}

async function assertOpeningDealDoesNotRevealFullHand(page: Page): Promise<void> {
  const samples: Array<{ handCount: number; bodyExcerpt: string }> = [];
  const deadline = Date.now() + 3400;
  while (Date.now() < deadline) {
    const hasDeclarePanel = await page.getByText("声明暗坎与亮鱼").isVisible().catch(() => false);
    if (hasDeclarePanel) {
      break;
    }
    const board = await snapshotBoard(page);
    samples.push({
      handCount: board.handCards.length,
      bodyExcerpt: board.bodyExcerpt,
    });
    if (board.handCards.length >= 20) {
      throw new Error(
        `Opening deal intro revealed a full hand before declaration. Samples=${JSON.stringify(samples.slice(-8))}`,
      );
    }
    await page.waitForTimeout(80);
  }
}

async function clickFirstVisible(locator: Locator): Promise<boolean> {
  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    const item = locator.nth(index);
    if ((await item.isVisible().catch(() => false)) && (await item.isEnabled().catch(() => false))) {
      const clicked = await item.click({ force: true, timeout: 800 }).then(() => true, () => false);
      if (clicked) {
        return true;
      }
    }
  }
  return false;
}

async function playUntilSettlement(page: Page): Promise<void> {
  const deadline = Date.now() + 360_000;
  const settlementTitle = page.getByText(/胡牌结算|流局结算/).first();
  while (Date.now() < deadline) {
    if (await settlementTitle.isVisible().catch(() => false)) {
      return;
    }
    if (await page.getByRole("button", { name: "下一局（房主）" }).isVisible().catch(() => false)) {
      return;
    }
    if (await clickFirstVisible(page.locator(".candidate-item"))) {
      await page.waitForTimeout(120);
      continue;
    }
    if (await page.getByRole("button", { name: "确认声明" }).isVisible().catch(() => false)) {
      const declareButton = page.getByRole("button", { name: "确认声明" });
      if (await declareButton.isEnabled().catch(() => false)) {
        await declareButton.click();
        await page.waitForTimeout(120);
        continue;
      }
    }
    const actionIds = ["action-hu", "action-kai", "action-peng", "action-chi", "action-pass"];
    let acted = false;
    for (const id of actionIds) {
      const action = page.getByTestId(id);
      if ((await action.isVisible().catch(() => false)) && (await action.isEnabled().catch(() => false))) {
        acted = await action.click({ force: true, timeout: 800 }).then(() => true, () => false);
        if (acted) {
          break;
        }
      }
    }
    if (acted) {
      await page.waitForTimeout(120);
      continue;
    }
    if (await clickFirstVisible(page.locator("[data-testid^='hand-card-']"))) {
      await page.waitForTimeout(120);
      continue;
    }
    await page.waitForTimeout(200);
  }
  const finalSnapshot = await page.evaluate(() => ({
    bodyText: document.body.innerText.slice(0, 2000),
    buttons: Array.from(document.querySelectorAll("button"))
      .map((button) => ({
        text: button.textContent?.trim() ?? "",
        disabled: (button as HTMLButtonElement).disabled,
      }))
      .filter((button) => button.text),
  }));
  console.log(`[settlement-timeout] ${JSON.stringify(finalSnapshot)}`);
  throw new Error("Timed out before settlement");
}

test("single practice flow reaches settlement", async ({ page }) => {
  test.setTimeout(420_000);

  await page.goto("/");

  await page.getByTestId("random-nickname").click();
  await page.getByTestId("login-submit").click();

  await expect(page.getByText("游戏模式选择")).toBeVisible();
  await page.getByTestId("lobby-start").click();

  await expect(
    page
      .getByTestId("game-board")
      .or(page.getByText("声明暗坎与亮鱼"))
      .or(page.getByText("房间准备中")),
  ).toBeVisible();

  await assertOpeningDealDoesNotRevealFullHand(page);

  await playUntilSettlement(page);

  await expect(page.getByText(/胡牌结算|流局结算/)).toBeVisible();
});

import { expect, test, type Locator, type Page } from "@playwright/test";

test.use({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true });

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
    const hasDeclarePanel = await page.getByText(/声明(?:鱼和|亮鱼与)暗坎/).isVisible().catch(() => false);
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
    if (
      (await item.isVisible({ timeout: 300 }).catch(() => false)) &&
      (await item.isEnabled({ timeout: 300 }).catch(() => false))
    ) {
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
    if (await page.getByTestId("confirm-declaration").isVisible().catch(() => false)) {
      const declareButton = page.getByTestId("confirm-declaration");
      if (await declareButton.isEnabled({ timeout: 300 }).catch(() => false)) {
        await declareButton.click();
        await page.waitForTimeout(120);
        continue;
      }
    }
    const responsePhase = await page.getByTestId("game-board").getAttribute("data-response-phase");
    const actionIds = responsePhase === "collective"
      ? ["action-hu", "action-pass", "action-deferred-pass", "action-kai", "action-peng", "action-chi"]
      : ["action-hu", "action-pass", "action-chi", "action-kai", "action-peng"];
    let acted = false;
    for (const id of actionIds) {
      const action = page.getByTestId(id);
      if (
        (await action.isVisible({ timeout: 300 }).catch(() => false)) &&
        (await action.isEnabled({ timeout: 300 }).catch(() => false))
      ) {
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
    const handCards = page.locator("[data-testid^='hand-card-']");
    for (let index = 0; index < await handCards.count(); index += 1) {
      const card = handCards.nth(index);
      if (
        !(await card.isVisible({ timeout: 300 }).catch(() => false)) ||
        !(await card.isEnabled({ timeout: 300 }).catch(() => false))
      ) {
        continue;
      }
      const handBeforeSelection = await snapshotBoard(page);
      await card.click({ force: true });
      await card.dblclick({ force: true });
      await expect(card).toHaveAttribute("aria-pressed", "true");
      const handAfterSelection = await snapshotBoard(page);
      expect(handAfterSelection.handCards).toEqual(handBeforeSelection.handCards);
      const discardConfirm = page.getByTestId("discard-confirm");
      await expect(discardConfirm).toBeEnabled();
      await discardConfirm.click({ force: true });
      acted = true;
      break;
    }
    if (acted) {
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

test("single practice flow reaches settlement", async ({ page }, testInfo) => {
  test.setTimeout(420_000);

  await page.goto("/");

  await page.getByTestId("random-nickname").click();
  await page.getByTestId("login-submit").click();

  await expect(page.getByText("游戏模式选择")).toBeVisible();
  await page.getByTestId("lobby-start").click();

  await expect(
    page
      .getByTestId("game-board")
      .or(page.getByText(/声明(?:鱼和|亮鱼与)暗坎/))
      .or(page.getByText("房间准备中")),
  ).toBeVisible();

  await assertOpeningDealDoesNotRevealFullHand(page);

  await playUntilSettlement(page);

  await expect(page.getByText(/胡牌结算|流局结算/)).toBeVisible();
  const settlementPanel = page.getByTestId("settlement-panel");
  const nextRoundButton = page.getByRole("button", { name: /下一局（房主）|正在结算…/ });
  if (await page.getByTestId("settlement-loading").isVisible().catch(() => false)) {
    await expect(settlementPanel).toHaveAttribute("aria-busy", "true");
    await expect(nextRoundButton).toBeDisabled();
  }
  const settlementList = page.locator(".settlement-list");
  await expect(settlementList).toBeVisible({ timeout: 10_000 });
  await expect(settlementPanel).toHaveAttribute("aria-busy", "false");
  await expect(page.getByTestId("round-overview")).toContainText("你本局");
  await expect(page.locator(".settlement-item").first().locator(".settlement-name")).toContainText("（你）");
  await expect(page.getByTestId("settlement-bot-identity")).toHaveCount(3);
  await expect(page.getByTestId("settlement-bot-identity")).toHaveText(["机器人", "机器人", "机器人"]);
  await expect(page.getByText(/最后动作/)).toHaveCount(0);
  await expect(page.getByTestId("game-tools")).toBeVisible();
  await expect(page.getByRole("button", { name: "下一局（房主）" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "全桌返回大厅（房主）" })).toBeEnabled();
  const settlementMetrics = await settlementList.evaluate((list) => {
    const panel = document.querySelector<HTMLElement>("[data-testid='settlement-panel']")!;
    const header = document.querySelector<HTMLElement>("[data-testid='game-control-header']")!;
    const firstCard = list.querySelector<HTMLElement>(".settlement-cards .card");
    const firstMeta = list.querySelector<HTMLElement>(".settlement-meta");
    const panelRect = panel.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    const cardRect = firstCard?.getBoundingClientRect();
    return {
      columnCount: getComputedStyle(list).gridTemplateColumns.split(/\s+/).filter(Boolean).length,
      panelTop: Math.round(panelRect.top),
      headerBottom: Math.round(headerRect.bottom),
      cardWidth: Math.round(cardRect?.width ?? 0),
      cardFontSize: Number.parseFloat(firstCard ? getComputedStyle(firstCard).fontSize : "0"),
      metaFontSize: Number.parseFloat(firstMeta ? getComputedStyle(firstMeta).fontSize : "0"),
    };
  });
  expect(settlementMetrics.columnCount).toBe(1);
  expect(settlementMetrics.panelTop).toBeGreaterThanOrEqual(settlementMetrics.headerBottom);
  expect(settlementMetrics.cardWidth).toBeGreaterThanOrEqual(32);
  expect(settlementMetrics.cardFontSize).toBeGreaterThanOrEqual(16);
  expect(settlementMetrics.metaFontSize).toBeGreaterThanOrEqual(12);
  await page.screenshot({ path: testInfo.outputPath("iphone-se-settlement.png") });
  await settlementList.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("iphone-se-settlement-details.png") });
});

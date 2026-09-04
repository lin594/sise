import { expect, test, type Page } from "@playwright/test";

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

test("each practice round presents one bounded deal sequence", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/?e2eDebug=1");
  await page.getByTestId("nickname-input").fill("只看一次发牌");
  await page.getByTestId("login-submit").click();
  await expect(page.getByText("游戏模式选择")).toBeVisible();

  await page.evaluate(() => {
    const trackingWindow = window as Window & {
      __siseDealFlightCount?: number;
      __siseDealFlightObserver?: MutationObserver;
    };
    trackingWindow.__siseDealFlightCount = 0;
    trackingWindow.__siseDealFlightObserver = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) {
            continue;
          }
          if (node.matches(".fx-card.deal")) {
            trackingWindow.__siseDealFlightCount! += 1;
          }
          trackingWindow.__siseDealFlightCount! += node.querySelectorAll(".fx-card.deal").length;
        }
      }
    });
    trackingWindow.__siseDealFlightObserver.observe(document.body, { childList: true, subtree: true });
  });

  await page.getByTestId("lobby-start").click();
  await expect(page.getByTestId("confirm-declaration")).toBeVisible({ timeout: 20_000 });
  await expect.poll(
    () => page.evaluate(() => (window as Window & { __siseDealFlightCount?: number }).__siseDealFlightCount ?? 0),
    { timeout: 8_000 },
  ).toBeGreaterThan(0);
  const firstRoundCount = await page.evaluate(
    () => (window as Window & { __siseDealFlightCount?: number }).__siseDealFlightCount ?? 0,
  );
  expect(firstRoundCount).toBeLessThanOrEqual(81);
  await page.waitForTimeout(350);
  expect(await page.evaluate(
    () => (window as Window & { __siseDealFlightCount?: number }).__siseDealFlightCount ?? 0,
  )).toBe(firstRoundCount);

  await finishRoundThroughDebugHu(page);
  await expect(page.getByTestId("settlement-panel")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("next-round-trigger").click();
  await expect(page.getByTestId("confirm-declaration")).toBeVisible({ timeout: 20_000 });
  await expect.poll(
    () => page.evaluate(() => (window as Window & { __siseDealFlightCount?: number }).__siseDealFlightCount ?? 0),
    { timeout: 8_000 },
  ).toBeGreaterThan(firstRoundCount);
  const secondRoundCount = await page.evaluate(
    () => (window as Window & { __siseDealFlightCount?: number }).__siseDealFlightCount ?? 0,
  );
  expect(secondRoundCount - firstRoundCount).toBeLessThanOrEqual(81);
  await page.waitForTimeout(350);
  expect(await page.evaluate(() => {
    const trackingWindow = window as Window & {
      __siseDealFlightCount?: number;
      __siseDealFlightObserver?: MutationObserver;
    };
    trackingWindow.__siseDealFlightObserver?.disconnect();
    return trackingWindow.__siseDealFlightCount ?? 0;
  })).toBe(secondRoundCount);
});

async function finishRoundThroughDebugHu(page: Page): Promise<void> {
  const declaration = page.getByTestId("confirm-declaration");
  await expect(declaration).toBeEnabled({ timeout: 20_000 });
  await declaration.click();
  await expect(page.locator("main.layout")).toHaveClass(/\bplaying\b/, { timeout: 20_000 });

  await page.evaluate(() => {
    const bridge = (window as Window & {
      __siseLocalTest?: { setupScenario: (scenario: string) => void };
    }).__siseLocalTest;
    if (!bridge) {
      throw new Error("Local test bridge is unavailable");
    }
    bridge.setupScenario("settlement_hu");
  });
  await expect.poll(() =>
    page.evaluate(() =>
      (window as Window & {
        __siseLocalTest?: {
          getLastResult: () => {
            scenario: string;
            ok: boolean;
            actions?: Array<{ action: string; enabled: boolean }>;
          } | null;
        };
      }).__siseLocalTest?.getLastResult() ?? null,
    ),
  ).toMatchObject({
    scenario: "settlement_hu",
    ok: true,
  });
}

test("practice settlement stays readable and reachable on legacy phones", async ({ page }, testInfo) => {
  test.setTimeout(120_000);

  await page.goto("/?e2eDebug=1");

  await page.getByTestId("random-nickname").click();
  await page.getByTestId("login-submit").click();

  await expect(page.getByText("游戏模式选择")).toBeVisible();
  await page.getByTestId("lobby-start").click();

  await expect(page.getByTestId("game-board")).toBeVisible();

  await assertOpeningDealDoesNotRevealFullHand(page);

  await finishRoundThroughDebugHu(page);

  await expect(page.getByText(/胡牌结算|流局结算/)).toBeVisible();
  const settlementPanel = page.getByTestId("settlement-panel");
  const nextRoundButton = page.getByRole("button", { name: /再练一局|正在结算…/ });
  if (await page.getByTestId("settlement-loading").isVisible().catch(() => false)) {
    await expect(settlementPanel).toHaveAttribute("aria-busy", "true");
    await expect(nextRoundButton).toBeDisabled();
  }
  const settlementList = page.locator(".settlement-list");
  const settlementScrollRegion = page.getByTestId("settlement-scroll-region");
  const settlementItems = page.locator(".settlement-item");
  const settlementSummaries = page.getByTestId("settlement-player-summary");
  await expect(settlementList).toBeVisible({ timeout: 10_000 });
  await expect(settlementItems).toHaveCount(4);
  await expect(settlementSummaries).toHaveCount(4);
  await expect(settlementPanel).toHaveAttribute("aria-busy", "false");
  await expect(page.getByTestId("round-overview")).toContainText("你本局");
  await expect(settlementItems.first().locator(".settlement-name")).toContainText("（你）");
  await expect(page.getByTestId("settlement-bot-identity")).toHaveCount(3);
  await expect(page.getByTestId("settlement-bot-identity")).toHaveText(["机器人", "机器人", "机器人"]);
  expect(await settlementItems.evaluateAll((items) => items.every((item) => !item.hasAttribute("open")))).toBe(true);
  await expect(page.getByText(/最后动作/)).toHaveCount(0);
  await expect(page.getByTestId("game-tools")).toBeVisible();
  await expect(page.getByRole("button", { name: "再练一局" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "返回玩法选择" })).toBeEnabled();

  await settlementSummaries.first().click();
  await expect(settlementItems.first()).toHaveAttribute("open", "");
  await expect(settlementItems.first().getByText("收起明细")).toBeVisible();
  const firstSettlementCard = settlementItems.first().locator(".settlement-cards .card").first();
  await firstSettlementCard.scrollIntoViewIfNeeded();
  await expect(firstSettlementCard).toBeVisible();
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

  await settlementSummaries.first().click();
  await expect(settlementItems.first()).not.toHaveAttribute("open", "");
  await page.setViewportSize({ width: 568, height: 320 });
  await settlementScrollRegion.evaluate((region) => {
    region.scrollTop = 0;
  });
  await expect(page.locator("main.layout")).toHaveAttribute("data-effective-viewport", "568x320");
  const legacyLandscapeGeometry = await page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>("[data-testid='settlement-panel']")!;
    const header = document.querySelector<HTMLElement>("[data-testid='game-control-header']")!;
    const scrollRegion = document.querySelector<HTMLElement>("[data-testid='settlement-scroll-region']")!;
    const actions = document.querySelector<HTMLElement>(".end-actions")!;
    const summaries = [...document.querySelectorAll<HTMLElement>("[data-testid='settlement-player-summary']")];
    const buttons = [...actions.querySelectorAll<HTMLElement>("button")];
    const panelRect = panel.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    const scrollRect = scrollRegion.getBoundingClientRect();
    const actionsRect = actions.getBoundingClientRect();
    const isContained = (child: DOMRect, parent: DOMRect) =>
      child.left >= parent.left - 1 &&
      child.right <= parent.right + 1 &&
      child.top >= parent.top - 1 &&
      child.bottom <= parent.bottom + 1;
    const overlaps = (a: DOMRect, b: DOMRect) =>
      a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    return {
      panelBelowHeader: panelRect.top >= headerRect.bottom,
      outerDoesNotScroll: panel.scrollHeight <= panel.clientHeight + 1 && panel.scrollWidth <= panel.clientWidth + 1,
      detailsCanScroll: scrollRegion.scrollHeight > scrollRegion.clientHeight,
      actionsDoNotCoverDetails: !overlaps(scrollRect, actionsRect),
      firstThreeSummariesVisible: summaries.slice(0, 3).every((summary) =>
        isContained(summary.getBoundingClientRect(), scrollRect),
      ),
      summaryRects: summaries.slice(0, 3).map((summary) => {
        const rect = summary.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, height: rect.height };
      }),
      scrollRect: { top: scrollRect.top, bottom: scrollRect.bottom, height: scrollRect.height },
      buttonsContained: buttons.every((button) => isContained(button.getBoundingClientRect(), panelRect)),
      minimumButtonHeight: Math.min(...buttons.map((button) => button.getBoundingClientRect().height)),
    };
  });
  expect(legacyLandscapeGeometry, JSON.stringify(legacyLandscapeGeometry)).toMatchObject({
    panelBelowHeader: true,
    outerDoesNotScroll: true,
    detailsCanScroll: true,
    actionsDoNotCoverDetails: true,
    firstThreeSummariesVisible: true,
    buttonsContained: true,
  });
  expect(legacyLandscapeGeometry.minimumButtonHeight).toBeGreaterThanOrEqual(48);
  await page.screenshot({ path: testInfo.outputPath("legacy-landscape-settlement-overview.png") });

  await settlementSummaries.first().click();
  await expect(settlementItems.first()).toHaveAttribute("open", "");
  await firstSettlementCard.scrollIntoViewIfNeeded();
  const legacyCardMetrics = await firstSettlementCard.evaluate((card) => {
    const rect = card.getBoundingClientRect();
    const summary = card.closest("details")?.querySelector<HTMLElement>("summary");
    const scrollRegion = document.querySelector<HTMLElement>("[data-testid='settlement-scroll-region']");
    const summaryRect = summary?.getBoundingClientRect();
    const scrollRect = scrollRegion?.getBoundingClientRect();
    return {
      width: rect.width,
      fontSize: Number.parseFloat(getComputedStyle(card).fontSize),
      summaryPosition: summary ? getComputedStyle(summary).position : "",
      summaryVisible:
        Boolean(summaryRect && scrollRect) &&
        summaryRect!.top >= scrollRect!.top - 1 &&
        summaryRect!.bottom <= scrollRect!.bottom + 1,
      summaryText: summary?.textContent ?? "",
    };
  });
  expect(legacyCardMetrics.width).toBeGreaterThanOrEqual(32);
  expect(legacyCardMetrics.fontSize).toBeGreaterThanOrEqual(16);
  expect(legacyCardMetrics.summaryPosition).toBe("sticky");
  expect(legacyCardMetrics.summaryVisible).toBe(true);
  expect(legacyCardMetrics.summaryText).toContain("（你）");
  await page.screenshot({ path: testInfo.outputPath("legacy-landscape-settlement-expanded.png") });
  await settlementSummaries.first().click();
  await settlementSummaries.last().scrollIntoViewIfNeeded();
  const lastSummaryContained = await settlementSummaries.last().evaluate((summary) => {
    const region = document.querySelector<HTMLElement>("[data-testid='settlement-scroll-region']")!;
    const summaryRect = summary.getBoundingClientRect();
    const regionRect = region.getBoundingClientRect();
    return summaryRect.top >= regionRect.top - 1 && summaryRect.bottom <= regionRect.bottom + 1;
  });
  expect(lastSummaryContained).toBe(true);

  await settlementScrollRegion.evaluate((region) => {
    region.scrollTop = 0;
  });
  await page.setViewportSize({ width: 320, height: 568 });
  await expect(page.locator("main.layout")).toHaveAttribute("data-rotated-phone-portrait", "true");
  const legacyPortraitGeometry = await page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>("[data-testid='settlement-panel']")!;
    const scrollRegion = document.querySelector<HTMLElement>("[data-testid='settlement-scroll-region']")!;
    const actions = document.querySelector<HTMLElement>(".end-actions")!;
    const panelRect = panel.getBoundingClientRect();
    const scrollRect = scrollRegion.getBoundingClientRect();
    const actionsRect = actions.getBoundingClientRect();
    const overlaps = (a: DOMRect, b: DOMRect) =>
      a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    return {
      panelInPhysicalViewport:
        panelRect.left >= 0 &&
        panelRect.right <= window.innerWidth &&
        panelRect.top >= 0 &&
        panelRect.bottom <= window.innerHeight,
      outerDoesNotScroll: panel.scrollHeight <= panel.clientHeight + 1 && panel.scrollWidth <= panel.clientWidth + 1,
      actionsDoNotCoverDetails: !overlaps(scrollRect, actionsRect),
    };
  });
  expect(legacyPortraitGeometry).toEqual({
    panelInPhysicalViewport: true,
    outerDoesNotScroll: true,
    actionsDoNotCoverDetails: true,
  });
  await page.screenshot({ path: testInfo.outputPath("legacy-portrait-settlement.png") });
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.locator("main.layout")).toHaveAttribute("data-rotated-phone-portrait", "false");
  await expect.poll(() => settlementItems.evaluateAll((items) => items.every((item) => item.hasAttribute("open")))).toBe(true);
  const desktopGeometry = await page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>("[data-testid='settlement-panel']")!;
    const scrollRegion = document.querySelector<HTMLElement>("[data-testid='settlement-scroll-region']")!;
    const actions = document.querySelector<HTMLElement>(".end-actions")!;
    const panelRect = panel.getBoundingClientRect();
    const scrollRect = scrollRegion.getBoundingClientRect();
    const actionsRect = actions.getBoundingClientRect();
    return {
      panelInViewport:
        panelRect.left >= 0 &&
        panelRect.right <= window.innerWidth &&
        panelRect.top >= 0 &&
        panelRect.bottom <= window.innerHeight,
      outerDoesNotScroll: panel.scrollHeight <= panel.clientHeight + 1 && panel.scrollWidth <= panel.clientWidth + 1,
      detailsAboveActions: scrollRect.bottom <= actionsRect.top + 1,
    };
  });
  expect(desktopGeometry).toEqual({
    panelInViewport: true,
    outerDoesNotScroll: true,
    detailsAboveActions: true,
  });
  await page.screenshot({ path: testInfo.outputPath("desktop-settlement.png") });

  await page.getByTestId("practice-return-to-modes").click();
  await expect(page.getByText("游戏模式选择")).toBeVisible();
  await expect(page.getByTestId("mode-practice_bots")).toBeVisible();
  await expect(page.getByTestId("mode-quick_match")).toBeVisible();
  await expect(page.getByTestId("mode-friends")).toBeVisible();
  await expect(page.getByTestId("return-lobby-trigger")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => ({
    roomId: localStorage.getItem("four_room_id"),
    tokens: Object.keys(localStorage).filter((key) => key.startsWith("four_player_token")),
  }))).toEqual({ roomId: null, tokens: [] });
});

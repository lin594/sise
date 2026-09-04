import { expect, test, type Page, type TestInfo } from "@playwright/test";

type ViewportCase = {
  width: number;
  height: number;
  effectiveWidth: number;
  effectiveHeight: number;
  rotated: boolean;
};

const landscapeViewports: ViewportCase[] = [
  [568, 320],
  [667, 375],
  [740, 360],
  [812, 375],
  [844, 390],
  [852, 393],
  [896, 414],
  [915, 412],
  [926, 428],
].map(([width, height]) => ({
  width,
  height,
  effectiveWidth: width,
  effectiveHeight: height,
  rotated: false,
}));

const portraitViewports: ViewportCase[] = [
  [320, 568],
  [375, 667],
  [390, 844],
  [393, 852],
  [412, 915],
  [428, 926],
].map(([width, height]) => ({
  width,
  height,
  effectiveWidth: height,
  effectiveHeight: width,
  rotated: true,
}));

const baselineViewports: ViewportCase[] = [
  { width: 1024, height: 768, effectiveWidth: 1024, effectiveHeight: 768, rotated: false },
  { width: 1280, height: 720, effectiveWidth: 1280, effectiveHeight: 720, rotated: false },
];

const allViewports = [...landscapeViewports, ...portraitViewports, ...baselineViewports];

async function useViewport(page: Page, viewport: ViewportCase): Promise<void> {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  const layout = page.locator("main.layout");
  await expect(layout).toHaveAttribute(
    "data-effective-viewport",
    `${viewport.effectiveWidth}x${viewport.effectiveHeight}`,
  );
  await expect(layout).toHaveAttribute("data-rotated-phone-portrait", String(viewport.rotated));
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

async function expectOpeningHandGate(page: Page): Promise<void> {
  const samples: number[] = [];
  const deadline = Date.now() + 4_000;
  while (Date.now() < deadline) {
    // Read both values in one browser task: the declaration can appear
    // between separate Playwright visibility/count calls.
    const sample = await page.evaluate(() => {
      const button = document.querySelector<HTMLElement>("[data-testid='confirm-declaration']");
      return {
        declaring: Boolean(button && button.getClientRects().length && getComputedStyle(button).visibility !== "hidden"),
        count: document.querySelectorAll("[data-testid^='hand-card-']").length,
      };
    });
    if (sample.declaring) break;
    samples.push(sample.count);
    await page.waitForTimeout(40);
  }
  await expect(page.getByTestId("confirm-declaration")).toBeVisible({ timeout: 20_000 });
  const fullHandCount = await page.locator("[data-testid^='hand-card-']").count();
  expect(fullHandCount).toBeGreaterThan(0);
  expect(
    samples.every((count) => count < fullHandCount),
    `Opening hand reached its authoritative ${fullHandCount}-card total before declaration: ${samples.join(",")}`,
  ).toBe(true);
}

async function applySettlementScenario(page: Page): Promise<void> {
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
          getLastResult: () => { scenario: string; ok: boolean } | null;
        };
      }).__siseLocalTest?.getLastResult() ?? null,
    ),
  ).toMatchObject({ scenario: "settlement_hu", ok: true });
  await expect(page.getByTestId("settlement-panel")).toHaveAttribute("aria-busy", "false", { timeout: 20_000 });
}

async function expectPageContained(page: Page, requiredSelectors: string[]): Promise<void> {
  const geometry = await page.evaluate((selectors) => {
    const viewport = new DOMRect(0, 0, window.innerWidth, window.innerHeight);
    const contained = (rect: DOMRect, parent: DOMRect) =>
      rect.left >= parent.left - 1 &&
      rect.right <= parent.right + 1 &&
      rect.top >= parent.top - 1 &&
      rect.bottom <= parent.bottom + 1;
    return {
      documentContained:
        document.documentElement.scrollWidth <= window.innerWidth + 1 &&
        document.documentElement.scrollHeight <= window.innerHeight + 1,
      elements: selectors.map((selector) => {
        const element = document.querySelector<HTMLElement>(selector);
        return {
          selector,
          exists: Boolean(element),
          contained: Boolean(element && contained(element.getBoundingClientRect(), viewport)),
        };
      }),
    };
  }, requiredSelectors);
  expect(geometry.documentContained, JSON.stringify(geometry)).toBe(true);
  expect(geometry.elements, JSON.stringify(geometry)).toEqual(
    requiredSelectors.map((selector) => ({ selector, exists: true, contained: true })),
  );
}

async function saveReleaseScreenshot(page: Page, testInfo: TestInfo, viewport: ViewportCase): Promise<void> {
  const selected = new Set(["568x320", "844x390", "915x412", "390x844", "1280x720"]);
  const name = `${viewport.width}x${viewport.height}`;
  if (selected.has(name)) {
    await page.screenshot({ path: testInfo.outputPath(`settlement-${name}.png`) });
  }
}

test.describe("mobile responsive release gate", () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

  test("keeps critical play and deterministic settlement geometry inside every representative viewport", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await page.goto("/?e2eDebug=1");
    await expectPageContained(page, ["main.layout", ".entry-shell"]);
    await page.getByTestId("random-nickname").click();
    await page.getByTestId("login-submit").click();
    await expect(page.getByText("游戏模式选择")).toBeVisible();
    await expectPageContained(page, ["main.layout", ".lobby"]);

    await page.getByTestId("lobby-start").click();
    await expectOpeningHandGate(page);

    for (const viewport of allViewports) {
      await useViewport(page, viewport);
      await expectPageContained(page, ["main.layout", "[data-testid='game-control-header']", "[data-testid='game-board']", ".declare-panel"]);
      const declarationGeometry = await page.locator(".declare-panel").evaluate((panel) => {
        const confirm = panel.querySelector<HTMLElement>("[data-testid='confirm-declaration']")!;
        const panelRect = panel.getBoundingClientRect();
        const confirmRect = confirm.getBoundingClientRect();
        return {
          noHorizontalOverflow: panel.scrollWidth <= panel.clientWidth + 1,
          confirmContained:
            confirmRect.left >= panelRect.left - 1 &&
            confirmRect.right <= panelRect.right + 1 &&
            confirmRect.top >= panelRect.top - 1 &&
            confirmRect.bottom <= panelRect.bottom + 1,
          panelRect: { left: panelRect.left, right: panelRect.right, top: panelRect.top, bottom: panelRect.bottom },
          confirmRect: { left: confirmRect.left, right: confirmRect.right, top: confirmRect.top, bottom: confirmRect.bottom },
          confirmHeight: confirm.offsetHeight,
        };
      });
      const declarationMessage = `${viewport.width}x${viewport.height}: ${JSON.stringify(declarationGeometry)}`;
      expect(declarationGeometry.noHorizontalOverflow, declarationMessage).toBe(true);
      expect(declarationGeometry.confirmContained, declarationMessage).toBe(true);
      expect(declarationGeometry.confirmHeight, declarationMessage).toBeGreaterThanOrEqual(48);
    }

    await useViewport(page, landscapeViewports.find((viewport) => viewport.width === 844)!);
    await page.getByTestId("confirm-declaration").click();
    await expect(page.locator("main.layout")).toHaveClass(/\bplaying\b/, { timeout: 20_000 });

    for (const viewport of allViewports) {
      await useViewport(page, viewport);
      await expectPageContained(page, [
        "main.layout",
        "[data-testid='game-control-header']",
        "[data-testid='game-board']",
        ".table",
        ".self-hand-card",
        ".action-dock",
      ]);
    }

    await applySettlementScenario(page);
    const settlementItems = page.locator(".settlement-item");
    const settlementSummaries = page.getByTestId("settlement-player-summary");
    await expect(settlementItems).toHaveCount(4);
    await expect(settlementSummaries).toHaveCount(4);

    for (const viewport of allViewports) {
      await useViewport(page, viewport);
      await expectPageContained(page, [
        "main.layout",
        "[data-testid='game-control-header']",
        "[data-testid='settlement-panel']",
      ]);
      const geometry = await page.evaluate(() => {
        const panel = document.querySelector<HTMLElement>("[data-testid='settlement-panel']")!;
        const fixedHead = panel.querySelector<HTMLElement>(".settlement-fixed-head")!;
        const scrollRegion = panel.querySelector<HTMLElement>("[data-testid='settlement-scroll-region']")!;
        const actions = panel.querySelector<HTMLElement>(".end-actions")!;
        const summaries = [...panel.querySelectorAll<HTMLElement>("[data-testid='settlement-player-summary']")];
        const buttons = [...actions.querySelectorAll<HTMLElement>("button")];
        const scrollRect = scrollRegion.getBoundingClientRect();
        const actionsRect = actions.getBoundingClientRect();
        const contained = (child: DOMRect, parent: DOMRect) =>
          child.left >= parent.left - 1 &&
          child.right <= parent.right + 1 &&
          child.top >= parent.top - 1 &&
          child.bottom <= parent.bottom + 1;
        const overlaps = (a: DOMRect, b: DOMRect) =>
          a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        return {
          panelHeight: panel.offsetHeight,
          fixedHeadHeight: fixedHead.offsetHeight,
          scrollHeight: scrollRegion.clientHeight,
          panelNoOverflow: panel.scrollHeight <= panel.clientHeight + 1 && panel.scrollWidth <= panel.clientWidth + 1,
          scrollNoHorizontalOverflow: scrollRegion.scrollWidth <= scrollRegion.clientWidth + 1,
          actionsDoNotOverlap: !overlaps(scrollRect, actionsRect),
          buttonsContained: buttons.every((button) => contained(button.getBoundingClientRect(), panel.getBoundingClientRect())),
          minimumButtonHeight: Math.min(...buttons.map((button) => button.offsetHeight)),
          firstThreeSummariesVisible: summaries.slice(0, 3).every((summary) =>
            contained(summary.getBoundingClientRect(), scrollRect),
          ),
        };
      });
      expect(geometry.panelNoOverflow, `${viewport.width}x${viewport.height}: ${JSON.stringify(geometry)}`).toBe(true);
      expect(geometry.scrollNoHorizontalOverflow, `${viewport.width}x${viewport.height}: ${JSON.stringify(geometry)}`).toBe(true);
      expect(geometry.actionsDoNotOverlap, `${viewport.width}x${viewport.height}: ${JSON.stringify(geometry)}`).toBe(true);
      expect(geometry.buttonsContained, `${viewport.width}x${viewport.height}: ${JSON.stringify(geometry)}`).toBe(true);
      if (viewport.effectiveHeight <= 500) {
        expect(geometry.fixedHeadHeight, `${viewport.width}x${viewport.height}: ${JSON.stringify(geometry)}`).toBeLessThanOrEqual(64);
        expect(geometry.scrollHeight / geometry.panelHeight, `${viewport.width}x${viewport.height}: ${JSON.stringify(geometry)}`).toBeGreaterThanOrEqual(0.4);
        expect(geometry.firstThreeSummariesVisible, `${viewport.width}x${viewport.height}: ${JSON.stringify(geometry)}`).toBe(true);
        expect(geometry.minimumButtonHeight, `${viewport.width}x${viewport.height}: ${JSON.stringify(geometry)}`).toBeGreaterThanOrEqual(48);
      }
      await saveReleaseScreenshot(page, testInfo, viewport);
    }

    for (const width of [568, 844, 915]) {
      const viewport = landscapeViewports.find((item) => item.width === width)!;
      await useViewport(page, viewport);
      await expect(settlementItems.first()).not.toHaveAttribute("open", "");
      await settlementSummaries.first().click();
      await expect(settlementItems.first()).toHaveAttribute("open", "");
      const firstCard = settlementItems.first().locator(".settlement-cards .card").first();
      await firstCard.scrollIntoViewIfNeeded();
      const expandedGeometry = await firstCard.evaluate((card) => {
        const summary = card.closest("details")?.querySelector<HTMLElement>("summary")!;
        const scrollRegion = document.querySelector<HTMLElement>("[data-testid='settlement-scroll-region']")!;
        const summaryRect = summary.getBoundingClientRect();
        const scrollRect = scrollRegion.getBoundingClientRect();
        return {
          cardWidth: card.getBoundingClientRect().width,
          cardFontSize: Number.parseFloat(getComputedStyle(card).fontSize),
          summaryPosition: getComputedStyle(summary).position,
          summaryVisible: summaryRect.top >= scrollRect.top - 1 && summaryRect.bottom <= scrollRect.bottom + 1,
        };
      });
      expect(expandedGeometry.cardWidth, `${width}: ${JSON.stringify(expandedGeometry)}`).toBeGreaterThanOrEqual(32);
      expect(expandedGeometry.cardFontSize, `${width}: ${JSON.stringify(expandedGeometry)}`).toBeGreaterThanOrEqual(16);
      expect(expandedGeometry.summaryPosition, `${width}: ${JSON.stringify(expandedGeometry)}`).toBe("sticky");
      expect(expandedGeometry.summaryVisible, `${width}: ${JSON.stringify(expandedGeometry)}`).toBe(true);
      await settlementSummaries.first().click();
    }

    await useViewport(page, landscapeViewports.find((viewport) => viewport.width === 844)!);
    await page.getByTestId("game-settings").click();
    const reduceMotion = page.getByTestId("reduce-motion");
    await reduceMotion.scrollIntoViewIfNeeded();
    await reduceMotion.click();
    await expect(page.locator("main.layout")).toHaveAttribute("data-reduce-motion", "true");
    await page.keyboard.press("Escape");
    await page.getByTestId("next-round-trigger").click();
    await expectOpeningHandGate(page);
  });
});

import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 667, height: 375 } });

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

  await expect(page.getByTestId("settlement-panel")).toBeVisible();
  await expect(page.getByTestId("settlement-panel")).toHaveAttribute("aria-busy", "false");
}

function scoreFromText(text: string | null): number {
  const matched = String(text ?? "").match(/[+-]?\d+/);
  if (!matched) {
    throw new Error(`No score found in: ${text}`);
  }
  return Number(matched[0]);
}

test("friend-room cumulative scoring survives a lobby return and adds the next round", async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto("/?e2eDebug=1");
  await page.getByTestId("nickname-input").fill("累计牌友");
  await page.getByTestId("login-submit").click();
  await page.getByTestId("mode-friends").click();
  await page.getByTestId("lobby-start").click();

  await expect(page.getByTestId("scoring-mode-card")).toBeVisible();
  await page.getByTestId("scoring-mode-cumulative").click();
  await expect(page.getByTestId("scoring-mode-cumulative")).toHaveAttribute("aria-checked", "true");
  await page.getByTestId("fill-bots").click();
  await expect(page.getByTestId("lobby-start")).toBeEnabled();
  await page.getByTestId("lobby-start").click();

  await finishRoundThroughDebugHu(page);
  await expect(page.getByTestId("round-overview")).toContainText("本桌第 1 局");
  await expect(page.getByTestId("round-overview")).toContainText("你本桌累计");
  const cumulativeHeaderGeometry = await page.getByTestId("round-overview").evaluate((overview) => {
    const fixedHead = overview.closest<HTMLElement>(".settlement-fixed-head")!;
    const visibleItems = [...overview.children].filter((item) =>
      getComputedStyle(item).position !== "absolute",
    ) as HTMLElement[];
    return {
      fixedHeadHeight: fixedHead.offsetHeight,
      rowCount: new Set(visibleItems.map((item) => {
        const rect = item.getBoundingClientRect();
        return Math.round((rect.top + rect.height / 2) / 2) * 2;
      })).size,
    };
  });
  expect(cumulativeHeaderGeometry.fixedHeadHeight).toBeLessThanOrEqual(64);
  expect(cumulativeHeaderGeometry.rowCount).toBeLessThanOrEqual(2);
  const firstMe = page.locator(".settlement-item").filter({ hasText: "累计牌友（你）" });
  const firstRoundScore = scoreFromText(await firstMe.locator(".score-total").textContent());
  const firstCumulative = scoreFromText(await firstMe.locator(".cumulative-total").textContent());
  expect(firstCumulative).toBe(firstRoundScore);

  await page.getByTestId("return-lobby-trigger").click();
  await page.getByTestId("confirm-table-return").click();
  await expect(page.getByTestId("seat-grid")).toBeVisible();
  await expect(page.getByTestId("cumulative-scoreboard")).toBeVisible();
  await expect(page.getByTestId("scoring-mode-single")).toHaveCount(0);
  await expect(page.getByTestId("scoring-mode-cumulative")).toHaveCount(0);
  await expect(page.getByTestId("scoring-mode-summary")).toContainText("本桌累计");
  await expect(page.getByTestId("scoring-mode-summary")).toContainText("本桌已锁定");
  const myLobbyScore = page.getByTestId("cumulative-scoreboard").locator("li").filter({ hasText: "累计牌友" });
  await expect(myLobbyScore).toContainText(`${firstCumulative > 0 ? "+" : ""}${firstCumulative}分`);

  await page.getByTestId("lobby-start").click();
  await finishRoundThroughDebugHu(page);
  await expect(page.getByTestId("round-overview")).toContainText("本桌第 2 局");
  const secondMe = page.locator(".settlement-item").filter({ hasText: "累计牌友（你）" });
  const secondRoundScore = scoreFromText(await secondMe.locator(".score-total").textContent());
  const secondCumulative = scoreFromText(await secondMe.locator(".cumulative-total").textContent());
  expect(secondCumulative).toBe(firstCumulative + secondRoundScore);
});

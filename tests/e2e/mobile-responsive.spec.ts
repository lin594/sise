import { expect, test, type Page } from "@playwright/test";

async function enterLobby(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByTestId("random-nickname").click();
  await page.getByTestId("login-submit").click();
  await expect(page.getByText("游戏模式选择")).toBeVisible();
}

test.describe("phone portrait landscape canvas", () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true });

  test("renders a fully interactive rotated canvas without an orientation guard", async ({ page }) => {
    await page.goto("/");

    const layout = page.locator(".layout");
    await expect(layout).toHaveAttribute("data-effective-viewport", "667x375");
    await expect(layout).toHaveAttribute("data-rotated-phone-portrait", "true");
    await expect(page.getByText("请横屏")).toHaveCount(0);

    const geometry = await layout.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        offsetWidth: (element as HTMLElement).offsetWidth,
        offsetHeight: (element as HTMLElement).offsetHeight,
        rectWidth: Math.round(rect.width),
        rectHeight: Math.round(rect.height),
        transform: getComputedStyle(element).transform,
      };
    });
    expect(geometry).toMatchObject({
      offsetWidth: 667,
      offsetHeight: 375,
      rectWidth: 375,
      rectHeight: 667,
    });
    expect(geometry.transform).not.toBe("none");

    await page.getByTestId("open-rules").click();
    await expect(page.locator(".rules-panel")).toBeVisible();
    await page.getByRole("button", { name: "关闭" }).click();

    await page.getByTestId("random-nickname").click();
    await page.getByTestId("login-submit").click();
    await expect(page.getByText("游戏模式选择")).toBeVisible();

    const overflow = await page.evaluate(() => ({
      bodyWidth: document.body.scrollWidth,
      bodyHeight: document.body.scrollHeight,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
    }));
    expect(overflow.bodyWidth).toBeLessThanOrEqual(overflow.viewportWidth);
    expect(overflow.bodyHeight).toBeLessThanOrEqual(overflow.viewportHeight);
  });
});

test.describe("compact landscape gameplay", () => {
  test.use({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true });

  test("keeps lobby actions reachable and gameplay controls touch sized", async ({ page }) => {
    test.setTimeout(90_000);
    await enterLobby(page);

    const lobbyMetrics = await page.locator(".lobby").evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      overflowY: getComputedStyle(element).overflowY,
    }));
    expect(lobbyMetrics.overflowY).toBe("auto");
    expect(lobbyMetrics.scrollHeight).toBeGreaterThanOrEqual(lobbyMetrics.clientHeight);
    await expect(page.getByTestId("lobby-start")).toBeVisible();
    await page.getByTestId("lobby-start").click();

    await expect(page.getByTestId("game-board")).toBeVisible();
    const confirmDeclaration = page.getByRole("button", { name: "确认声明" });
    await expect(confirmDeclaration).toBeVisible({ timeout: 15_000 });
    await confirmDeclaration.click();
    await expect(page.locator(".layout.compact-landscape")).toBeVisible({ timeout: 15_000 });

    const handMetrics = await page.locator(".hand").evaluate((element) => {
      const cards = Array.from(element.querySelectorAll<HTMLElement>(".hand-card"));
      const rects = cards.map((card) => card.getBoundingClientRect());
      return {
        cardCount: cards.length,
        cardHeights: rects.map((rect) => Math.round(rect.height)),
        cardWidths: rects.map((rect) => Math.round(rect.width)),
        cardRows: new Set(rects.map((rect) => Math.round(rect.y))).size,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        overflowX: getComputedStyle(element).overflowX,
        overflowY: getComputedStyle(element).overflowY,
      };
    });
    expect(handMetrics.cardCount).toBeGreaterThan(0);
    expect(handMetrics.cardRows).toBe(1);
    expect(Math.min(...handMetrics.cardWidths)).toBeGreaterThanOrEqual(48);
    expect(Math.min(...handMetrics.cardHeights)).toBeGreaterThanOrEqual(48);
    expect(handMetrics.scrollWidth).toBeGreaterThan(handMetrics.clientWidth);
    expect(handMetrics.scrollHeight).toBeLessThanOrEqual(handMetrics.clientHeight);
    expect(handMetrics.overflowX).toBe("auto");
    expect(handMetrics.overflowY).toBe("hidden");

    const actionMetrics = await page.locator(".action-dock .actions").evaluate((element) => {
      const first = element.querySelector<HTMLButtonElement>(".btn");
      if (!first) {
        throw new Error("Action dock rendered without action buttons");
      }
      const clones: HTMLButtonElement[] = [];
      while (element.querySelectorAll(".btn").length < 5) {
        const clone = first.cloneNode(true) as HTMLButtonElement;
        clone.textContent = `测试${clones.length + 1}`;
        element.appendChild(clone);
        clones.push(clone);
      }
      const buttons = Array.from(element.querySelectorAll<HTMLElement>(".btn")).slice(0, 5);
      const sizes = buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return { width: Math.round(rect.width), height: Math.round(rect.height) };
      });
      const rows = new Set(buttons.map((button) => Math.round(button.getBoundingClientRect().y))).size;
      clones.forEach((clone) => clone.remove());
      return { sizes, rows };
    });
    expect(actionMetrics.rows).toBe(2);
    expect(Math.min(...actionMetrics.sizes.map((size) => size.width))).toBeGreaterThanOrEqual(48);
    expect(Math.min(...actionMetrics.sizes.map((size) => size.height))).toBeGreaterThanOrEqual(48);

    const pageOverflow = await page.evaluate(() => ({
      width: document.body.scrollWidth,
      height: document.body.scrollHeight,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
    }));
    expect(pageOverflow.width).toBeLessThanOrEqual(pageOverflow.viewportWidth);
    expect(pageOverflow.height).toBeLessThanOrEqual(pageOverflow.viewportHeight);
  });
});

test.describe("responsive viewport tiers", () => {
  test.use({ hasTouch: true, isMobile: true });

  for (const viewport of [
    { width: 740, height: 360, compact: true },
    { width: 844, height: 390, compact: true },
    { width: 1024, height: 768, compact: false },
    { width: 1280, height: 720, compact: false },
  ]) {
    test(`${viewport.width}x${viewport.height} selects the expected layout tier`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/");
      const layout = page.locator(".layout");
      await expect(layout).toHaveAttribute("data-effective-viewport", `${viewport.width}x${viewport.height}`);
      await expect(layout).toHaveAttribute("data-rotated-phone-portrait", "false");
      if (viewport.compact) {
        await expect(layout).toHaveClass(/compact-viewport/);
      } else {
        await expect(layout).not.toHaveClass(/compact-viewport/);
      }
    });
  }
});

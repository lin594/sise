import { expect, test, type Page } from "@playwright/test";

async function enterLobby(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByTestId("random-nickname").click();
  await page.getByTestId("login-submit").click();
  await expect(page.getByText("游戏模式选择")).toBeVisible();
}

async function expectSimplifiedTableCenter(page: Page): Promise<void> {
  await expect(page.getByTestId("deck-count")).toBeVisible();
  await expect(page.getByTestId("dealer-badge")).toHaveCount(1);
  await expect(page.getByTestId("dealer-card")).toHaveCount(1);
  await expect(page.getByText(/抽牌者/)).toHaveCount(0);
  await expect(page.getByText(/^庄家:/)).toHaveCount(0);
  await expect(page.locator(".center-core-cell")).toHaveCount(0);
  await expect(page.locator(".pending-placeholder")).toHaveCount(0);
}

async function expectDedicatedGameHeader(page: Page): Promise<void> {
  const header = page.getByTestId("game-control-header");
  await expect(header).toBeVisible();
  await expect(header.getByRole("heading", { name: "四色牌" })).toBeVisible();
  await expect(header.getByRole("button", { name: "牌局设置" })).toContainText("设置");
  await expect(header.getByRole("button", { name: "退出牌局" })).toContainText("退出");
  await expect(header.getByText(/座位ID|房主|已连接|同步中/)).toHaveCount(0);

  const geometry = await page.evaluate(() => {
    const headerElement = document.querySelector<HTMLElement>('[data-testid="game-control-header"]');
    const boardElement = document.querySelector<HTMLElement>('[data-testid="game-board"]');
    if (!headerElement || !boardElement) {
      throw new Error("Game header or board is missing");
    }
    const headerRect = headerElement.getBoundingClientRect();
    const boardRect = boardElement.getBoundingClientRect();
    return {
      headerBottom: Math.round(headerRect.bottom),
      boardTop: Math.round(boardRect.top),
    };
  });
  expect(geometry.boardTop).toBeGreaterThanOrEqual(geometry.headerBottom);
}

async function reachDiscardConfirmation(page: Page): Promise<void> {
  const deadline = Date.now() + 45_000;
  const confirm = page.getByTestId("discard-confirm");
  while (Date.now() < deadline) {
    if (await confirm.isVisible().catch(() => false)) {
      return;
    }
    const candidates = page.locator(".candidate-item");
    let candidateActed = false;
    for (let index = 0; index < await candidates.count(); index += 1) {
      const candidate = candidates.nth(index);
      if ((await candidate.isVisible().catch(() => false)) && (await candidate.isEnabled().catch(() => false))) {
        await candidate.click({ force: true });
        candidateActed = true;
        break;
      }
    }
    if (candidateActed) {
      await page.waitForTimeout(300);
      continue;
    }
    if (await confirm.isVisible().catch(() => false)) {
      return;
    }
    let acted = false;
    for (const id of ["action-peng", "action-kai", "action-chi", "action-pass", "action-hu"]) {
      const action = page.getByTestId(id);
      if ((await action.isVisible().catch(() => false)) && (await action.isEnabled().catch(() => false))) {
        await action.click({ force: true });
        acted = true;
        break;
      }
    }
    await page.waitForTimeout(acted ? 300 : 180);
  }
  throw new Error("Timed out before the player received a discard confirmation turn");
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
    await page.getByRole("button", { name: "关闭", exact: true }).click();

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
    await expectDedicatedGameHeader(page);
    const confirmDeclaration = page.getByTestId("confirm-declaration");
    await expect(confirmDeclaration).toBeVisible({ timeout: 15_000 });

    await expect(page.getByRole("heading", { name: "声明亮鱼与暗坎" })).toBeVisible();
    const handPreview = page.getByTestId("declare-hand-preview");
    await expect(handPreview).toBeVisible();
    await expect(handPreview.locator("button")).toHaveCount(0);
    await expect(page.getByTestId("kong-count-0")).toBeVisible();
    await expect(confirmDeclaration).toContainText(/确认/);

    const declarationMetrics = await page.locator(".declare-panel").evaluate((panel) => {
      const confirm = panel.querySelector<HTMLElement>(".confirm-declaration");
      const quantityButtons = Array.from(panel.querySelectorAll<HTMLElement>(".kong-choice"));
      if (!confirm || quantityButtons.length === 0) {
        throw new Error("Declaration panel is missing primary controls");
      }
      const panelRect = panel.getBoundingClientRect();
      const confirmRect = confirm.getBoundingClientRect();
      return {
        panel: { width: Math.round(panelRect.width), height: Math.round(panelRect.height) },
        confirm: {
          width: Math.round(confirmRect.width),
          height: Math.round(confirmRect.height),
          top: Math.round(confirmRect.top),
          bottom: Math.round(confirmRect.bottom),
        },
        minimumQuantityWidth: Math.min(...quantityButtons.map((button) => button.getBoundingClientRect().width)),
        minimumQuantityHeight: Math.min(...quantityButtons.map((button) => button.getBoundingClientRect().height)),
      };
    });
    expect(declarationMetrics.panel.width).toBeGreaterThan(0);
    expect(declarationMetrics.panel.width).toBeLessThanOrEqual(667);
    expect(declarationMetrics.panel.height).toBeGreaterThan(0);
    expect(declarationMetrics.panel.height).toBeLessThanOrEqual(375);
    expect(declarationMetrics.confirm.width).toBeGreaterThanOrEqual(48);
    expect(declarationMetrics.confirm.height).toBeGreaterThanOrEqual(48);
    expect(declarationMetrics.confirm.top).toBeGreaterThanOrEqual(0);
    expect(declarationMetrics.confirm.bottom).toBeLessThanOrEqual(375);
    expect(declarationMetrics.minimumQuantityWidth).toBeGreaterThanOrEqual(48);
    expect(declarationMetrics.minimumQuantityHeight).toBeGreaterThanOrEqual(48);

    await confirmDeclaration.click();
    await expect(page.locator(".layout.compact-landscape")).toBeVisible({ timeout: 15_000 });
    await expectSimplifiedTableCenter(page);
    await expectDedicatedGameHeader(page);
    await reachDiscardConfirmation(page);

    const handMetrics = await page.locator(".hand").evaluate((element) => {
      const cards = Array.from(element.querySelectorAll<HTMLElement>(".hand-card"));
      const rects = cards.map((card) => card.getBoundingClientRect());
      return {
        cardCount: cards.length,
        cardHeights: rects.map((rect) => Math.round(rect.height)),
        cardWidths: rects.map((rect) => Math.round(rect.width)),
        cardGaps: rects.slice(1).map((rect, index) => Math.round(rect.left - rects[index]!.right)),
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
    expect(Math.min(...handMetrics.cardWidths)).toBeGreaterThanOrEqual(30);
    expect(Math.max(...handMetrics.cardWidths)).toBeLessThanOrEqual(36);
    expect(Math.min(...handMetrics.cardGaps)).toBeGreaterThanOrEqual(2);
    expect(Math.max(...handMetrics.cardGaps)).toBeLessThanOrEqual(4);
    expect(Math.min(...handMetrics.cardHeights)).toBeGreaterThanOrEqual(36);
    expect(handMetrics.scrollWidth).toBeGreaterThan(handMetrics.clientWidth);
    expect(handMetrics.scrollHeight).toBeLessThanOrEqual(handMetrics.clientHeight);
    expect(handMetrics.overflowX).toBe("auto");
    expect(handMetrics.overflowY).toBe("hidden");

    const selectedCard = page.locator("[data-testid^='hand-card-']:enabled").first();
    const selectedCardTestId = await selectedCard.getAttribute("data-testid");
    expect(selectedCardTestId).toBeTruthy();
    const handBeforeSelection = await page.locator("[data-testid^='hand-card-']").evaluateAll((cards) =>
      cards.map((card) => (card as HTMLElement).dataset.testid),
    );
    await selectedCard.click();
    await selectedCard.dblclick();
    await expect(selectedCard).toHaveAttribute("aria-pressed", "true");
    expect(await page.locator("[data-testid^='hand-card-']").evaluateAll((cards) =>
      cards.map((card) => (card as HTMLElement).dataset.testid),
    )).toEqual(handBeforeSelection);
    const discardConfirm = page.getByTestId("discard-confirm");
    await expect(discardConfirm).toBeEnabled();
    const discardButtonRect = await discardConfirm.evaluate((button) => {
      const rect = button.getBoundingClientRect();
      return { height: Math.round(rect.height), right: Math.round(rect.right), bottom: Math.round(rect.bottom) };
    });
    expect(discardButtonRect.height).toBeGreaterThanOrEqual(36);
    expect(discardButtonRect.height).toBeLessThan(48);
    expect(discardButtonRect.right).toBeLessThanOrEqual(667);
    expect(discardButtonRect.bottom).toBeLessThanOrEqual(375);
    await discardConfirm.click();
    await expect(page.getByTestId(selectedCardTestId!)).toHaveCount(0);

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

    await page.getByTestId("game-settings").click();
    await expect(page.getByTestId("settings-panel")).toBeVisible();
    await expect(page.getByTestId("card-mode-simple")).toHaveClass(/active/);
    await page.getByTestId("card-mode-full").click();
    await expect(page.getByTestId("card-mode-full")).toHaveClass(/active/);
    expect(await page.evaluate(() => localStorage.getItem("sise_table_card_mode"))).toBe("full");
    await page.getByTestId("card-mode-simple").click();
    await page.getByTestId("settings-rules").click();
    await expect(page.locator(".rules-panel")).toBeVisible();
    await page.getByRole("button", { name: "关闭", exact: true }).click();

    await page.getByTestId("game-exit").click();
    await expect(page.getByRole("dialog", { name: "退出当前牌局？" })).toBeVisible();
    await page.getByTestId("cancel-exit").click();
    await expect(page.getByTestId("game-board")).toBeVisible();
    const departingRoomId = await page.evaluate(() => localStorage.getItem("four_room_id"));
    await page.getByTestId("game-exit").click();
    await page.getByTestId("confirm-exit").click();
    await expect(page.getByText("游戏模式选择")).toBeVisible();
    await page.waitForTimeout(1_200);
    await expect(page.getByText("游戏模式选择")).toBeVisible();
    await expect(page.getByTestId("game-board")).toHaveCount(0);
    const leaveState = await page.evaluate((roomId) => ({
      roomId: localStorage.getItem("four_room_id"),
      token: roomId ? localStorage.getItem(`four_player_token:${roomId}`) : null,
      queryRoomId: new URL(location.href).searchParams.get("roomId"),
    }), departingRoomId);
    expect(leaveState).toEqual({ roomId: null, token: null, queryRoomId: null });
  });
});

test.describe("desktop declaration", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("uses the same grouped declaration workflow without compact styling", async ({ page }) => {
    test.setTimeout(60_000);
    await enterLobby(page);
    await page.getByTestId("lobby-start").click();

    const panel = page.locator(".declare-panel");
    await expect(panel).toBeVisible({ timeout: 15_000 });
    await expect(panel).not.toHaveClass(/compact/);
    await expect(page.getByTestId("declare-hand-preview")).toBeVisible();
    await expect(page.getByTestId("declare-hand-preview").locator("button")).toHaveCount(0);
    await expect(page.getByTestId("kong-count-0")).toBeVisible();
    await expect(page.getByTestId("confirm-declaration")).toBeVisible();
    await expectSimplifiedTableCenter(page);
    await expectDedicatedGameHeader(page);
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

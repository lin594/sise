import { expect, test, type Page } from "@playwright/test";

async function enterLobby(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByTestId("random-nickname").click();
  await page.getByTestId("login-submit").click();
  await expect(page.getByText("游戏模式选择")).toBeVisible();
}

async function expectSimplifiedTableCenter(page: Page): Promise<void> {
  await expect(page.getByTestId("deck-count")).toBeVisible();
  await expect(page.getByTestId("deck-stack")).toHaveAttribute("aria-label", /牌堆剩余 \d+ 张/);
  await expect(page.getByTestId("deck-stack")).toHaveAttribute("data-card-back", "red-four-color");
  await expect(page.getByTestId("deck-stack").locator(".deck-layer")).toHaveCount(8);
  await expect(page.getByTestId("opponent-hand-count")).toHaveCount(3);
  await expect(page.locator(".player-card .bot-seat-badge")).toHaveCount(3);
  const botNames = await page.locator(".player-card .seat-identity strong").allTextContents();
  expect(new Set(botNames.map((name) => name.trim())).size).toBe(3);
  expect(botNames.every((name) => !/^机器人\d+$/.test(name.trim()))).toBe(true);
  for (const countText of await page.getByTestId("opponent-hand-count").allTextContents()) {
    expect(countText.trim()).toMatch(/^\d+张$/);
  }
  await expect(page.getByTestId("dealer-badge")).toHaveCount(1);
  await expect(page.getByTestId("dealer-card")).toHaveCount(1);
  await expect(page.getByText(/抽牌者/)).toHaveCount(0);
  await expect(page.getByText(/^庄家:/)).toHaveCount(0);
  await expect(page.locator(".center-core-cell")).toHaveCount(0);
  await expect(page.locator(".pending-placeholder")).toHaveCount(0);

  const centerGeometry = await page.evaluate(() => {
    const stage = document.querySelector<HTMLElement>(".center-stage")?.getBoundingClientRect();
    const pair = document.querySelector<HTMLElement>('[data-testid="center-card-pair"]')?.getBoundingClientRect();
    const deck = document.querySelector<HTMLElement>('[data-testid="deck-stack"]')?.getBoundingClientRect();
    const pending = document.querySelector<HTMLElement>('[data-testid="pending-card"]')?.getBoundingClientRect();
    const deckLayer = document.querySelector<HTMLElement>(".deck-layer");
    if (!stage || !pair || !deck || !deckLayer) {
      throw new Error("Central card stack is missing");
    }
    const layerRect = deckLayer.getBoundingClientRect();
    return {
      stageCenterX: stage.x + stage.width / 2,
      stageCenterY: stage.y + stage.height / 2,
      pairCenterX: pair.x + pair.width / 2,
      pairCenterY: pair.y + pair.height / 2,
      deckCenterX: deck.x + deck.width / 2,
      deckCenterY: deck.y + deck.height / 2,
      pendingCenterX: pending ? pending.x + pending.width / 2 : null,
      pendingCenterY: pending ? pending.y + pending.height / 2 : null,
      deckRight: deck.right,
      pendingLeft: pending?.left ?? null,
      layerWidth: layerRect.width,
      layerHeight: layerRect.height,
      layerRadius: getComputedStyle(deckLayer).borderRadius,
      layerBackground: getComputedStyle(deckLayer).backgroundImage,
    };
  });
  expect(Math.abs(centerGeometry.pairCenterX - centerGeometry.stageCenterX)).toBeLessThanOrEqual(2);
  expect(Math.abs(centerGeometry.pairCenterY - centerGeometry.stageCenterY)).toBeLessThanOrEqual(2);
  expect(centerGeometry.deckCenterX).toBeLessThan(centerGeometry.stageCenterX);
  expect(Math.abs(centerGeometry.deckCenterY - centerGeometry.stageCenterY)).toBeLessThanOrEqual(2);
  expect(centerGeometry.layerHeight / centerGeometry.layerWidth).toBeGreaterThanOrEqual(3.5);
  expect(centerGeometry.layerRadius).toBe("999px");
  expect(centerGeometry.layerBackground).toContain("239, 68, 68");
  if (centerGeometry.pendingCenterX !== null && centerGeometry.pendingCenterY !== null) {
    expect(centerGeometry.pendingCenterX).toBeGreaterThan(centerGeometry.stageCenterX);
    expect(Math.abs(centerGeometry.pendingCenterY - centerGeometry.deckCenterY)).toBeLessThanOrEqual(2);
    expect(centerGeometry.deckRight).toBeLessThanOrEqual(centerGeometry.pendingLeft!);
  }
}

async function expectDedicatedGameHeader(page: Page): Promise<void> {
  const header = page.getByTestId("game-control-header");
  await expect(header).toBeVisible();
  await expect(header.getByRole("heading", { name: "四色牌" })).toBeVisible();
  const settingsButton = header.getByTestId("game-settings");
  await expect(settingsButton).toBeVisible();
  await expect(settingsButton).toContainText(/设置|先操作/);
  await expect(settingsButton).toHaveAttribute("aria-label", /牌局设置|请先完成当前操作，再打开设置/);
  await expect(header.getByTestId("game-history")).toBeVisible();
  await expect(header.getByTestId("game-history")).toContainText("记录");
  await expect(header.getByTestId("game-history")).toHaveAttribute("aria-label", /最近操作/);
  await expect(header.getByRole("button", { name: "退出牌局" })).toContainText("退出");
  await expect(header.getByText(/座位ID|房主|已连接|同步中/)).toHaveCount(0);

  const geometry = await page.evaluate(() => {
    const headerElement = document.querySelector<HTMLElement>('[data-testid="game-control-header"]');
    const boardElement = document.querySelector<HTMLElement>('[data-testid="game-board"]');
    const brandElement = headerElement?.querySelector<HTMLElement>(".brand-lockup");
    const toolsElement = headerElement?.querySelector<HTMLElement>("[data-testid='game-tools']");
    const toolButtons = Array.from(headerElement?.querySelectorAll<HTMLElement>(".tool-button") ?? []);
    if (!headerElement || !boardElement || !brandElement || !toolsElement || toolButtons.length !== 3) {
      throw new Error("Game header or board is missing");
    }
    const headerRect = headerElement.getBoundingClientRect();
    const boardRect = boardElement.getBoundingClientRect();
    const brandRect = brandElement.getBoundingClientRect();
    const toolsRect = toolsElement.getBoundingClientRect();
    const buttonRects = toolButtons.map((button) => button.getBoundingClientRect());
    return {
      headerBottom: Math.round(headerRect.bottom),
      boardTop: Math.round(boardRect.top),
      brandRight: brandRect.right,
      toolsLeft: toolsRect.left,
      controlsInsideHeader: buttonRects.every(
        (rect) =>
          rect.left >= headerRect.left &&
          rect.right <= headerRect.right &&
          rect.top >= headerRect.top &&
          rect.bottom <= headerRect.bottom,
      ),
      minimumControlWidth: Math.min(...buttonRects.map((rect) => rect.width)),
      minimumControlHeight: Math.min(...buttonRects.map((rect) => rect.height)),
    };
  });
  expect(geometry.boardTop).toBeGreaterThanOrEqual(geometry.headerBottom);
  expect(geometry.brandRight).toBeLessThanOrEqual(geometry.toolsLeft);
  expect(geometry.controlsInsideHeader).toBe(true);
  expect(geometry.minimumControlWidth).toBeGreaterThanOrEqual(40);
  expect(geometry.minimumControlHeight).toBeGreaterThanOrEqual(32);
}

async function reachDiscardConfirmation(page: Page): Promise<void> {
  const deadline = Date.now() + 60_000;
  const confirm = page.getByTestId("discard-confirm");

  const clickIfReady = async (testId: string): Promise<boolean> => {
    const action = page.getByTestId(testId);
    if (!(await action.isVisible().catch(() => false)) || !(await action.isEnabled().catch(() => false))) {
      return false;
    }
    return action
      .click({ force: true, timeout: 1_000 })
      .then(() => true)
      .catch(() => false);
  };

  while (Date.now() < deadline) {
    if (await confirm.isVisible().catch(() => false)) {
      return;
    }
    const candidates = page.locator(".candidate-item");
    let candidateActed = false;
    for (let index = 0; index < await candidates.count(); index += 1) {
      const candidate = candidates.nth(index);
      if ((await candidate.isVisible().catch(() => false)) && (await candidate.isEnabled().catch(() => false))) {
        candidateActed = await candidate
          .click({ force: true, timeout: 1_000 })
          .then(() => true)
          .catch(() => false);
        if (candidateActed) {
          break;
        }
      }
    }
    if (candidateActed) {
      await page.waitForTimeout(300);
      continue;
    }
    if (await confirm.isVisible().catch(() => false)) {
      return;
    }
    const responsePhase = await page.getByTestId("game-board").getAttribute("data-response-phase");
    let acted = false;
    const preferredActions =
      responsePhase === "collective"
        ? ["action-pass", "action-peng", "action-kai", "action-chi"]
        : ["action-peng", "action-kai", "action-chi", "action-pass"];
    for (const id of preferredActions) {
      if (await clickIfReady(id)) {
        acted = true;
        break;
      }
    }
    if (!acted) {
      const fallbackAction = page.locator(".action-dock button:enabled").first();
      if ((await fallbackAction.isVisible().catch(() => false)) && (await fallbackAction.isEnabled().catch(() => false))) {
        acted = await fallbackAction
          .click({ force: true, timeout: 1_000 })
          .then(() => true)
          .catch(() => false);
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

    const viewportMeta = await page.locator('meta[name="viewport"]').getAttribute("content");
    expect(viewportMeta).toContain("width=device-width");
    expect(viewportMeta).not.toContain("maximum-scale");
    expect(viewportMeta).not.toContain("user-scalable=no");

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

  test("rotates a legacy 320x568 portrait into the supported small canvas", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/");

    const layout = page.locator(".layout");
    await expect(layout).toHaveAttribute("data-effective-viewport", "568x320");
    await expect(layout).toHaveAttribute("data-rotated-phone-portrait", "true");
    const geometry = await layout.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        offsetWidth: (element as HTMLElement).offsetWidth,
        offsetHeight: (element as HTMLElement).offsetHeight,
        rectWidth: Math.round(rect.width),
        rectHeight: Math.round(rect.height),
      };
    });
    expect(geometry).toEqual({
      offsetWidth: 568,
      offsetHeight: 320,
      rectWidth: 320,
      rectHeight: 568,
    });
  });
});

test.describe("compact landscape gameplay", () => {
  test.use({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true });

  test("keeps lobby actions reachable and gameplay controls touch sized", async ({ page }, testInfo) => {
    test.setTimeout(120_000);
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
    await expect(confirmDeclaration).toBeEnabled({ timeout: 15_000 });

    await expect(page.getByRole("heading", { name: "声明亮鱼与暗坎" })).toBeVisible();
    const handPreview = page.getByTestId("declare-hand-preview");
    await expect(handPreview).toBeVisible();
    await expect(handPreview.locator("[data-card-mode='large']").first()).toBeVisible();
    await expect(handPreview.locator("button")).toHaveCount(0);
    await expect(page.getByTestId("kong-count-0")).toBeVisible();
    await expect(confirmDeclaration).toContainText(/确认/);
    await expect(page.locator(".declare-timer")).toContainText("不限时");
    await expect(page.locator(".declare-timer")).toContainText("练习模式");

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
    const botIdentityBadges = page.getByTestId("bot-identity");
    await expect(botIdentityBadges).toHaveCount(3);
    await expect(botIdentityBadges).toHaveText(["电脑", "电脑", "电脑"]);
    for (const badge of await botIdentityBadges.all()) {
      await expect(badge).toBeVisible();
      await expect(badge).toHaveAttribute("aria-label", "机器人");
    }
    const botNames = await botIdentityBadges.evaluateAll((badges) =>
      badges.map((badge) => badge.parentElement?.querySelector("strong")?.textContent?.trim() ?? ""),
    );
    expect(new Set(botNames).size).toBe(3);
    expect(botNames.every((name) => name.length >= 2 && !/^机器人\d+$/u.test(name))).toBe(true);
    await expect(page.getByText("暂无牌组")).toHaveCount(0);
    await expect(page.locator(".self-groups-card")).toHaveClass(/empty/);
    await expect(page.getByText(/牌组 0 组/)).toHaveCount(0);
    await expect(page.getByText(/暗坎 0(?:\D|$)/)).toHaveCount(0);
    await expect(page.locator(".self-head")).not.toContainText(/手牌 \d+ 张/);
    const seatAccessibleLabels = await page.locator(".player-card[role='group'], .self-info-card[role='group']")
      .evaluateAll((seats) => seats.map((seat) => seat.getAttribute("aria-label") ?? ""));
    expect(seatAccessibleLabels).toHaveLength(4);
    expect(seatAccessibleLabels.every((label) => /剩余手牌 \d+ 张/.test(label))).toBe(true);
    expect(seatAccessibleLabels.every((label) => /公开牌组 \d+ 组/.test(label))).toBe(true);
    await expectDedicatedGameHeader(page);
    const fixedDeckPosition = await page.getByTestId("deck-stack").boundingBox();
    expect(fixedDeckPosition).not.toBeNull();
    await reachDiscardConfirmation(page);
    await expect(page.locator(".deal-overlay")).toHaveCount(0, { timeout: 6_000 });
    const gameHistory = page.getByTestId("game-history");
    await expect.poll(async () => Number((await gameHistory.getAttribute("aria-label"))?.match(/共(\d+)条/)?.[1] ?? 0))
      .toBeGreaterThan(0);
    await gameHistory.click();
    const historyPanel = page.getByTestId("history-panel");
    await expect(historyPanel).toBeVisible();
    await expect(historyPanel).toHaveAttribute("aria-modal", "true");
    await expect(historyPanel).toBeFocused();
    await expect(historyPanel).toContainText("牌局计时仍会继续");
    await expect(page.getByTestId("history-entry").first()).toBeVisible();
    await expect(page.getByTestId("history-entry").first()).not.toContainText(/seat_|bot_|DISCARD|DEALER|PASS/);
    await expect(page.getByTestId("history-entry").first()).toContainText(
      /[红黄绿白](?:帥|將|仕|士|相|象|俥|車|傌|馬|炮|包|兵|卒|公|侯|伯|子|男)/,
    );
    const historyGeometry = await historyPanel.evaluate((panel) => {
      const panelRect = panel.getBoundingClientRect();
      const headerRect = document.querySelector<HTMLElement>('[data-testid="game-control-header"]')!.getBoundingClientRect();
      const closeRect = panel.querySelector<HTMLButtonElement>('[data-testid="close-history"]')!.getBoundingClientRect();
      const firstEntry = panel.querySelector<HTMLElement>('[data-testid="history-entry"]')!;
      return {
        top: panelRect.top,
        right: panelRect.right,
        bottom: panelRect.bottom,
        headerBottom: headerRect.bottom,
        closeWidth: closeRect.width,
        closeHeight: closeRect.height,
        entryFontSize: Number.parseFloat(getComputedStyle(firstEntry).fontSize),
      };
    });
    expect(historyGeometry.top).toBeGreaterThanOrEqual(historyGeometry.headerBottom);
    expect(historyGeometry.right).toBeLessThanOrEqual(667);
    expect(historyGeometry.bottom).toBeLessThanOrEqual(375);
    expect(historyGeometry.closeWidth).toBeGreaterThanOrEqual(40);
    expect(historyGeometry.closeHeight).toBeGreaterThanOrEqual(40);
    expect(historyGeometry.entryFontSize).toBeGreaterThanOrEqual(13);
    await page.waitForTimeout(180);
    await page.screenshot({ path: testInfo.outputPath("iphone-se-action-history.png") });
    await page.keyboard.press("Escape");
    await expect(historyPanel).toHaveCount(0);
    await expect(gameHistory).toBeFocused();
    await gameHistory.click();
    const firstPlayableCard = page.locator(".hand-card.playable").first();
    await expect(firstPlayableCard).toHaveAttribute("aria-pressed", "false");
    const playableCardCenter = await firstPlayableCard.evaluate((card) => {
      const rect = card.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
    await page.mouse.click(playableCardCenter.x, playableCardCenter.y);
    await expect(historyPanel).toHaveCount(0);
    await expect(firstPlayableCard).toHaveAttribute("aria-pressed", "false");
    await expect(gameHistory).toBeFocused();
    await expect.poll(async () => {
      const label = (await page.locator(".discard-tip").textContent()) ?? "";
      const match = label.match(/手牌（(\d+)(?:\/(\d+))?张）/);
      return Boolean(match && !match[2] && (await page.locator("[data-testid^='hand-card-']").count()) === Number(match[1]));
    }).toBe(true);
    await expect(page.getByTestId("action-guidance")).toContainText("该你操作了");
    await expect(page.getByTestId("action-guidance")).toContainText("练习不限时");
    await expect(page.getByTestId("action-guidance")).not.toContainText(/还剩 \d+ 秒/);
    await expect(page.getByTestId("action-guidance")).toHaveAttribute("data-urgent", "false");
    await expect(page.getByTestId("request-more-time")).toHaveCount(0);
    const guidanceMetrics = await page.getByTestId("action-guidance").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const dock = element.closest<HTMLElement>(".action-dock")!.getBoundingClientRect();
      return {
        fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
        top: rect.top,
        bottom: rect.bottom,
        dockTop: dock.top,
        dockBottom: dock.bottom,
      };
    });
    expect(guidanceMetrics.fontSize).toBeGreaterThanOrEqual(12);
    expect(guidanceMetrics.top).toBeGreaterThanOrEqual(guidanceMetrics.dockTop);
    expect(guidanceMetrics.bottom).toBeLessThanOrEqual(guidanceMetrics.dockBottom);
    await page.screenshot({ path: testInfo.outputPath("iphone-se-normal-game.png") });

    const handMetrics = await page.locator(".hand").evaluate((element) => {
      const cards = Array.from(element.querySelectorAll<HTMLElement>(".hand-card"));
      const rects = cards.map((card) => card.getBoundingClientRect());
      const handRect = element.getBoundingClientRect();
      return {
        cardCount: cards.length,
        cardHeights: rects.map((rect) => Math.round(rect.height)),
        cardWidths: rects.map((rect) => Math.round(rect.width)),
        cardFontSizes: cards.map((card) => {
          const face = card.querySelector<HTMLElement>(".text-top");
          return face ? Number.parseFloat(getComputedStyle(face).fontSize) : 0;
        }),
        cardGaps: rects.slice(1).map((rect, index) => Math.round(rect.left - rects[index]!.right)),
        cardRows: new Set(rects.map((rect) => Math.round(rect.y))).size,
        fullyVisibleCards: rects.filter((rect) => rect.left >= handRect.left && rect.right <= handRect.right + 0.5).length,
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
    expect(Math.min(...handMetrics.cardWidths)).toBeGreaterThanOrEqual(40);
    expect(Math.max(...handMetrics.cardWidths)).toBeLessThanOrEqual(44);
    expect(Math.min(...handMetrics.cardGaps)).toBeGreaterThanOrEqual(2);
    expect(Math.max(...handMetrics.cardGaps)).toBeLessThanOrEqual(4);
    expect(Math.min(...handMetrics.cardHeights)).toBeGreaterThanOrEqual(52);
    expect(Math.min(...handMetrics.cardFontSizes)).toBeGreaterThanOrEqual(22);
    expect(handMetrics.fullyVisibleCards).toBeGreaterThanOrEqual(9);
    expect(handMetrics.fullyVisibleCards).toBeLessThanOrEqual(10);
    expect(handMetrics.scrollWidth).toBeGreaterThan(handMetrics.clientWidth);
    expect(handMetrics.scrollHeight).toBeLessThanOrEqual(handMetrics.clientHeight);
    expect(handMetrics.overflowX).toBe("auto");
    expect(handMetrics.overflowY).toBe("hidden");
    const handScrollTools = page.getByTestId("hand-scroll-tools");
    const handScrollPrev = page.getByTestId("hand-scroll-prev");
    const handScrollNext = page.getByTestId("hand-scroll-next");
    await expect(handScrollTools).toContainText("左右翻看");
    await expect(handScrollPrev).toBeDisabled();
    await expect(handScrollNext).toBeEnabled();
    const handScrollButtonSizes = await handScrollTools.locator("button").evaluateAll((buttons) =>
      buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return { width: Math.round(rect.width), height: Math.round(rect.height) };
      }),
    );
    expect(Math.min(...handScrollButtonSizes.map((size) => size.width))).toBeGreaterThanOrEqual(26);
    expect(Math.min(...handScrollButtonSizes.map((size) => size.height))).toBeGreaterThanOrEqual(26);
    const handIdsBeforePaging = await page.locator("[data-testid^='hand-card-']").evaluateAll((cards) =>
      cards.map((card) => (card as HTMLElement).dataset.testid),
    );
    await handScrollNext.click();
    await expect.poll(() => page.locator(".hand").evaluate((hand) => hand.scrollLeft)).toBeGreaterThan(50);
    await expect(handScrollPrev).toBeEnabled();
    expect(await page.locator("[data-testid^='hand-card-']").evaluateAll((cards) =>
      cards.map((card) => (card as HTMLElement).dataset.testid),
    )).toEqual(handIdsBeforePaging);
    await handScrollPrev.click();
    await expect.poll(() => page.locator(".hand").evaluate((hand) => hand.scrollLeft)).toBeLessThanOrEqual(2);
    await expect(handScrollPrev).toBeDisabled();
    await expect(page.locator(".hand .card[role='img']").first()).toHaveAttribute("aria-label", /^(黄|红|绿|白|金条).+/);
    const redCardContrast = await page.locator(".hand .card").first().evaluate((source) => {
      const sample = source.cloneNode(true) as HTMLElement;
      sample.classList.remove("color-yellow", "color-red", "color-green", "color-white", "color-gold");
      sample.classList.add("color-red");
      sample.style.position = "fixed";
      sample.style.left = "-9999px";
      document.body.appendChild(sample);
      const parseRgb = (value: string): number[] => value.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [0, 0, 0];
      const luminance = (rgb: number[]): number => {
        const [red, green, blue] = rgb.map((channel) => {
          const normalized = channel / 255;
          return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      };
      const style = getComputedStyle(sample);
      const foreground = luminance(parseRgb(style.color));
      const background = luminance(parseRgb(style.backgroundColor));
      sample.remove();
      return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
    });
    expect(redCardContrast).toBeGreaterThanOrEqual(4.5);

    const protectedCardState = await page.locator(".hand").evaluate((hand) => {
      const blocked = Array.from(hand.querySelectorAll<HTMLElement>(".hand-card.blocked"));
      return {
        blockedCount: blocked.length,
        badgeCount: hand.querySelectorAll(".discard-protected-badge").length,
        labels: blocked.map((card) => card.getAttribute("aria-label") ?? ""),
        opacities: blocked.map((card) => Number.parseFloat(getComputedStyle(card).opacity)),
      };
    });
    expect(protectedCardState.badgeCount).toBe(protectedCardState.blockedCount);
    expect(protectedCardState.labels.every((label) => label.endsWith("规则保护，不能打出"))).toBe(true);
    expect(protectedCardState.opacities.every((opacity) => opacity >= 0.7)).toBe(true);

    const selectedCard = page.locator("[data-testid^='hand-card-']:enabled").first();
    const selectedCardTestId = await selectedCard.getAttribute("data-testid");
    expect(selectedCardTestId).toBeTruthy();
    let releasePrivateState = () => undefined;
    let markPrivateStateCaptured = () => undefined;
    let privateStateIntercepted = false;
    let capturedPrivateStateCardIds: string[] = [];
    const privateStateRelease = new Promise<void>((resolve) => {
      releasePrivateState = resolve;
    });
    const privateStateCaptured = new Promise<void>((resolve) => {
      markPrivateStateCaptured = resolve;
    });
    await page.route("**/private-state?**", async (route) => {
      if (privateStateIntercepted) {
        await route.continue();
        return;
      }
      privateStateIntercepted = true;
      const response = await route.fetch();
      const payload = await response.json() as { privateHand?: Array<{ id?: string }> };
      capturedPrivateStateCardIds = (payload.privateHand ?? []).map((card) => String(card.id ?? ""));
      markPrivateStateCaptured();
      await privateStateRelease;
      await route.fulfill({ response, body: JSON.stringify(payload) });
    });
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await privateStateCaptured;
    expect(capturedPrivateStateCardIds).toContain(selectedCardTestId!.replace(/^hand-card-/, ""));
    const discardConfirm = page.getByTestId("discard-confirm");
    await expect(page.locator(".action-dock").getByTestId("discard-confirm")).toBeVisible();
    await expect(page.locator(".hand-toolbar").getByTestId("discard-confirm")).toHaveCount(0);
    await expect(discardConfirm).toBeDisabled();
    await expect(discardConfirm).toHaveText("先选牌");
    const handBeforeSelection = await page.locator("[data-testid^='hand-card-']").evaluateAll((cards) =>
      cards.map((card) => (card as HTMLElement).dataset.testid),
    );
    await selectedCard.click();
    await selectedCard.dblclick();
    await expect(selectedCard).toHaveAttribute("aria-pressed", "true");
    await expect(selectedCard).toHaveAttribute("aria-label", /已选中$/);
    await expect(selectedCard.locator(".discard-selection-badge")).toHaveText("✓");
    expect(await page.locator("[data-testid^='hand-card-']").evaluateAll((cards) =>
      cards.map((card) => (card as HTMLElement).dataset.testid),
    )).toEqual(handBeforeSelection);
    await expect(discardConfirm).toBeEnabled();
    await expect(discardConfirm).toHaveText("出牌");
    const gameSettings = page.getByTestId("game-settings");
    await expect(gameSettings).toBeDisabled();
    await expect(gameSettings).toContainText("先操作");
    await expect(gameSettings).toHaveAttribute("aria-label", "请先完成当前操作，再打开设置");
    await expect(page.getByTestId("settings-panel")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("iphone-se-selected-card.png") });
    const discardButtonRect = await discardConfirm.evaluate((button) => {
      const rect = button.getBoundingClientRect();
      return { height: Math.round(rect.height), right: Math.round(rect.right), bottom: Math.round(rect.bottom) };
    });
    expect(discardButtonRect.height).toBeGreaterThanOrEqual(36);
    expect(discardButtonRect.height).toBeLessThanOrEqual(48);
    expect(discardButtonRect.right).toBeLessThanOrEqual(667);
    expect(discardButtonRect.bottom).toBeLessThanOrEqual(375);
    await discardConfirm.click();
    await expect(page.getByTestId(selectedCardTestId!)).toHaveCount(0);
    await page.evaluate((testId) => {
      const key = "sise_test_stale_private_card_reappeared";
      sessionStorage.setItem(key, "0");
      const observer = new MutationObserver(() => {
        if (document.querySelector(`[data-testid="${testId}"]`)) {
          sessionStorage.setItem(key, "1");
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      window.setTimeout(() => observer.disconnect(), 1_000);
    }, selectedCardTestId!);
    releasePrivateState();
    await page.waitForTimeout(500);
    await expect(page.getByTestId(selectedCardTestId!)).toHaveCount(0);
    expect(await page.evaluate(() => sessionStorage.getItem("sise_test_stale_private_card_reappeared"))).toBe("0");
    await page.unroute("**/private-state?**");
    await expect(page.getByTestId("pending-card")).toBeVisible({ timeout: 5_000 });
    const waitingHandState = await page.locator(".hand").evaluate((hand) => {
      const cards = Array.from(hand.querySelectorAll<HTMLElement>(".hand-card"));
      return {
        blockedCount: hand.querySelectorAll(".hand-card.blocked").length,
        minimumOpacity: Math.min(...cards.map((card) => Number.parseFloat(getComputedStyle(card).opacity))),
        labels: cards.map((card) => card.getAttribute("aria-label") ?? ""),
      };
    });
    expect(waitingHandState.blockedCount).toBe(0);
    expect(waitingHandState.minimumOpacity).toBeGreaterThanOrEqual(0.95);
    expect(waitingHandState.labels.every((label) => label.endsWith("当前无需选牌"))).toBe(true);
    const visibleFlows = page.locator(".flow-card");
    expect(await visibleFlows.count()).toBeGreaterThan(0);
    await expect(page.getByText("暂无流水", { exact: true })).toHaveCount(0);
    const flowMetrics = await visibleFlows.evaluateAll((flows) => flows.map((flow) => {
      const title = flow.querySelector<HTMLElement>("p")!;
      return {
        cardCount: flow.querySelectorAll(".discard-token").length,
        label: flow.getAttribute("aria-label"),
        title: title.textContent,
        titleFontSize: Number.parseFloat(getComputedStyle(title).fontSize),
      };
    }));
    expect(flowMetrics.every((flow) => flow.cardCount > 0)).toBe(true);
    expect(flowMetrics.every((flow) => flow.label?.startsWith("流水："))).toBe(true);
    expect(flowMetrics.every((flow) => flow.title?.includes(" → "))).toBe(true);
    expect(Math.min(...flowMetrics.map((flow) => flow.titleFontSize))).toBeGreaterThanOrEqual(12);
    const pendingGeometry = await page.getByTestId("pending-card").evaluate((pendingElement) => {
      const deckElement = document.querySelector<HTMLElement>('[data-testid="deck-stack"]');
      if (!deckElement) {
        throw new Error("Deck stack is missing while measuring the pending card");
      }
      const deck = deckElement.getBoundingClientRect();
      const pending = pendingElement.getBoundingClientRect();
      return {
        deckLeft: deck.left,
        deckTop: deck.top,
        deckRight: deck.right,
        pendingLeft: pending.left,
        deckCenterX: deck.x + deck.width / 2,
        pendingCenterX: pending.x + pending.width / 2,
        deckCenterY: deck.y + deck.height / 2,
        pendingCenterY: pending.y + pending.height / 2,
      };
    });
    expect(Math.abs(pendingGeometry.deckLeft - fixedDeckPosition!.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(pendingGeometry.deckTop - fixedDeckPosition!.y)).toBeLessThanOrEqual(1);
    expect(pendingGeometry.deckRight).toBeLessThanOrEqual(pendingGeometry.pendingLeft);
    expect(pendingGeometry.deckCenterX).toBeLessThan(pendingGeometry.pendingCenterX);
    expect(Math.abs(pendingGeometry.deckCenterY - pendingGeometry.pendingCenterY)).toBeLessThanOrEqual(2);
    await page.screenshot({ path: testInfo.outputPath("iphone-se-pending-card.png") });

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
    expect(Math.min(...actionMetrics.sizes.map((size) => size.width))).toBeGreaterThanOrEqual(40);
    expect(Math.min(...actionMetrics.sizes.map((size) => size.height))).toBeGreaterThanOrEqual(40);
    expect(Math.max(...actionMetrics.sizes.map((size) => size.height))).toBeLessThanOrEqual(46);

    const pageOverflow = await page.evaluate(() => ({
      width: document.body.scrollWidth,
      height: document.body.scrollHeight,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
    }));
    expect(pageOverflow.width).toBeLessThanOrEqual(pageOverflow.viewportWidth);
    expect(pageOverflow.height).toBeLessThanOrEqual(pageOverflow.viewportHeight);

    await page.getByTestId("game-exit").click();
    await expect(page.getByRole("dialog", { name: "退出当前牌局？" })).toBeVisible();
    await expect(page.getByTestId("cancel-exit")).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(page.getByTestId("confirm-exit")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("cancel-exit")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "退出当前牌局？" })).toHaveCount(0);
    await expect(page.getByTestId("game-exit")).toBeFocused();

    await page.getByTestId("game-exit").click();
    await page.getByTestId("cancel-exit").click();
    await expect(page.getByTestId("game-exit")).toBeFocused();
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

  test("keeps settings readable and clears them when a turn needs attention", async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    await page.addInitScript(() => {
      const key = "sise_test_vibration_calls";
      Object.defineProperty(navigator, "vibrate", {
        configurable: true,
        value: (pattern: VibratePattern) => {
          const calls = JSON.parse(sessionStorage.getItem(key) ?? "[]") as VibratePattern[];
          calls.push(pattern);
          sessionStorage.setItem(key, JSON.stringify(calls));
          return true;
        },
      });
      Object.defineProperty(navigator, "wakeLock", {
        configurable: true,
        value: {
          request: async (type: string) => {
            const requestKey = "sise_test_wake_lock_requests";
            sessionStorage.setItem(requestKey, String(Number(sessionStorage.getItem(requestKey) ?? "0") + 1));
            let released = false;
            const releaseListeners: Array<() => void> = [];
            return {
              get released() {
                return released;
              },
              addEventListener: (_event: string, listener: () => void) => releaseListeners.push(listener),
              release: async () => {
                if (released) return;
                released = true;
                const releaseKey = "sise_test_wake_lock_releases";
                sessionStorage.setItem(releaseKey, String(Number(sessionStorage.getItem(releaseKey) ?? "0") + 1));
                releaseListeners.forEach((listener) => listener());
              },
              type,
            };
          },
        },
      });
    });
    await enterLobby(page);
    await page.getByTestId("lobby-start").click();

    const confirmDeclaration = page.getByTestId("confirm-declaration");
    await expect(confirmDeclaration).toBeVisible({ timeout: 15_000 });
    await expect(confirmDeclaration).toBeEnabled({ timeout: 15_000 });
    await expect.poll(() => page.evaluate(() => Number(sessionStorage.getItem("sise_test_wake_lock_requests") ?? "0")))
      .toBeGreaterThanOrEqual(1);
    const gameSettings = page.getByTestId("game-settings");
    await expect(gameSettings).toBeEnabled();
    await expect(gameSettings).toContainText("设置");
    await gameSettings.click();

    const settingsPanel = page.getByTestId("settings-panel");
    await expect(settingsPanel).toBeVisible();
    await expect(settingsPanel).toHaveAttribute("aria-modal", "true");
    await expect(settingsPanel).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(settingsPanel).toHaveCount(0);
    await expect(gameSettings).toBeFocused();
    await gameSettings.click();
    await expect(settingsPanel).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(page.getByTestId("settings-rules")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "关闭设置" })).toBeFocused();
    await page.waitForTimeout(200);
    const settingsGeometry = await settingsPanel.evaluate((panel) => {
      const panelRect = panel.getBoundingClientRect();
      const headerRect = document.querySelector<HTMLElement>('[data-testid="game-control-header"]')!.getBoundingClientRect();
      const closeButton = panel.querySelector<HTMLButtonElement>('button[aria-label="关闭设置"]')!;
      const closeRect = closeButton.getBoundingClientRect();
      const optionFontSizes = Array.from(panel.querySelectorAll<HTMLElement>(".mode-options button"))
        .map((button) => Number.parseFloat(getComputedStyle(button).fontSize));
      return {
        top: panelRect.top,
        bottom: panelRect.bottom,
        headerBottom: headerRect.bottom,
        viewportHeight: innerHeight,
        overflowY: getComputedStyle(panel).overflowY,
        backgroundColor: getComputedStyle(panel).backgroundColor,
        closeWidth: Math.round(closeRect.width),
        closeHeight: Math.round(closeRect.height),
        minimumOptionFontSize: Math.min(...optionFontSizes),
      };
    });
    expect(settingsGeometry.top).toBeGreaterThanOrEqual(settingsGeometry.headerBottom);
    expect(settingsGeometry.bottom).toBeLessThanOrEqual(settingsGeometry.viewportHeight);
    expect(settingsGeometry.overflowY).toBe("auto");
    expect(settingsGeometry.backgroundColor).toBe("rgb(8, 15, 29)");
    expect(settingsGeometry.closeWidth).toBeGreaterThanOrEqual(40);
    expect(settingsGeometry.closeHeight).toBeGreaterThanOrEqual(40);
    expect(settingsGeometry.minimumOptionFontSize).toBeGreaterThanOrEqual(13);
    await page.screenshot({ path: testInfo.outputPath("iphone-se-settings.png") });

    await expect(page.getByTestId("card-mode-own-adaptive")).toHaveClass(/active/);
    await expect(page.getByTestId("card-mode-table-adaptive")).toHaveClass(/active/);
    await expect(page.getByTestId("seat-direction-counterclockwise")).toHaveClass(/active/);
    await expect(page.getByTestId("turn-alert-sound-vibration")).toHaveClass(/active/);
    const keepScreenAwake = page.getByTestId("keep-screen-awake");
    await expect(keepScreenAwake).toHaveAttribute("aria-checked", "true");
    const initialWakeLockRequests = await page.evaluate(() =>
      Number(sessionStorage.getItem("sise_test_wake_lock_requests") ?? "0"),
    );
    await keepScreenAwake.click();
    await expect(keepScreenAwake).toHaveAttribute("aria-checked", "false");
    await expect.poll(() => page.evaluate(() => Number(sessionStorage.getItem("sise_test_wake_lock_releases") ?? "0")))
      .toBeGreaterThanOrEqual(1);
    await keepScreenAwake.click();
    await expect(keepScreenAwake).toHaveAttribute("aria-checked", "true");
    await expect.poll(() => page.evaluate(() => Number(sessionStorage.getItem("sise_test_wake_lock_requests") ?? "0")))
      .toBeGreaterThan(initialWakeLockRequests);
    const initialSeatIds = {
      left: await page.getByTestId("player-left").getAttribute("data-player-id"),
      right: await page.getByTestId("player-right").getAttribute("data-player-id"),
      top: await page.getByTestId("player-top").getAttribute("data-player-id"),
    };
    await page.getByTestId("card-mode-own-long").click();
    await expect(page.getByTestId("declare-hand-preview").locator("[data-card-mode='long']").first()).toBeVisible();
    await page.getByTestId("card-mode-table-long").click();
    await expect(page.getByTestId("dealer-card").locator("[data-card-mode='long']")).toBeVisible();
    await page.getByTestId("seat-direction-clockwise").click();
    await page.getByTestId("turn-alert-sound").click();
    await expect(page.getByTestId("turn-alert-sound")).toHaveClass(/active/);
    await page.getByTestId("turn-alert-sound-vibration").click();
    await expect(page.getByTestId("player-left")).toHaveAttribute("data-player-id", initialSeatIds.right!);
    await expect(page.getByTestId("player-right")).toHaveAttribute("data-player-id", initialSeatIds.left!);
    await expect(page.getByTestId("player-top")).toHaveAttribute("data-player-id", initialSeatIds.top!);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("sise_game_display_preferences_v2") ?? "{}"))).toMatchObject({
      ownCards: "long",
      tableCards: "long",
      seatDirection: "clockwise",
      turnAlert: "sound-vibration",
      keepScreenAwake: true,
    });
    await page.screenshot({ path: testInfo.outputPath("iphone-se-clockwise.png") });
    await page.getByTestId("seat-direction-counterclockwise").click();
    await expect(page.getByTestId("player-left")).toHaveAttribute("data-player-id", initialSeatIds.left!);
    await expect(page.getByTestId("player-right")).toHaveAttribute("data-player-id", initialSeatIds.right!);
    await page.screenshot({ path: testInfo.outputPath("iphone-se-counterclockwise.png") });
    await page.getByTestId("settings-rules").click();
    const rulesDialog = page.getByRole("dialog", { name: "四色牌规则" });
    await expect(rulesDialog).toBeVisible();
    await expect(page.getByTestId("close-rules")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(rulesDialog).toHaveCount(0);
    await expect(gameSettings).toBeFocused();

    await gameSettings.click();
    await expect(settingsPanel).toBeVisible();
    await page.getByTestId("settings-rules").click();
    await expect(rulesDialog).toBeVisible();
    await confirmDeclaration.dispatchEvent("click");
    await expect(gameSettings).toBeDisabled({ timeout: 30_000 });
    await expect(rulesDialog).toHaveCount(0);
    await expect(settingsPanel).toHaveCount(0);
    await expect(gameSettings).toContainText("先操作");
    await expect(page.locator(".hand-card.playable:focus, .action-dock .btn:not(:disabled):focus")).toHaveCount(1);
    await expect(page.locator(".hand [data-card-mode='long']").first()).toBeVisible();
    await expect.poll(() => page.title()).toBe("轮到你了 · 四色牌");
    const vibrationCalls = await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem("sise_test_vibration_calls") ?? "[]") as unknown[],
    );
    expect(vibrationCalls.some((pattern) => Array.isArray(pattern) && pattern.length === 3)).toBe(true);
  });
});

test.describe("legacy small landscape gameplay", () => {
  test.use({ viewport: { width: 568, height: 320 }, hasTouch: true, isMobile: true });

  test("keeps eight readable hand cards and every control inside the canvas", async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await enterLobby(page);
    await page.getByTestId("lobby-start").click();

    const confirmDeclaration = page.getByTestId("confirm-declaration");
    await expect(confirmDeclaration).toBeVisible({ timeout: 20_000 });
    const declarationGeometry = await page.locator(".declare-panel").evaluate((panel) => {
      const rect = panel.getBoundingClientRect();
      return {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        scrollHeight: panel.scrollHeight,
        clientHeight: panel.clientHeight,
      };
    });
    expect(declarationGeometry.width).toBeLessThanOrEqual(568);
    expect(declarationGeometry.height).toBeLessThanOrEqual(320);
    expect(declarationGeometry.scrollHeight).toBeGreaterThanOrEqual(declarationGeometry.clientHeight);
    await confirmDeclaration.click();

    await expect(page.getByTestId("game-board")).toBeVisible({ timeout: 20_000 });
    await expectDedicatedGameHeader(page);
    await expect(page.getByTestId("bot-identity")).toHaveCount(3);
    await reachDiscardConfirmation(page);
    await expect(page.locator(".deal-overlay")).toHaveCount(0, { timeout: 6_000 });

    const metrics = await page.evaluate(() => {
      const header = document.querySelector<HTMLElement>("[data-testid='game-control-header']")!;
      const board = document.querySelector<HTMLElement>("[data-testid='game-board']")!;
      const self = document.querySelector<HTMLElement>(".self-info-card")!;
      const hand = document.querySelector<HTMLElement>(".hand")!;
      const dock = document.querySelector<HTMLElement>(".action-dock")!;
      const handRect = hand.getBoundingClientRect();
      const cardRects = Array.from(hand.querySelectorAll<HTMLElement>(".hand-card")).map((card) => {
        const rect = card.getBoundingClientRect();
        const face = card.querySelector<HTMLElement>(".text-top");
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          fontSize: Number.parseFloat(face ? getComputedStyle(face).fontSize : "0"),
        };
      });
      const visibleDockButtons = Array.from(dock.querySelectorAll<HTMLElement>("button")).filter((button) => {
        const rect = button.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      const rectOf = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
      };
      return {
        bodyWidth: document.body.scrollWidth,
        bodyHeight: document.body.scrollHeight,
        header: rectOf(header),
        board: rectOf(board),
        self: rectOf(self),
        hand: rectOf(hand),
        dock: rectOf(dock),
        cardRows: new Set(cardRects.map((rect) => Math.round(rect.top))).size,
        fullyVisibleCards: cardRects.filter(
          (rect) => rect.left >= handRect.left && rect.right <= handRect.right + 0.5,
        ).length,
        minimumCardWidth: Math.min(...cardRects.map((rect) => rect.width)),
        minimumCardHeight: Math.min(...cardRects.map((rect) => rect.height)),
        minimumCardFontSize: Math.min(...cardRects.map((rect) => rect.fontSize)),
        minimumDockButtonWidth: Math.min(...visibleDockButtons.map((button) => button.getBoundingClientRect().width)),
        minimumDockButtonHeight: Math.min(...visibleDockButtons.map((button) => button.getBoundingClientRect().height)),
      };
    });

    expect(metrics.bodyWidth).toBeLessThanOrEqual(568);
    expect(metrics.bodyHeight).toBeLessThanOrEqual(320);
    expect(metrics.board.top).toBeGreaterThanOrEqual(metrics.header.bottom);
    expect(metrics.self.right).toBeLessThanOrEqual(metrics.hand.left);
    expect(metrics.hand.right).toBeLessThanOrEqual(metrics.dock.left);
    expect(metrics.cardRows).toBe(1);
    expect(metrics.fullyVisibleCards).toBeGreaterThanOrEqual(8);
    expect(metrics.minimumCardWidth).toBeGreaterThanOrEqual(40);
    expect(metrics.minimumCardHeight).toBeGreaterThanOrEqual(52);
    expect(metrics.minimumCardFontSize).toBeGreaterThanOrEqual(22);
    expect(metrics.minimumDockButtonWidth).toBeGreaterThanOrEqual(40);
    expect(metrics.minimumDockButtonHeight).toBeGreaterThanOrEqual(40);
    await page.screenshot({ path: testInfo.outputPath("iphone-5-readable-game.png") });
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
    await expect(page.getByTestId("declare-hand-preview").locator("[data-card-mode='long']").first()).toBeVisible();
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

test.describe("display preference compatibility", () => {
  test("migrates the previous full table preference into the new model", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem("sise_game_display_preferences_v2");
      localStorage.setItem("sise_table_card_mode", "full");
    });
    await page.goto("/");

    await expect.poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem("sise_game_display_preferences_v2") ?? "{}")),
    ).toMatchObject({
      ownCards: "adaptive",
      tableCards: "long",
      seatDirection: "counterclockwise",
    });
  });
});

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

  test("keeps lobby actions reachable and gameplay controls touch sized", async ({ page }, testInfo) => {
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
    await expect(confirmDeclaration).toBeEnabled({ timeout: 15_000 });

    await expect(page.getByRole("heading", { name: "声明亮鱼与暗坎" })).toBeVisible();
    const handPreview = page.getByTestId("declare-hand-preview");
    await expect(handPreview).toBeVisible();
    await expect(handPreview.locator("[data-card-mode='large']").first()).toBeVisible();
    await expect(handPreview.locator("button")).toHaveCount(0);
    await expect(page.getByTestId("kong-count-0")).toBeVisible();
    await expect(confirmDeclaration).toContainText(/确认/);
    const declarationSeconds = Number(await page.locator(".declare-timer strong").textContent());
    expect(declarationSeconds).toBeGreaterThanOrEqual(40);
    expect(declarationSeconds).toBeLessThanOrEqual(45);

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
    const fixedDeckPosition = await page.getByTestId("deck-stack").boundingBox();
    expect(fixedDeckPosition).not.toBeNull();
    await reachDiscardConfirmation(page);
    await expect(page.getByTestId("action-guidance")).toContainText("该你操作了");
    await expect(page.getByTestId("action-guidance")).toContainText(/还剩 \d+ 秒/);
    const decisionSecondsMatch = (await page.getByTestId("action-guidance").textContent())?.match(/还剩\s*(\d+)\s*秒/);
    expect(Number(decisionSecondsMatch?.[1] ?? 0)).toBeGreaterThanOrEqual(22);
    expect(Number(decisionSecondsMatch?.[1] ?? 0)).toBeLessThanOrEqual(30);
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

    const selectedCard = page.locator("[data-testid^='hand-card-']:enabled").first();
    const selectedCardTestId = await selectedCard.getAttribute("data-testid");
    expect(selectedCardTestId).toBeTruthy();
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
    await expect(page.getByTestId("pending-card")).toBeVisible({ timeout: 5_000 });
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
    const pendingGeometry = await page.evaluate(() => {
      const deck = document.querySelector<HTMLElement>('[data-testid="deck-stack"]')!.getBoundingClientRect();
      const pending = document.querySelector<HTMLElement>('[data-testid="pending-card"]')!.getBoundingClientRect();
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

    const gameSettings = page.getByTestId("game-settings");
    await expect(gameSettings).toBeDisabled();
    await expect(gameSettings).toContainText("先操作");
    await expect(gameSettings).toHaveAttribute("aria-label", "请先完成当前操作，再打开设置");
    await expect(page.getByTestId("settings-panel")).toHaveCount(0);

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
    });
    await enterLobby(page);
    await page.getByTestId("lobby-start").click();

    const confirmDeclaration = page.getByTestId("confirm-declaration");
    await expect(confirmDeclaration).toBeVisible({ timeout: 15_000 });
    await expect(confirmDeclaration).toBeEnabled({ timeout: 15_000 });
    const gameSettings = page.getByTestId("game-settings");
    await expect(gameSettings).toBeEnabled();
    await expect(gameSettings).toContainText("设置");
    await gameSettings.click();

    const settingsPanel = page.getByTestId("settings-panel");
    await expect(settingsPanel).toBeVisible();
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
    });
    await page.screenshot({ path: testInfo.outputPath("iphone-se-clockwise.png") });
    await page.getByTestId("seat-direction-counterclockwise").click();
    await expect(page.getByTestId("player-left")).toHaveAttribute("data-player-id", initialSeatIds.left!);
    await expect(page.getByTestId("player-right")).toHaveAttribute("data-player-id", initialSeatIds.right!);
    await page.screenshot({ path: testInfo.outputPath("iphone-se-counterclockwise.png") });
    await page.getByTestId("settings-rules").click();
    await expect(page.locator(".rules-panel")).toBeVisible();
    await page.getByRole("button", { name: "关闭", exact: true }).click();

    await gameSettings.click();
    await expect(settingsPanel).toBeVisible();
    await confirmDeclaration.dispatchEvent("click");
    await expect(gameSettings).toBeDisabled({ timeout: 30_000 });
    await expect(settingsPanel).toHaveCount(0);
    await expect(gameSettings).toContainText("先操作");
    await expect(page.locator(".hand [data-card-mode='long']").first()).toBeVisible();
    await expect.poll(() => page.title()).toBe("轮到你了 · 四色牌");
    const vibrationCalls = await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem("sise_test_vibration_calls") ?? "[]") as unknown[],
    );
    expect(vibrationCalls.some((pattern) => Array.isArray(pattern) && pattern.length === 3)).toBe(true);
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

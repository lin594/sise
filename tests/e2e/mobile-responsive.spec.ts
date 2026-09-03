import { expect, test, type Page } from "@playwright/test";

async function enterLobby(page: Page, path = "/"): Promise<void> {
  await page.goto(path);
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
  await expect(settingsButton).toContainText("设置");
  await expect(settingsButton).toHaveAttribute("aria-label", /牌局设置|完成当前操作后可打开设置/);
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
  expect(geometry.minimumControlHeight).toBeGreaterThanOrEqual(36);
}

async function expectCompactTableContained(page: Page): Promise<{
  tableHeight: number;
  selfRowHeight: number;
}> {
  const geometry = await page.evaluate(() => {
    const table = document.querySelector<HTMLElement>(".table")!;
    const selfHand = document.querySelector<HTMLElement>(".self-hand-card")!;
    const tableRect = table.getBoundingClientRect();
    const zones = [
      "[data-testid='player-top']",
      "[data-testid='player-left']",
      ".center",
      "[data-testid='player-right']",
      ".self-groups-card",
    ].map((selector) => {
      const element = document.querySelector<HTMLElement>(selector)!;
      const rect = element.getBoundingClientRect();
      return {
        selector,
        logicalHeight: element.offsetHeight,
        inside:
          rect.left >= tableRect.left - 1 &&
          rect.top >= tableRect.top - 1 &&
          rect.right <= tableRect.right + 1 &&
          rect.bottom <= tableRect.bottom + 1,
      };
    });
    return {
      tableHeight: table.offsetHeight,
      tableClientHeight: table.clientHeight,
      tableScrollHeight: table.scrollHeight,
      selfRowHeight: selfHand.offsetHeight,
      zones,
    };
  });
  expect(geometry.tableScrollHeight).toBeLessThanOrEqual(geometry.tableClientHeight + 1);
  expect(geometry.zones.every((zone) => zone.inside)).toBe(true);
  expect(Math.min(...geometry.zones.map((zone) => zone.logicalHeight))).toBeGreaterThan(0);
  return {
    tableHeight: geometry.tableHeight,
    selfRowHeight: geometry.selfRowHeight,
  };
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
    const nextRound = page.getByRole("button", { name: "下一局（房主）" });
    if ((await nextRound.isVisible().catch(() => false)) && (await nextRound.isEnabled().catch(() => false))) {
      await nextRound.click();
      await page.waitForTimeout(180);
      continue;
    }
    if (await page.locator(".hu-panel").isVisible().catch(() => false)) {
      await page.waitForTimeout(180);
      continue;
    }
    const declaration = page.getByTestId("confirm-declaration");
    if ((await declaration.isVisible().catch(() => false)) && (await declaration.isEnabled().catch(() => false))) {
      await declaration.click();
      await page.waitForTimeout(180);
      continue;
    }
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

async function expectFiveButtonActionGrid(page: Page): Promise<void> {
  const actionMetrics = await page.locator(".action-dock .actions").evaluate((element) => {
    const first = element.querySelector<HTMLButtonElement>(".btn");
    if (!first) {
      throw new Error("Action dock rendered without action buttons");
    }
    const hadDiscardMode = element.classList.contains("discard-mode");
    element.classList.remove("discard-mode");
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
    if (hadDiscardMode) {
      element.classList.add("discard-mode");
    }
    return { sizes, rows };
  });
  expect(actionMetrics.rows).toBe(2);
  expect(Math.min(...actionMetrics.sizes.map((size) => size.width))).toBeGreaterThanOrEqual(40);
  expect(Math.min(...actionMetrics.sizes.map((size) => size.height))).toBeGreaterThanOrEqual(40);
  expect(Math.max(...actionMetrics.sizes.map((size) => size.height))).toBeLessThanOrEqual(46);
}

test.describe("clear first-time entry", () => {
  test.use({ viewport: { width: 568, height: 320 }, hasTouch: true, isMobile: true });

  test("keeps nickname and playable modes obvious on legacy phones", async ({ page }, testInfo) => {
    await page.goto("/");

    const nicknameInput = page.getByTestId("nickname-input");
    const firstNickname = await nicknameInput.inputValue();
    expect(firstNickname.trim().length).toBeGreaterThan(0);
    await expect(page.getByTestId("login-submit")).toHaveText("下一步：选择玩法");
    await expect(page.getByTestId("open-rules")).toHaveCount(1);
    await expect(page.locator(".entry-actions button")).toHaveCount(2);

    const entryGeometry = await page.evaluate(() => {
      const shell = document.querySelector<HTMLElement>(".entry-shell")!;
      const card = shell.querySelector<HTMLElement>(".entry-card")!;
      const input = shell.querySelector<HTMLInputElement>("[data-testid='nickname-input']")!;
      const label = shell.querySelector<HTMLElement>(".entry-field > span")!;
      const description = shell.querySelector<HTMLElement>(".entry-desc")!;
      const buttons = [...shell.querySelectorAll<HTMLButtonElement>(".entry-actions button")];
      const cardRect = card.getBoundingClientRect();
      const isInsideCard = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        return rect.left >= cardRect.left && rect.right <= cardRect.right && rect.top >= cardRect.top && rect.bottom <= cardRect.bottom;
      };
      return {
        noPageOverflow: document.body.scrollWidth <= innerWidth && document.body.scrollHeight <= innerHeight,
        controlsInsideCard: [input, ...buttons].every(isInsideCard),
        inputFontSize: Number.parseFloat(getComputedStyle(input).fontSize),
        labelFontSize: Number.parseFloat(getComputedStyle(label).fontSize),
        descriptionFontSize: Number.parseFloat(getComputedStyle(description).fontSize),
        minimumButtonWidth: Math.min(...buttons.map((button) => button.getBoundingClientRect().width)),
        minimumButtonHeight: Math.min(...buttons.map((button) => button.getBoundingClientRect().height)),
        minimumButtonFontSize: Math.min(...buttons.map((button) => Number.parseFloat(getComputedStyle(button).fontSize))),
      };
    });
    expect(entryGeometry).toMatchObject({
      noPageOverflow: true,
      controlsInsideCard: true,
    });
    expect(entryGeometry.inputFontSize).toBeGreaterThanOrEqual(18);
    expect(entryGeometry.labelFontSize).toBeGreaterThanOrEqual(15);
    expect(entryGeometry.descriptionFontSize).toBeGreaterThanOrEqual(14);
    expect(entryGeometry.minimumButtonWidth).toBeGreaterThanOrEqual(150);
    expect(entryGeometry.minimumButtonHeight).toBeGreaterThanOrEqual(48);
    expect(entryGeometry.minimumButtonFontSize).toBeGreaterThanOrEqual(16);
    await page.screenshot({ path: testInfo.outputPath("legacy-entry-568x320.png") });

    await page.getByTestId("login-submit").click();
    await expect(page.getByText("游戏模式选择")).toBeVisible();
    const practiceMode = page.getByTestId("mode-practice_bots");
    const friendMode = page.getByTestId("mode-friends");
    await expect(page.locator(".mode-card")).toHaveCount(2);
    await expect(page.getByText("联机匹配", { exact: true })).toHaveCount(0);
    await expect(page.getByText("即将开放", { exact: true })).toHaveCount(0);
    await expect(practiceMode).toHaveAttribute("aria-pressed", "true");
    await expect(friendMode).toHaveAttribute("aria-pressed", "false");
    await expect(practiceMode).toContainText("已选择");
    await expect(friendMode).toContainText("邀请朋友");
    await expect(practiceMode).toBeFocused();
    await expect(page.locator(".front-lobby-identity")).toContainText(firstNickname);
    await expect(page.getByTestId("lobby-start")).toHaveText("开始单人练习");
    await expect(page.getByTestId("open-rules")).toHaveCount(1);

    const lobbyGeometry = await page.evaluate(() => {
      const scroll = document.querySelector<HTMLElement>("[data-testid='lobby-scroll']")!;
      const modeCards = [...scroll.querySelectorAll<HTMLElement>(".mode-card")];
      const descriptions = [...scroll.querySelectorAll<HTMLElement>(".mode-card p")];
      const start = document.querySelector<HTMLButtonElement>("[data-testid='lobby-start']")!;
      const scrollRect = scroll.getBoundingClientRect();
      const isInsideScroll = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        return rect.left >= scrollRect.left - 1 && rect.right <= scrollRect.right + 1 && rect.top >= scrollRect.top - 1 && rect.bottom <= scrollRect.bottom + 1;
      };
      return {
        scrollDoesNotHideModes: scroll.scrollHeight <= scroll.clientHeight + 1 && modeCards.every(isInsideScroll),
        minimumDescriptionFontSize: Math.min(...descriptions.map((description) => Number.parseFloat(getComputedStyle(description).fontSize))),
        startWidth: start.getBoundingClientRect().width,
        startHeight: start.getBoundingClientRect().height,
        startFontSize: Number.parseFloat(getComputedStyle(start).fontSize),
      };
    });
    expect(lobbyGeometry.scrollDoesNotHideModes).toBe(true);
    expect(lobbyGeometry.minimumDescriptionFontSize).toBeGreaterThanOrEqual(14);
    expect(lobbyGeometry.startWidth).toBeGreaterThanOrEqual(180);
    expect(lobbyGeometry.startHeight).toBeGreaterThanOrEqual(48);
    expect(lobbyGeometry.startFontSize).toBeGreaterThanOrEqual(16);
    await page.screenshot({ path: testInfo.outputPath("legacy-mode-lobby-568x320.png") });

    await page.getByTestId("change-entry-name").click();
    await expect(nicknameInput).toBeVisible();
    await expect(nicknameInput).toBeFocused();
    await expect(nicknameInput).toHaveValue(firstNickname);
    await nicknameInput.fill("王阿姨");
    await nicknameInput.press("Enter");
    await expect(practiceMode).toBeFocused();
    await expect(page.locator(".front-lobby-identity")).toContainText("王阿姨");

    await page.setViewportSize({ width: 320, height: 568 });
    await expect(page.locator("main.layout")).toHaveAttribute("data-rotated-phone-portrait", "true");
    const portraitGeometry = await page.evaluate(() => {
      const elements = [
        ...document.querySelectorAll<HTMLElement>(".mode-card"),
        document.querySelector<HTMLElement>("[data-testid='lobby-start']")!,
        document.querySelector<HTMLElement>("[data-testid='change-entry-name']")!,
        document.querySelector<HTMLElement>("[data-testid='open-rules']")!,
      ];
      return {
        noPageOverflow: document.body.scrollWidth <= innerWidth && document.body.scrollHeight <= innerHeight,
        allControlsInPhysicalViewport: elements.every((element) => {
          const rect = element.getBoundingClientRect();
          return rect.left >= -1 && rect.top >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1;
        }),
      };
    });
    expect(portraitGeometry).toEqual({ noPageOverflow: true, allControlsInPhysicalViewport: true });
    await page.screenshot({ path: testInfo.outputPath("legacy-mode-lobby-320x568.png") });

    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(page.locator("main.layout")).toHaveAttribute("data-rotated-phone-portrait", "false");
    await expect(practiceMode).toBeVisible();
    await expect(friendMode).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("desktop-mode-lobby.png") });
  });
});

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

  test("keeps the in-game exit confirmation inside the rotated canvas", async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 320, height: 568 });
    await enterLobby(page);
    await page.getByTestId("lobby-start").click();

    const confirmDeclaration = page.getByTestId("confirm-declaration");
    await expect(confirmDeclaration).toBeVisible({ timeout: 20_000 });
    await expect(confirmDeclaration).toBeEnabled({ timeout: 20_000 });
    await confirmDeclaration.click();
    await expect(page.getByTestId("game-board")).toBeVisible({ timeout: 20_000 });

    const layout = page.locator(".layout");
    await expect(layout).toHaveAttribute("data-effective-viewport", "568x320");
    await expect(layout).toHaveAttribute("data-rotated-phone-portrait", "true");
    const exitButton = page.getByTestId("game-exit");
    await exitButton.click();

    const dialog = page.getByRole("dialog", { name: "退出当前牌局？" });
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId("cancel-exit")).toBeFocused();
    const geometry = await page.evaluate(() => {
      const layoutElement = document.querySelector<HTMLElement>(".layout")!;
      const mask = document.querySelector<HTMLElement>(".exit-confirm-mask")!;
      const dialogElement = document.querySelector<HTMLElement>(".exit-confirm")!;
      const title = dialogElement.querySelector<HTMLElement>("h2")!;
      const description = dialogElement.querySelector<HTMLElement>("p")!;
      const buttons = Array.from(dialogElement.querySelectorAll<HTMLButtonElement>("button"));
      const maskRect = mask.getBoundingClientRect();
      const dialogRect = dialogElement.getBoundingClientRect();
      return {
        layoutContainsMask: layoutElement.contains(mask),
        maskOffsetWidth: mask.offsetWidth,
        maskOffsetHeight: mask.offsetHeight,
        maskInsideViewport:
          maskRect.left >= 0 &&
          maskRect.top >= 0 &&
          maskRect.right <= innerWidth &&
          maskRect.bottom <= innerHeight,
        dialogInsideViewport:
          dialogRect.left >= 0 &&
          dialogRect.top >= 0 &&
          dialogRect.right <= innerWidth &&
          dialogRect.bottom <= innerHeight,
        dialogWidth: Math.round(dialogRect.width),
        dialogHeight: Math.round(dialogRect.height),
        titleFontSize: Number.parseFloat(getComputedStyle(title).fontSize),
        descriptionFontSize: Number.parseFloat(getComputedStyle(description).fontSize),
        minimumButtonFontSize: Math.min(...buttons.map((button) => Number.parseFloat(getComputedStyle(button).fontSize))),
        minimumButtonHeight: Math.min(...buttons.map((button) => button.offsetHeight)),
      };
    });
    expect(geometry.layoutContainsMask).toBe(true);
    expect(geometry.maskOffsetWidth).toBe(568);
    expect(geometry.maskOffsetHeight).toBe(320);
    expect(geometry.maskInsideViewport).toBe(true);
    expect(geometry.dialogInsideViewport).toBe(true);
    expect(geometry.dialogHeight).toBeGreaterThan(geometry.dialogWidth);
    expect(geometry.titleFontSize).toBeGreaterThanOrEqual(20);
    expect(geometry.descriptionFontSize).toBeGreaterThanOrEqual(16);
    expect(geometry.minimumButtonFontSize).toBeGreaterThanOrEqual(16);
    expect(geometry.minimumButtonHeight).toBeGreaterThanOrEqual(42);

    await page.keyboard.press("Shift+Tab");
    await expect(page.getByTestId("confirm-exit")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("cancel-exit")).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath("in-game-exit-confirm-rotated-320x568.png") });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(exitButton).toBeFocused();
  });

  test("keeps settings and history reachable inside the rotated effective viewport", async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 320, height: 568 });
    await enterLobby(page);
    await page.getByTestId("lobby-start").click();

    const confirmDeclaration = page.getByTestId("confirm-declaration");
    await expect(confirmDeclaration).toBeVisible({ timeout: 20_000 });
    await expect(confirmDeclaration).toBeEnabled({ timeout: 20_000 });
    const layout = page.locator(".layout");
    await expect(layout).toHaveAttribute("data-effective-viewport", "568x320");
    await expect(layout).toHaveAttribute("data-rotated-phone-portrait", "true");
    await expect(page.getByTestId("declare-hand-scroll-tools")).toBeVisible();
    const declarationGeometry = await page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>(".declare-panel")!;
      const panelRect = panel.getBoundingClientRect();
      const hand = document.querySelector<HTMLElement>("[data-testid='declare-hand-preview']")!;
      const card = hand.querySelector<HTMLElement>(".hand-preview-card .card")!;
      const glyph = card.querySelector<HTMLElement>(".text-top")!;
      const buttons = Array.from(
        document.querySelectorAll<HTMLButtonElement>("[data-testid='declare-hand-scroll-tools'] button"),
      );
      return {
        panelInsideViewport:
          panelRect.left >= -1 &&
          panelRect.top >= -1 &&
          panelRect.right <= innerWidth + 1 &&
          panelRect.bottom <= innerHeight + 1,
        logicalWidth: panel.offsetWidth,
        logicalHeight: panel.offsetHeight,
        cardWidth: card.offsetWidth,
        cardHeight: card.offsetHeight,
        glyphFontSize: Number.parseFloat(getComputedStyle(glyph).fontSize),
        handOverflows: hand.scrollWidth > hand.clientWidth,
        minimumButtonWidth: Math.min(...buttons.map((button) => button.offsetWidth)),
        minimumButtonHeight: Math.min(...buttons.map((button) => button.offsetHeight)),
      };
    });
    expect(declarationGeometry.panelInsideViewport).toBe(true);
    expect(declarationGeometry.logicalWidth).toBeLessThanOrEqual(568);
    expect(declarationGeometry.logicalHeight).toBeLessThanOrEqual(320);
    expect(declarationGeometry.cardWidth).toBeGreaterThanOrEqual(40);
    expect(declarationGeometry.cardHeight).toBeGreaterThanOrEqual(44);
    expect(declarationGeometry.glyphFontSize).toBeGreaterThanOrEqual(22);
    expect(declarationGeometry.handOverflows).toBe(true);
    expect(declarationGeometry.minimumButtonWidth).toBeGreaterThanOrEqual(44);
    expect(declarationGeometry.minimumButtonHeight).toBeGreaterThanOrEqual(34);
    await page.screenshot({ path: testInfo.outputPath("declaration-rotated-320x568.png") });

    const settingsButton = page.getByTestId("game-settings");
    await expect(settingsButton).toBeEnabled();
    await settingsButton.click();
    const settingsPanel = page.getByTestId("settings-panel");
    await expect(settingsPanel).toBeVisible();
    await expect(settingsPanel).toBeFocused();
    await page.waitForTimeout(200);
    const settingsGeometry = await page.evaluate(() => {
      const layoutElement = document.querySelector<HTMLElement>(".layout")!;
      const header = document.querySelector<HTMLElement>("[data-testid='game-control-header']")!;
      const settingsButtonElement = document.querySelector<HTMLElement>("[data-testid='game-settings']")!;
      const panel = document.querySelector<HTMLElement>("[data-testid='settings-panel']")!;
      const panelRect = panel.getBoundingClientRect();
      const closeButton = panel.querySelector<HTMLButtonElement>('button[aria-label="关闭设置"]')!;
      const optionFontSizes = Array.from(
        panel.querySelectorAll<HTMLElement>(".mode-options button, .direction-options button, .alert-options button"),
      )
        .map((element) => Number.parseFloat(getComputedStyle(element).fontSize));
      const helperFontSizes = Array.from(panel.querySelectorAll<HTMLElement>("small"))
        .map((element) => Number.parseFloat(getComputedStyle(element).fontSize));
      return {
        layoutContainsPanel: layoutElement.contains(panel),
        panelInsideViewport:
          panelRect.left >= -1 &&
          panelRect.top >= -1 &&
          panelRect.right <= innerWidth + 1 &&
          panelRect.bottom <= innerHeight + 1,
        panelOffsetWidth: panel.offsetWidth,
        panelOffsetHeight: panel.offsetHeight,
        availableLogicalHeight: layoutElement.offsetHeight - header.offsetHeight,
        clientHeight: panel.clientHeight,
        scrollHeight: panel.scrollHeight,
        overflowY: getComputedStyle(panel).overflowY,
        closeWidth: closeButton.offsetWidth,
        closeHeight: closeButton.offsetHeight,
        toolFontSize: Number.parseFloat(getComputedStyle(settingsButtonElement).fontSize),
        toolHeight: settingsButtonElement.offsetHeight,
        minimumOptionFontSize: Math.min(...optionFontSizes),
        minimumHelperFontSize: Math.min(...helperFontSizes),
      };
    });
    expect(settingsGeometry.layoutContainsPanel).toBe(true);
    expect(settingsGeometry.panelInsideViewport).toBe(true);
    expect(settingsGeometry.panelOffsetWidth).toBeLessThanOrEqual(568);
    expect(settingsGeometry.panelOffsetHeight).toBeLessThan(settingsGeometry.availableLogicalHeight);
    expect(settingsGeometry.scrollHeight).toBeGreaterThan(settingsGeometry.clientHeight);
    expect(settingsGeometry.overflowY).toBe("auto");
    expect(settingsGeometry.closeWidth).toBeGreaterThanOrEqual(42);
    expect(settingsGeometry.closeHeight).toBeGreaterThanOrEqual(42);
    expect(settingsGeometry.toolFontSize).toBeGreaterThanOrEqual(13);
    expect(settingsGeometry.toolHeight).toBeGreaterThanOrEqual(36);
    expect(settingsGeometry.minimumOptionFontSize).toBeGreaterThanOrEqual(14);
    expect(settingsGeometry.minimumHelperFontSize).toBeGreaterThanOrEqual(13);
    await page.screenshot({ path: testInfo.outputPath("settings-effective-viewport-top-320x568.png") });

    await page.keyboard.press("Shift+Tab");
    const rulesEntry = page.getByTestId("settings-rules");
    await expect(rulesEntry).toBeFocused();
    const bottomGeometry = await settingsPanel.evaluate((panel) => {
      const panelRect = panel.getBoundingClientRect();
      const rules = panel.querySelector<HTMLElement>("[data-testid='settings-rules']")!;
      const wakeLock = panel.querySelector<HTMLElement>("[data-testid='keep-screen-awake']")!;
      const isInside = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.left >= panelRect.left - 1 &&
          rect.top >= panelRect.top - 1 &&
          rect.right <= panelRect.right + 1 &&
          rect.bottom <= panelRect.bottom + 1
        );
      };
      return {
        scrollTop: panel.scrollTop,
        rulesInsidePanel: isInside(rules),
        wakeLockInsidePanel: isInside(wakeLock),
      };
    });
    expect(bottomGeometry.scrollTop).toBeGreaterThan(0);
    expect(bottomGeometry.rulesInsidePanel).toBe(true);
    expect(bottomGeometry.wakeLockInsidePanel).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("settings-effective-viewport-bottom-320x568.png") });
    await rulesEntry.click();
    const rulesDialog = page.getByRole("dialog", { name: "四色牌规则" });
    await expect(rulesDialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(rulesDialog).toHaveCount(0);
    await expect(settingsButton).toBeFocused();

    const historyButton = page.getByTestId("game-history");
    await historyButton.click();
    const historyPanel = page.getByTestId("history-panel");
    await expect(historyPanel).toBeVisible();
    await expect(historyPanel).toBeFocused();
    await page.waitForTimeout(200);
    const historyGeometry = await historyPanel.evaluate((panel) => {
      const rect = panel.getBoundingClientRect();
      const copy = Array.from(
        panel.querySelectorAll<HTMLElement>(".history-description, .history-list p, .history-empty small"),
      );
      const entries = Array.from(panel.querySelectorAll<HTMLElement>(".history-list p"));
      const times = Array.from(panel.querySelectorAll<HTMLElement>(".history-list time"));
      return {
        insideViewport:
          rect.left >= -1 &&
          rect.top >= -1 &&
          rect.right <= innerWidth + 1 &&
          rect.bottom <= innerHeight + 1,
        minimumCopyFontSize: Math.min(...copy.map((element) => Number.parseFloat(getComputedStyle(element).fontSize))),
        minimumEntryFontSize: entries.length
          ? Math.min(...entries.map((element) => Number.parseFloat(getComputedStyle(element).fontSize)))
          : null,
        minimumTimeFontSize: times.length
          ? Math.min(...times.map((element) => Number.parseFloat(getComputedStyle(element).fontSize)))
          : null,
      };
    });
    expect(historyGeometry.insideViewport).toBe(true);
    expect(historyGeometry.minimumCopyFontSize).toBeGreaterThanOrEqual(13);
    if (historyGeometry.minimumEntryFontSize !== null) {
      expect(historyGeometry.minimumEntryFontSize).toBeGreaterThanOrEqual(14);
    }
    if (historyGeometry.minimumTimeFontSize !== null) {
      expect(historyGeometry.minimumTimeFontSize).toBeGreaterThanOrEqual(13);
    }
    await page.screenshot({ path: testInfo.outputPath("history-effective-viewport-320x568.png") });
    await page.keyboard.press("Escape");
    await expect(historyPanel).toHaveCount(0);
    await expect(historyButton).toBeFocused();
  });
});

test.describe("compact landscape gameplay", () => {
  test.use({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true });

  test("keeps lobby actions reachable and gameplay controls touch sized", async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await enterLobby(page);

    const lobbyMetrics = await page.getByTestId("lobby-scroll").evaluate((element) => ({
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
    await expect(page.locator(".declare-panel")).toHaveAccessibleDescription(/系统已经按规则选好推荐方案/);
    const handPreview = page.getByTestId("declare-hand-preview");
    await expect(handPreview).toBeVisible();
    await expect(handPreview.locator("[data-card-mode='large']").first()).toBeVisible();
    await expect(handPreview.locator("button")).toHaveCount(0);
    await expect(page.getByTestId("kong-count-0")).toBeVisible();
    await expect(confirmDeclaration.locator("span")).toHaveText(/^(?:无需声明，开始游戏|开始游戏 · 亮鱼 \d+ 组 · 暗坎 \d+ 个)$/);
    await expect(confirmDeclaration).toBeFocused();
    const declarationPanel = page.locator(".declare-panel");
    const firstDeclarationControl = declarationPanel.locator("button:not(:disabled)").first();
    await page.keyboard.press("Tab");
    await expect(firstDeclarationControl).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(confirmDeclaration).toBeFocused();
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

    const selectedFishOptions = page.locator(".fish-option.selected");
    while (await selectedFishOptions.count()) {
      await selectedFishOptions.first().click();
    }
    await page.getByTestId("kong-count-0").click();
    await expect(confirmDeclaration.locator("span")).toHaveText("无需声明，开始游戏");
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
    await expectFiveButtonActionGrid(page);
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
      /(?:[红黄绿白](?:帥|將|仕|士|相|象|俥|車|傌|馬|炮|包|兵|卒)|金条(?:公|侯|伯|子|男))/,
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
    await expect(handScrollPrev).toHaveText("‹ 前翻");
    await expect(handScrollNext).toHaveText("后翻 ›");
    await expect(handScrollPrev).toHaveAttribute("aria-label", "向左翻看手牌");
    await expect(handScrollNext).toHaveAttribute("aria-label", "向右翻看更多手牌");
    await expect(handScrollPrev).toBeDisabled();
    await expect(handScrollNext).toBeEnabled();
    const handScrollButtonSizes = await handScrollTools.locator("button").evaluateAll((buttons) =>
      buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return { width: Math.round(rect.width), height: Math.round(rect.height) };
      }),
    );
    expect(Math.min(...handScrollButtonSizes.map((size) => size.width))).toBeGreaterThanOrEqual(44);
    expect(Math.min(...handScrollButtonSizes.map((size) => size.height))).toBeGreaterThanOrEqual(34);
    const handIdsBeforePaging = await page.locator("[data-testid^='hand-card-']").evaluateAll((cards) =>
      cards.map((card) => (card as HTMLElement).dataset.testid),
    );
    await handScrollNext.click();
    await expect.poll(() => page.locator(".hand").evaluate((hand) => hand.scrollLeft)).toBeGreaterThan(50);
    await expect(handScrollPrev).toBeEnabled();
    for (let attempt = 0; attempt < 6 && await handScrollNext.isEnabled(); attempt += 1) {
      await handScrollNext.click();
      await page.waitForTimeout(360);
    }
    await expect(handScrollNext).toBeDisabled();
    await expect(handScrollPrev).toBeEnabled();
    expect(await page.locator("[data-testid^='hand-card-']").evaluateAll((cards) =>
      cards.map((card) => (card as HTMLElement).dataset.testid),
    )).toEqual(handIdsBeforePaging);
    for (let attempt = 0; attempt < 6 && await handScrollPrev.isEnabled(); attempt += 1) {
      await handScrollPrev.click();
      await page.waitForTimeout(360);
    }
    await expect.poll(() => page.locator(".hand").evaluate((hand) => hand.scrollLeft)).toBeLessThanOrEqual(2);
    await expect(handScrollPrev).toBeDisabled();
    await expect(handScrollNext).toBeEnabled();
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
    const selectedCardLabel = String(await selectedCard.getAttribute("aria-label")).split("，")[0];
    expect(selectedCardTestId).toBeTruthy();
    expect(selectedCardLabel).toMatch(/^(?:[红黄绿白][帥將仕士相象俥車傌馬炮包兵卒]|金条[公侯伯子男])$/);
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
    await expect(page.getByTestId("action-guidance")).toContainText(`已选${selectedCardLabel}，再点按钮确认`);
    await expect(discardConfirm).toHaveText(`打出${selectedCardLabel}`);
    await expect(discardConfirm).toHaveAttribute("aria-label", `打出${selectedCardLabel}`);
    const gameSettings = page.getByTestId("game-settings");
    await expect(gameSettings).toBeDisabled();
    await expect(gameSettings).toHaveText("设置");
    await expect(gameSettings).toHaveAttribute("aria-label", "完成当前操作后可打开设置");
    await expect(gameSettings).toHaveAttribute("title", "完成当前操作后可打开设置");
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
    await page.waitForTimeout(500);
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

  test("shows one clear waiting state instead of disabled actions", async ({ page }, testInfo) => {
    await enterLobby(page, "/?e2eDebug=1");
    await page.getByTestId("lobby-start").click();

    const confirmDeclaration = page.getByTestId("confirm-declaration");
    await expect(confirmDeclaration).toBeEnabled({ timeout: 20_000 });
    await confirmDeclaration.click();
    await expect(page.locator("main.layout")).toHaveClass(/\bplaying\b/, { timeout: 20_000 });
    await expect(page.locator(".deal-overlay")).toHaveCount(0, { timeout: 6_000 });
    await page.setViewportSize({ width: 568, height: 320 });

    const setupScenario = async (scenario: string) => {
      await page.evaluate((nextScenario) => {
        const bridge = (window as Window & {
          __siseLocalTest?: { setupScenario: (scenario: string) => void };
        }).__siseLocalTest;
        if (!bridge) {
          throw new Error("Local test bridge is unavailable");
        }
        bridge.setupScenario(nextScenario);
      }, scenario);
      await expect.poll(() =>
        page.evaluate(() =>
          (window as Window & {
            __siseLocalTest?: { getLastResult: () => { scenario: string; ok: boolean } | null };
          }).__siseLocalTest?.getLastResult() ?? null,
        ),
      ).toMatchObject({ scenario, ok: true });
    };

    await setupScenario("waiting_other_turn");
    await expect.poll(async () => {
      const text = (await page.locator(".discard-tip").textContent()) ?? "";
      return /手牌（3张）/.test(text) && !text.includes("/");
    }).toBe(true);
    const waiting = page.getByTestId("action-waiting");
    await expect(waiting).toBeVisible();
    await expect(waiting).toContainText(/.+正在操作/);
    await expect(waiting).toContainText("轮到你时会提醒");
    await expect(waiting).toHaveAccessibleName(/.+（机器人）正在操作。轮到你时会提醒/);
    await expect(page.locator(".action-dock .btn")).toHaveCount(0);
    await expect(page.getByTestId("action-guidance")).toHaveCount(0);

    const waitingGeometry = await waiting.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const dock = element.closest<HTMLElement>(".action-dock")!.getBoundingClientRect();
      const headline = element.querySelector<HTMLElement>("strong")!;
      const help = element.querySelector<HTMLElement>("small")!;
      return {
        insideDock:
          rect.left >= dock.left && rect.right <= dock.right && rect.top >= dock.top && rect.bottom <= dock.bottom,
        headlineFontSize: Number.parseFloat(getComputedStyle(headline).fontSize),
        helpFontSize: Number.parseFloat(getComputedStyle(help).fontSize),
        tabIndex: element.getAttribute("tabindex"),
        dock: { x: dock.x, y: dock.y, width: dock.width, height: dock.height },
      };
    });
    expect(waitingGeometry.insideDock).toBe(true);
    expect(waitingGeometry.headlineFontSize).toBeGreaterThanOrEqual(15);
    expect(waitingGeometry.helpFontSize).toBeGreaterThanOrEqual(12);
    expect(waitingGeometry.tabIndex).toBeNull();
    await page.screenshot({ path: testInfo.outputPath("legacy-phone-waiting-dock.png") });

    await page.setViewportSize({ width: 320, height: 568 });
    await expect(page.locator("main.layout")).toHaveAttribute("data-rotated-phone-portrait", "true");
    await expect(waiting).toBeVisible();
    const rotatedWaitingGeometry = await waiting.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        insidePhysicalViewport:
          rect.left >= -1 && rect.top >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1,
      };
    });
    expect(rotatedWaitingGeometry.insidePhysicalViewport).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("rotated-phone-waiting-dock.png") });

    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(page.locator("main.layout")).toHaveAttribute("data-rotated-phone-portrait", "false");
    await expect(waiting).toBeVisible();
    await expect(page.locator(".action-dock .btn")).toHaveCount(0);
    const gameSettings = page.getByTestId("game-settings");
    await expect(gameSettings).toBeEnabled();
    const toolPositionsWhileWaiting = await page.locator("[data-testid='game-history'], [data-testid='game-settings'], [data-testid='game-exit']")
      .evaluateAll((buttons) => buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) };
      }));
    const desktopWaitingDock = await page.locator(".action-dock").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
    await page.screenshot({ path: testInfo.outputPath("desktop-waiting-dock.png") });

    await setupScenario("local_draw_pass");
    await expect(waiting).toHaveCount(0);
    await expect(page.getByTestId("action-guidance")).toContainText("该你操作了");
    await expect(page.getByTestId("action-pass")).toBeEnabled();
    await expect(gameSettings).toBeDisabled();
    await expect(gameSettings).toHaveText("设置");
    await expect(gameSettings).toHaveAttribute("aria-label", "完成当前操作后可打开设置");
    const decisionSettingsStyle = await gameSettings.evaluate((button) => {
      const style = getComputedStyle(button);
      return { color: style.color, backgroundColor: style.backgroundColor, borderColor: style.borderColor };
    });
    expect(decisionSettingsStyle).toEqual({
      color: "rgb(148, 163, 184)",
      backgroundColor: "rgba(15, 23, 42, 0.7)",
      borderColor: "rgba(100, 116, 139, 0.42)",
    });
    const toolPositionsDuringDecision = await page.locator("[data-testid='game-history'], [data-testid='game-settings'], [data-testid='game-exit']")
      .evaluateAll((buttons) => buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) };
      }));
    expect(toolPositionsDuringDecision).toEqual(toolPositionsWhileWaiting);
    const decisionDock = await page.locator(".action-dock").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
    expect(decisionDock.x).toBeCloseTo(desktopWaitingDock.x, 0);
    expect(decisionDock.y).toBeCloseTo(desktopWaitingDock.y, 0);
    expect(decisionDock.width).toBeCloseTo(desktopWaitingDock.width, 0);
    expect(decisionDock.height).toBeCloseTo(desktopWaitingDock.height, 0);
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
    const longDeclarationCard = page.getByTestId("declare-hand-preview").locator("[data-card-mode='long']").first();
    await expect(longDeclarationCard).toBeVisible();
    const longDeclarationCardGeometry = await longDeclarationCard.evaluate((card) => ({
      width: (card as HTMLElement).offsetWidth,
      height: (card as HTMLElement).offsetHeight,
      glyphFontSize: Number.parseFloat(
        getComputedStyle(card.querySelector<HTMLElement>(".text-top")!).fontSize,
      ),
    }));
    expect(longDeclarationCardGeometry.width).toBeGreaterThanOrEqual(28);
    expect(longDeclarationCardGeometry.height).toBeGreaterThanOrEqual(52);
    expect(longDeclarationCardGeometry.glyphFontSize).toBeGreaterThanOrEqual(16);
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
    await expect(gameSettings).toHaveText("设置");
    await expect(gameSettings).toHaveAttribute("aria-label", "完成当前操作后可打开设置");
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
    await expect(confirmDeclaration).toBeEnabled({ timeout: 20_000 });
    await expect(confirmDeclaration).toBeFocused();
    await expect(confirmDeclaration.locator("span")).toHaveText(/^(?:无需声明，开始游戏|开始游戏 · 亮鱼 \d+ 组 · 暗坎 \d+ 个)$/);
    await expect(page.locator(".untimed-message")).toHaveText("上下滑调整 · 手牌可前后翻 · 练习不限时");
    const declarationHand = page.getByTestId("declare-hand-preview");
    const declarationHandTools = page.getByTestId("declare-hand-scroll-tools");
    const declarationHandPrev = page.getByTestId("declare-hand-scroll-prev");
    const declarationHandNext = page.getByTestId("declare-hand-scroll-next");
    await expect(declarationHandTools).toBeVisible();
    await expect(declarationHandPrev).toBeDisabled();
    await expect(declarationHandNext).toBeEnabled();
    const declarationHandBefore = await declarationHand.locator(".card").evaluateAll((cards) =>
      cards.map((card) => card.getAttribute("aria-label")),
    );
    const declarationSelectionsBefore = await page.evaluate(() => ({
      fish: document.querySelectorAll(".hand-preview-card.fish").length,
      kong: document.querySelectorAll(".hand-preview-card.kong").length,
      declaredKong: document.querySelector(".kong-choice[aria-checked='true']")?.textContent?.trim() ?? "",
    }));
    const declarationGeometry = await page.locator(".declare-panel").evaluate((panel) => {
      const rect = panel.getBoundingClientRect();
      const hand = panel.querySelector<HTMLElement>("[data-testid='declare-hand-preview']")!;
      const card = hand.querySelector<HTMLElement>(".hand-preview-card .card")!;
      const glyph = card.querySelector<HTMLElement>(".text-top")!;
      const pagerButtons = Array.from(
        panel.querySelectorAll<HTMLButtonElement>("[data-testid='declare-hand-scroll-tools'] button"),
      );
      const primaryLabels = Array.from(
        panel.querySelectorAll<HTMLElement>(".section-heading h3, .fish-option-copy strong, .empty-option strong"),
      );
      const helperLabels = Array.from(
        panel.querySelectorAll<HTMLElement>(".section-result, .fish-option-copy small, .empty-option span, .untimed-message"),
      );
      const cardRect = card.getBoundingClientRect();
      return {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        scrollHeight: panel.scrollHeight,
        clientHeight: panel.clientHeight,
        handClientWidth: hand.clientWidth,
        handScrollWidth: hand.scrollWidth,
        cardWidth: Math.round(cardRect.width),
        cardHeight: Math.round(cardRect.height),
        glyphFontSize: Number.parseFloat(getComputedStyle(glyph).fontSize),
        minimumPagerWidth: Math.min(...pagerButtons.map((button) => button.offsetWidth)),
        minimumPagerHeight: Math.min(...pagerButtons.map((button) => button.offsetHeight)),
        minimumPrimaryLabelFontSize: Math.min(
          ...primaryLabels.map((label) => Number.parseFloat(getComputedStyle(label).fontSize)),
        ),
        minimumHelperLabelFontSize: Math.min(
          ...helperLabels.map((label) => Number.parseFloat(getComputedStyle(label).fontSize)),
        ),
      };
    });
    expect(declarationGeometry.width).toBeLessThanOrEqual(568);
    expect(declarationGeometry.height).toBeLessThanOrEqual(320);
    expect(declarationGeometry.scrollHeight).toBeGreaterThanOrEqual(declarationGeometry.clientHeight);
    expect(declarationGeometry.handScrollWidth).toBeGreaterThan(declarationGeometry.handClientWidth);
    expect(declarationGeometry.cardWidth).toBeGreaterThanOrEqual(40);
    expect(declarationGeometry.cardHeight).toBeGreaterThanOrEqual(44);
    expect(declarationGeometry.glyphFontSize).toBeGreaterThanOrEqual(22);
    expect(declarationGeometry.minimumPagerWidth).toBeGreaterThanOrEqual(44);
    expect(declarationGeometry.minimumPagerHeight).toBeGreaterThanOrEqual(34);
    expect(declarationGeometry.minimumPrimaryLabelFontSize).toBeGreaterThanOrEqual(14);
    expect(declarationGeometry.minimumHelperLabelFontSize).toBeGreaterThanOrEqual(12);

    for (let attempt = 0; attempt < 8 && await declarationHandNext.isEnabled(); attempt += 1) {
      await declarationHandNext.click();
      await page.waitForTimeout(380);
    }
    await expect(declarationHandNext).toBeDisabled();
    await expect(declarationHandPrev).toBeEnabled();
    expect(await declarationHand.locator(".card").evaluateAll((cards) =>
      cards.map((card) => card.getAttribute("aria-label")),
    )).toEqual(declarationHandBefore);
    expect(await page.evaluate(() => ({
      fish: document.querySelectorAll(".hand-preview-card.fish").length,
      kong: document.querySelectorAll(".hand-preview-card.kong").length,
      declaredKong: document.querySelector(".kong-choice[aria-checked='true']")?.textContent?.trim() ?? "",
    }))).toEqual(declarationSelectionsBefore);

    for (let attempt = 0; attempt < 8 && await declarationHandPrev.isEnabled(); attempt += 1) {
      await declarationHandPrev.click();
      await page.waitForTimeout(380);
    }
    await expect(declarationHandPrev).toBeDisabled();
    await expect(declarationHandNext).toBeEnabled();
    expect(await declarationHand.evaluate((hand) => hand.scrollLeft)).toBeLessThanOrEqual(2);
    await page.screenshot({ path: testInfo.outputPath("iphone-5-declaration.png") });
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
    const landscapeTableGeometry = await expectCompactTableContained(page);
    const handScrollTools = page.getByTestId("hand-scroll-tools");
    const handScrollPrev = page.getByTestId("hand-scroll-prev");
    const handScrollNext = page.getByTestId("hand-scroll-next");
    await expect(handScrollTools).toBeVisible();
    await expect(handScrollPrev).toHaveText("‹ 前翻");
    await expect(handScrollNext).toHaveText("后翻 ›");
    const handScrollSizes = await handScrollTools.locator("button").evaluateAll((buttons) =>
      buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return { width: Math.round(rect.width), height: Math.round(rect.height) };
      }),
    );
    expect(Math.min(...handScrollSizes.map((size) => size.width))).toBeGreaterThanOrEqual(44);
    expect(Math.min(...handScrollSizes.map((size) => size.height))).toBeGreaterThanOrEqual(34);
    await page.screenshot({ path: testInfo.outputPath("iphone-5-readable-game.png") });

    await page.setViewportSize({ width: 320, height: 568 });
    const layout = page.locator(".layout");
    await expect(layout).toHaveAttribute("data-effective-viewport", "568x320");
    await expect(layout).toHaveAttribute("data-rotated-phone-portrait", "true");
    await page.waitForTimeout(200);
    const rotatedTableGeometry = await expectCompactTableContained(page);
    expect(Math.abs(rotatedTableGeometry.tableHeight - landscapeTableGeometry.tableHeight)).toBeLessThanOrEqual(1);
    expect(Math.abs(rotatedTableGeometry.selfRowHeight - landscapeTableGeometry.selfRowHeight)).toBeLessThanOrEqual(1);
    const rotatedControls = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll<HTMLElement>(".hand-card"));
      const buttons = Array.from(document.querySelectorAll<HTMLElement>(".action-dock button"))
        .filter((button) => button.offsetWidth > 0 && button.offsetHeight > 0);
      return {
        minimumCardWidth: Math.min(...cards.map((card) => card.offsetWidth)),
        minimumCardHeight: Math.min(...cards.map((card) => card.offsetHeight)),
        minimumGlyphFontSize: Math.min(
          ...cards.map((card) => Number.parseFloat(getComputedStyle(card.querySelector<HTMLElement>(".text-top")!).fontSize)),
        ),
        minimumButtonWidth: Math.min(...buttons.map((button) => button.offsetWidth)),
        minimumButtonHeight: Math.min(...buttons.map((button) => button.offsetHeight)),
      };
    });
    expect(rotatedControls.minimumCardWidth).toBeGreaterThanOrEqual(40);
    expect(rotatedControls.minimumCardHeight).toBeGreaterThanOrEqual(52);
    expect(rotatedControls.minimumGlyphFontSize).toBeGreaterThanOrEqual(22);
    expect(rotatedControls.minimumButtonWidth).toBeGreaterThanOrEqual(40);
    expect(rotatedControls.minimumButtonHeight).toBeGreaterThanOrEqual(40);
    await page.screenshot({ path: testInfo.outputPath("iphone-5-readable-game-rotated.png") });
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

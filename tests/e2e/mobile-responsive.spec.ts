import { expect, test, type Locator, type Page } from "@playwright/test";

async function readVisibleHandRange(locator: Locator): Promise<{ start: number; end: number; total: number }> {
  const text = (await locator.textContent())?.trim() ?? "";
  const match = text.match(/^(\d+)–(\d+) \/ (\d+)$/);
  if (!match) {
    throw new Error(`Unexpected hand range: ${text}`);
  }
  return { start: Number(match[1]), end: Number(match[2]), total: Number(match[3]) };
}

async function enterLobby(page: Page, path = "/"): Promise<void> {
  await page.goto(path);
  await page.getByTestId("random-nickname").click();
  await page.getByTestId("login-submit").click();
  await expect(page.getByText("游戏模式选择")).toBeVisible();
}

async function applyLocalDebugScenario(page: Page, scenario: string): Promise<void> {
  await expect.poll(() =>
    page.evaluate((nextScenario) => {
      const bridge = (window as Window & {
        __siseLocalTest?: {
          setupScenario: (scenario: string) => void;
          getLastResult: () => { scenario: string; ok: boolean } | null;
        };
      }).__siseLocalTest;
      if (!bridge) {
        throw new Error("Local test bridge is unavailable");
      }
      const result = bridge.getLastResult();
      if (result?.scenario !== nextScenario || !result.ok) {
        bridge.setupScenario(nextScenario);
      }
      return result;
    }, scenario),
  ).toMatchObject({ scenario, ok: true });
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
  const counterFontSizes = await page.locator("[data-testid='opponent-hand-count'], [data-testid='bot-identity']")
    .evaluateAll((elements) => elements.map((element) => Number.parseFloat(getComputedStyle(element).fontSize)));
  expect(Math.min(...counterFontSizes)).toBeGreaterThanOrEqual(13);
  await expect(page.getByTestId("dealer-badge")).toHaveCount(1);
  await expect(page.getByTestId("dealer-card")).toHaveCount(1);
  await expect(page.getByText(/抽牌者/)).toHaveCount(0);
  await expect(page.getByText(/^庄家:/)).toHaveCount(0);
  await expect(page.locator(".center-core-cell")).toHaveCount(0);
  await expect(page.locator(".pending-placeholder")).toHaveCount(0);
  const pendingCaption = page.getByTestId("pending-card").locator(".response-caption");
  if (await pendingCaption.count()) {
    expect(await pendingCaption.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)))
      .toBeGreaterThanOrEqual(13);
  }

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
  await expect(header.getByTestId("game-auto-play")).toBeVisible();
  await expect(header.getByTestId("game-auto-play")).toContainText(/托管/);
  await expect(header.getByRole("button", { name: "退出牌局" })).toContainText("退出");
  await expect(header.getByText(/座位ID|房主|已连接|同步中/)).toHaveCount(0);

  const geometry = await page.evaluate(() => {
    const headerElement = document.querySelector<HTMLElement>('[data-testid="game-control-header"]');
    const boardElement = document.querySelector<HTMLElement>('[data-testid="game-board"]');
    const brandElement = headerElement?.querySelector<HTMLElement>(".brand-lockup");
    const toolsElement = headerElement?.querySelector<HTMLElement>("[data-testid='game-tools']");
    const toolButtons = Array.from(headerElement?.querySelectorAll<HTMLElement>(".tool-button") ?? []);
    if (!headerElement || !boardElement || !brandElement || !toolsElement || toolButtons.length !== 4) {
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
      minimumControlFontSize: Math.min(
        ...toolButtons.map((button) => Number.parseFloat(getComputedStyle(button).fontSize)),
      ),
    };
  });
  expect(geometry.boardTop).toBeGreaterThanOrEqual(geometry.headerBottom);
  expect(geometry.brandRight).toBeLessThanOrEqual(geometry.toolsLeft);
  expect(geometry.controlsInsideHeader).toBe(true);
  expect(geometry.minimumControlWidth).toBeGreaterThanOrEqual(40);
  expect(geometry.minimumControlHeight).toBeGreaterThanOrEqual(36);
  expect(geometry.minimumControlFontSize).toBeGreaterThanOrEqual(14);
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

async function expectReadableCompactSeatIdentities(page: Page): Promise<void> {
  const metrics = await page.evaluate(() => {
    const sideSeats = Array.from(document.querySelectorAll<HTMLElement>(".player-left, .player-right"));
    const sideNames = sideSeats.map((seat) => {
      const identity = seat.querySelector<HTMLElement>(".seat-identity")!;
      const name = identity.querySelector<HTMLElement>("strong")!;
      const nameRect = name.getBoundingClientRect();
      const detailRects = Array.from(identity.children)
        .filter((element) => element !== name)
        .map((element) => (element as HTMLElement).getBoundingClientRect())
        .filter((rect) => rect.width > 0 && rect.height > 0);
      return {
        width: nameRect.width,
        horizontalOverflow: seat.scrollWidth - seat.clientWidth,
        detailsBelowName: detailRects.every((rect) => rect.top >= nameRect.bottom - 1),
      };
    });
    const selfName = document.querySelector<HTMLElement>(".self-info-card .seat-identity h3")!;
    const selfBadge = document.querySelector<HTMLElement>(".self-info-card .self-seat-badge")!;
    const selfNameRect = selfName.getBoundingClientRect();
    const selfBadgeRect = selfBadge.getBoundingClientRect();
    return {
      sideNames,
      selfName: selfName.textContent?.trim() ?? "",
      selfNameWidth: selfNameRect.width,
      selfNameOverflow: selfName.scrollWidth - selfName.clientWidth,
      selfBadgeText: selfBadge.textContent?.trim() ?? "",
      selfBadgeWidth: selfBadgeRect.width,
      selfBadgeBelowName: selfBadgeRect.top >= selfNameRect.bottom - 1,
    };
  });

  expect(metrics.sideNames).toHaveLength(2);
  expect(Math.min(...metrics.sideNames.map((name) => name.width))).toBeGreaterThanOrEqual(40);
  expect(Math.max(...metrics.sideNames.map((name) => name.horizontalOverflow))).toBeLessThanOrEqual(1);
  expect(metrics.sideNames.every((name) => name.detailsBelowName)).toBe(true);
  expect(metrics.selfName).not.toContain("（你）");
  expect(metrics.selfNameWidth).toBeGreaterThanOrEqual(48);
  expect(metrics.selfNameOverflow).toBeLessThanOrEqual(1);
  expect(metrics.selfBadgeText).toBe("你");
  expect(metrics.selfBadgeWidth).toBeGreaterThanOrEqual(24);
  expect(metrics.selfBadgeBelowName).toBe(true);
}

async function reachDiscardConfirmation(page: Page): Promise<void> {
  const deadline = Date.now() + 60_000;
  const confirm = page.getByTestId("discard-confirm");

  if (await page.evaluate(() => Boolean((window as Window & { __siseLocalTest?: unknown }).__siseLocalTest))) {
    await applyLocalDebugScenario(page, "chi_local_upper");
    await page.getByTestId("action-chi").click();
    await expect(confirm).toBeVisible();
    return;
  }

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
    const nextRound = page.getByRole("button", { name: /下一局（房主）|再练一局/ });
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

async function expectCompactActionDock(page: Page): Promise<void> {
  const actionMetrics = await page.getByTestId("action-row").evaluate((element) => {
    const buttons = Array.from(element.querySelectorAll<HTMLElement>("button"));
    const sizes = buttons.map((button) => {
      const rect = button.getBoundingClientRect();
      return { width: Math.round(rect.width), height: Math.round(rect.height), y: Math.round(rect.y) };
    });
    return { count: buttons.length, sizes, rows: new Set(sizes.map((size) => size.y)).size };
  });
  expect(actionMetrics.count).toBeGreaterThan(0);
  expect(actionMetrics.rows).toBe(1);
  expect(Math.min(...actionMetrics.sizes.map((size) => size.width))).toBeGreaterThanOrEqual(40);
  expect(Math.min(...actionMetrics.sizes.map((size) => size.height))).toBeGreaterThanOrEqual(40);
}

test.describe("clear first-time entry", () => {
  test.use({ viewport: { width: 568, height: 320 }, hasTouch: true, isMobile: true });

  test("keeps nickname and playable modes obvious on legacy phones", async ({ page }, testInfo) => {
    await page.goto("/");

    const nicknameInput = page.getByTestId("nickname-input");
    const firstNickname = await nicknameInput.inputValue();
    expect(firstNickname.trim().length).toBeGreaterThan(0);
    await expect(page.locator(".entry-desc")).toContainText("不用注册，也不用密码");
    await expect(page.locator(".entry-desc")).toContainText("这台设备会记住昵称");
    await expect(page.getByTestId("login-submit")).toHaveText("下一步：选择玩法");
    await expect(page.getByTestId("open-rules")).toHaveCount(1);
    await expect(page.locator(".entry-actions button")).toHaveCount(2);

    const entryGeometry = await page.evaluate(() => {
      const shell = document.querySelector<HTMLElement>(".entry-shell")!;
      const card = shell.querySelector<HTMLElement>(".entry-card")!;
      const input = shell.querySelector<HTMLInputElement>("[data-testid='nickname-input']")!;
      const kicker = shell.querySelector<HTMLElement>(".entry-kicker")!;
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
        kickerFontSize: Number.parseFloat(getComputedStyle(kicker).fontSize),
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
    expect(entryGeometry.kickerFontSize).toBeGreaterThanOrEqual(13);
    expect(entryGeometry.labelFontSize).toBeGreaterThanOrEqual(15);
    expect(entryGeometry.descriptionFontSize).toBeGreaterThanOrEqual(14);
    expect(entryGeometry.minimumButtonWidth).toBeGreaterThanOrEqual(150);
    expect(entryGeometry.minimumButtonHeight).toBeGreaterThanOrEqual(48);
    expect(entryGeometry.minimumButtonFontSize).toBeGreaterThanOrEqual(16);
    await page.screenshot({ path: testInfo.outputPath("legacy-entry-568x320.png") });

    await page.getByTestId("login-submit").click();
    await expect(page.getByText("游戏模式选择")).toBeVisible();
    const practiceMode = page.getByTestId("mode-practice_bots");
    const quickMatchMode = page.getByTestId("mode-quick_match");
    const friendMode = page.getByTestId("mode-friends");
    await expect(page.locator(".mode-card")).toHaveCount(3);
    await expect(page.locator(".mode-card:disabled")).toHaveCount(0);
    await expect(practiceMode).toHaveAttribute("aria-pressed", "true");
    await expect(quickMatchMode).toHaveAttribute("aria-pressed", "false");
    await expect(friendMode).toHaveAttribute("aria-pressed", "false");
    await expect(practiceMode).toContainText("已选择");
    await expect(quickMatchMode).toContainText("一键开桌");
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
        minimumTopActionFontSize: Math.min(
          ...["change-entry-name", "open-rules"].map((testId) =>
            Number.parseFloat(getComputedStyle(document.querySelector<HTMLElement>(`[data-testid='${testId}']`)!).fontSize),
          ),
        ),
      };
    });
    expect(lobbyGeometry.scrollDoesNotHideModes).toBe(true);
    expect(lobbyGeometry.minimumDescriptionFontSize).toBeGreaterThanOrEqual(14);
    expect(lobbyGeometry.startWidth).toBeGreaterThanOrEqual(180);
    expect(lobbyGeometry.startHeight).toBeGreaterThanOrEqual(48);
    expect(lobbyGeometry.startFontSize).toBeGreaterThanOrEqual(16);
    expect(lobbyGeometry.minimumTopActionFontSize).toBeGreaterThanOrEqual(14);
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
      const layout = document.querySelector<HTMLElement>("main.layout")!;
      const layoutStyle = getComputedStyle(layout);
      const elements = [
        ...document.querySelectorAll<HTMLElement>(".mode-card"),
        document.querySelector<HTMLElement>("[data-testid='lobby-start']")!,
        document.querySelector<HTMLElement>("[data-testid='change-entry-name']")!,
        document.querySelector<HTMLElement>("[data-testid='open-rules']")!,
      ];
      return {
        noPageOverflow: document.body.scrollWidth <= innerWidth && document.body.scrollHeight <= innerHeight,
        physicalViewportWidth: layoutStyle.getPropertyValue("--physical-viewport-width").trim(),
        physicalViewportHeight: layoutStyle.getPropertyValue("--physical-viewport-height").trim(),
        allControlsInPhysicalViewport: elements.every((element) => {
          const rect = element.getBoundingClientRect();
          return rect.left >= -1 && rect.top >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1;
        }),
      };
    });
    expect(portraitGeometry).toEqual({
      noPageOverflow: true,
      physicalViewportWidth: "320px",
      physicalViewportHeight: "568px",
      allControlsInPhysicalViewport: true,
    });
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
      const style = getComputedStyle(element);
      return {
        offsetWidth: (element as HTMLElement).offsetWidth,
        offsetHeight: (element as HTMLElement).offsetHeight,
        rectWidth: Math.round(rect.width),
        rectHeight: Math.round(rect.height),
        transform: style.transform,
        physicalViewportWidth: style.getPropertyValue("--physical-viewport-width").trim(),
        physicalViewportHeight: style.getPropertyValue("--physical-viewport-height").trim(),
      };
    });
    expect(geometry).toMatchObject({
      offsetWidth: 667,
      offsetHeight: 375,
      rectWidth: 375,
      rectHeight: 667,
      physicalViewportWidth: "375px",
      physicalViewportHeight: "667px",
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
      const style = getComputedStyle(element);
      return {
        offsetWidth: (element as HTMLElement).offsetWidth,
        offsetHeight: (element as HTMLElement).offsetHeight,
        rectWidth: Math.round(rect.width),
        rectHeight: Math.round(rect.height),
        physicalViewportWidth: style.getPropertyValue("--physical-viewport-width").trim(),
        physicalViewportHeight: style.getPropertyValue("--physical-viewport-height").trim(),
      };
    });
    expect(geometry).toEqual({
      offsetWidth: 568,
      offsetHeight: 320,
      rectWidth: 320,
      rectHeight: 568,
      physicalViewportWidth: "320px",
      physicalViewportHeight: "568px",
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
    await exitButton.evaluate((button) => button.focus());
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
    const settingsScrollHint = page.getByTestId("settings-scroll-hint");
    await expect(settingsScrollHint).toContainText("下滑查看更多设置");
    await expect(settingsScrollHint).not.toHaveClass(/hidden/);
    await expect(settingsScrollHint).toHaveCSS("opacity", "1");
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
    await expect(settingsScrollHint).toHaveClass(/hidden/);
    await expect(settingsScrollHint).toHaveCSS("opacity", "0");
    await page.screenshot({ path: testInfo.outputPath("settings-effective-viewport-bottom-320x568.png") });
    await rulesEntry.click();
    const rulesDialog = page.getByRole("dialog", { name: "四色牌规则" });
    await expect(rulesDialog).toBeVisible();
    await expect(settingsPanel).toHaveCount(0);
    const rulesGeometry = await rulesDialog.evaluate((panel) => {
      const listItems = Array.from(panel.querySelectorAll<HTMLElement>(".rules-list li"));
      const chips = Array.from(panel.querySelectorAll<HTMLElement>(".rules-chip"));
      const close = panel.querySelector<HTMLButtonElement>("[data-testid='close-rules']")!;
      return {
        columns: getComputedStyle(panel).gridTemplateColumns.split(" ").length,
        noHorizontalOverflow: panel.scrollWidth <= panel.clientWidth + 1,
        hasVerticalOverflow: panel.scrollHeight > panel.clientHeight,
        minimumBodyFontSize: Math.min(...listItems.map((item) => Number.parseFloat(getComputedStyle(item).fontSize))),
        minimumChipFontSize: Math.min(...chips.map((chip) => Number.parseFloat(getComputedStyle(chip).fontSize))),
        closeWidth: close.offsetWidth,
        closeHeight: close.offsetHeight,
      };
    });
    expect(rulesGeometry).toMatchObject({
      columns: 1,
      noHorizontalOverflow: true,
      hasVerticalOverflow: true,
    });
    expect(rulesGeometry.minimumBodyFontSize).toBeGreaterThanOrEqual(15);
    expect(rulesGeometry.minimumChipFontSize).toBeGreaterThanOrEqual(14);
    expect(rulesGeometry.closeWidth).toBeGreaterThanOrEqual(42);
    expect(rulesGeometry.closeHeight).toBeGreaterThanOrEqual(42);
    await page.screenshot({ path: testInfo.outputPath("rules-effective-viewport-320x568.png") });
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
    await expectReadableCompactSeatIdentities(page);
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
    await reachDiscardConfirmation(page);
    await expect(page.locator(".deal-overlay")).toHaveCount(0, { timeout: 6_000 });
    const fixedDeckPosition = await page.getByTestId("deck-stack").boundingBox();
    expect(fixedDeckPosition).not.toBeNull();
    await expectCompactActionDock(page);
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
    const actionRowMetrics = await page.getByTestId("action-row").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const dock = element.closest<HTMLElement>(".action-dock")!.getBoundingClientRect();
      return {
        top: rect.top,
        bottom: rect.bottom,
        dockTop: dock.top,
        dockBottom: dock.bottom,
      };
    });
    expect(actionRowMetrics.top).toBeGreaterThanOrEqual(actionRowMetrics.dockTop);
    expect(actionRowMetrics.bottom).toBeLessThanOrEqual(actionRowMetrics.dockBottom);
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
    const handVisibleRange = page.getByTestId("hand-visible-range");
    await expect(handScrollPrev).toHaveText("‹ 前翻");
    await expect(handScrollNext).toHaveText("后翻 ›");
    await expect(handScrollPrev).toHaveAttribute("aria-label", "向左翻看手牌");
    await expect(handScrollNext).toHaveAttribute("aria-label", "向右翻看更多手牌");
    await expect(handScrollPrev).toBeDisabled();
    await expect(handScrollNext).toBeEnabled();
    const initialHandRange = await readVisibleHandRange(handVisibleRange);
    expect(initialHandRange.start).toBe(1);
    expect(initialHandRange.end).toBeGreaterThanOrEqual(9);
    expect(initialHandRange.total).toBe(handMetrics.cardCount);
    await expect(handVisibleRange).toHaveAttribute(
      "aria-label",
      `当前显示第 ${initialHandRange.start} 到 ${initialHandRange.end} 张，共 ${initialHandRange.total} 张`,
    );
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
    await expect.poll(async () => (await readVisibleHandRange(handVisibleRange)).start).toBeGreaterThan(1);
    for (let attempt = 0; attempt < 6 && await handScrollNext.isEnabled(); attempt += 1) {
      await handScrollNext.click();
      await page.waitForTimeout(360);
    }
    await expect(handScrollNext).toBeDisabled();
    await expect(handScrollPrev).toBeEnabled();
    const finalHandRange = await readVisibleHandRange(handVisibleRange);
    expect(finalHandRange.end).toBe(finalHandRange.total);
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
    expect((await readVisibleHandRange(handVisibleRange)).start).toBe(1);
    await expect(page.locator(".hand .card[role='img']").first()).toHaveAttribute("aria-label", /^(黄|红|绿|白|金条).+/);
    const handColorSeals = page.locator(".hand .card .color-seal");
    await expect(handColorSeals.first()).toBeVisible();
    const handColorSealTexts = await handColorSeals.allTextContents();
    expect(handColorSealTexts).toHaveLength(handMetrics.cardCount);
    expect(handColorSealTexts.every((text) => /^[黄红绿白金]$/.test(text.trim()))).toBe(true);
    const colorSealGeometry = await page.locator(".hand .card").first().evaluate((card) => {
      const seal = card.querySelector<HTMLElement>(".color-seal")!;
      const glyph = card.querySelector<HTMLElement>(".text-top")!;
      const sealRect = seal.getBoundingClientRect();
      const glyphRange = document.createRange();
      glyphRange.selectNodeContents(glyph);
      const glyphRect = glyphRange.getBoundingClientRect();
      const overlapWidth = Math.max(0, Math.min(sealRect.right, glyphRect.right) - Math.max(sealRect.left, glyphRect.left));
      const overlapHeight = Math.max(0, Math.min(sealRect.bottom, glyphRect.bottom) - Math.max(sealRect.top, glyphRect.top));
      return {
        sealText: seal.textContent?.trim() ?? "",
        sealFontSize: Number.parseFloat(getComputedStyle(seal).fontSize),
        overlapArea: overlapWidth * overlapHeight,
      };
    });
    expect(colorSealGeometry.sealText).toMatch(/^[黄红绿白金]$/);
    expect(colorSealGeometry.sealFontSize).toBeGreaterThanOrEqual(10);
    expect(colorSealGeometry.overlapArea).toBeLessThanOrEqual(1);
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
    await expect(discardConfirm).toHaveText("出");
    const handBeforeSelection = await page.locator("[data-testid^='hand-card-']").evaluateAll((cards) =>
      cards.map((card) => (card as HTMLElement).dataset.testid),
    );
    await selectedCard.click();
    await selectedCard.dblclick();
    await expect(selectedCard).toHaveAttribute("aria-pressed", "true");
    await expect(selectedCard).toHaveAttribute("aria-label", /已预选出牌$/);
    await expect(selectedCard.locator(".discard-selection-badge")).toHaveText("✓");
    expect(await page.locator("[data-testid^='hand-card-']").evaluateAll((cards) =>
      cards.map((card) => (card as HTMLElement).dataset.testid),
    )).toEqual(handBeforeSelection);
    await expect(discardConfirm).toBeEnabled();
    await expect(page.getByTestId("action-guidance")).toContainText("可先选择手牌，再按出");
    await expect(discardConfirm).toHaveText("出");
    await expect(discardConfirm).toHaveAttribute("aria-label", "出牌");
    const gameSettings = page.getByTestId("game-settings");
    await expect(gameSettings).toBeEnabled();
    await expect(gameSettings).toHaveText("设置");
    await expect(gameSettings).toHaveAttribute("aria-label", "牌局设置，当前轮到你操作");
    await expect(gameSettings).toHaveAttribute("title", "牌局设置");
    await gameSettings.click();
    await expect(page.getByTestId("settings-decision-reminder")).toContainText("练习局不限时");
    await expect(selectedCard).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("settings-return-to-decision").click();
    await expect(selectedCard).toBeFocused();
    await expect(selectedCard).toHaveAttribute("aria-pressed", "true");
    await page.screenshot({ path: testInfo.outputPath("iphone-se-selected-card.png") });
    const discardButtonRect = await discardConfirm.evaluate((button) => {
      const rect = button.getBoundingClientRect();
      return { height: Math.round(rect.height), right: Math.round(rect.right), bottom: Math.round(rect.bottom) };
    });
    expect(discardButtonRect.height).toBeGreaterThanOrEqual(36);
    expect(discardButtonRect.height).toBeLessThanOrEqual(48);
    expect(discardButtonRect.right).toBeLessThanOrEqual(667);
    expect(discardButtonRect.bottom).toBeLessThanOrEqual(375);
    const handCountBeforeDiscard = await page.locator("[data-testid^='hand-card-']").count();
    const actionFeedback = page.getByTestId("action-feedback");
    await page.evaluate(() => {
      const key = "sise_test_discard_feedback_seen";
      sessionStorage.setItem(key, "0");
      const capture = () => {
        const feedback = document.querySelector<HTMLElement>("[data-testid='action-feedback']");
        if (feedback && /^(pending|received)$/.test(feedback.dataset.status ?? "")) {
          sessionStorage.setItem(key, "1");
        }
      };
      const observer = new MutationObserver(capture);
      observer.observe(document.body, { attributes: true, childList: true, subtree: true });
      capture();
      window.setTimeout(() => observer.disconnect(), 2_000);
    });
    await discardConfirm.evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem("sise_test_discard_feedback_seen"))).toBe("1");
    await expect(page.getByTestId(selectedCardTestId!)).toHaveCount(0);
    await expect(page.locator("[data-testid^='hand-card-']")).toHaveCount(handCountBeforeDiscard - 1);
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
    await expect(actionFeedback).toHaveCount(0);
    await expect(page.getByTestId("discard-confirm")).toHaveCount(0);
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
    expect(waitingHandState.labels.some((label) => label.endsWith("可预选出牌"))).toBe(true);
    expect(waitingHandState.labels.every((label) =>
      label.endsWith("可预选出牌") || label.endsWith("当前无需选牌"),
    )).toBe(true);
    const visibleFlows = page.locator(".flow-card");
    await expect(visibleFlows).toHaveCount(4);
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
    expect(flowMetrics.some((flow) => flow.cardCount > 0)).toBe(true);
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

  test("keeps the self dealer card visible and reveals it before the dealer mark lands", async ({ page }, testInfo) => {
    await page.goto("/?e2eDebug=1");
    await page.getByTestId("nickname-input").fill("风棋童与老牌友");
    await page.getByTestId("login-submit").click();
    await expect(page.getByText("游戏模式选择")).toBeVisible();
    await page.getByTestId("lobby-start").click();

    const confirmDeclaration = page.getByTestId("confirm-declaration");
    await expect(confirmDeclaration).toBeEnabled({ timeout: 20_000 });
    await confirmDeclaration.click();
    await expect(page.locator("main.layout")).toHaveClass(/\bplaying\b/, { timeout: 20_000 });
    await expect(page.locator(".deal-overlay")).toHaveCount(0, { timeout: 6_000 });
    await page.setViewportSize({ width: 568, height: 320 });

    await applyLocalDebugScenario(page, "dealer_pick_intro");
    const ceremony = page.getByTestId("dealer-ceremony");
    await expect(page.getByRole("dialog", { name: "声明亮鱼与暗坎" })).toHaveCount(0);
    await expect(ceremony).toBeVisible();
    await expect(ceremony).toHaveAccessibleName("正在翻定庄牌");
    await expect(page.getByTestId("dealer-reveal-back")).toHaveAttribute("data-card-back", "red-four-color");
    await expect(page.getByTestId("dealer-reveal-card")).toHaveCount(0);
    await expect(page.getByTestId("dealer-badge")).toHaveCount(0);
    await expect(page.getByTestId("dealer-card")).toHaveCount(0);
    const backGeometry = await page.getByTestId("dealer-reveal-back").evaluate((back) => {
      const rect = back.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
        radius: getComputedStyle(back).borderRadius,
        background: getComputedStyle(back).backgroundColor,
      };
    });
    expect(backGeometry.height / backGeometry.width).toBeGreaterThanOrEqual(2);
    expect(backGeometry.radius).toBe("999px");
    expect(backGeometry.background).toBe("rgb(220, 38, 38)");
    await page.waitForTimeout(350);
    await page.screenshot({ path: testInfo.outputPath("dealer-pick-back-568x320.png") });

    await applyLocalDebugScenario(page, "dealer_reveal_self");
    await expect(ceremony).toBeVisible();
    await expect(ceremony).toHaveAccessibleName(/定庄牌为红相，.+坐庄/);
    await expect(page.getByTestId("dealer-reveal-back")).toHaveCount(0);
    await expect(page.getByTestId("dealer-reveal-card").getByRole("img", { name: "红相" })).toBeVisible();
    await expect(ceremony).toContainText("红相");
    await expect(ceremony).toContainText(/.+坐庄/);
    await expect(page.getByTestId("dealer-badge")).toHaveCount(0);
    await page.waitForTimeout(650);
    await page.screenshot({ path: testInfo.outputPath("dealer-card-revealed-568x320.png") });

    await applyLocalDebugScenario(page, "dealer_settled_self");
    await expect(ceremony).toHaveCount(0);
    const selfSeat = page.getByTestId("player-self");
    const selfDealer = selfSeat.getByTestId("self-dealer-lockup");
    await expect(selfDealer).toBeVisible();
    await expect(selfDealer.getByTestId("dealer-badge")).toHaveText("庄");
    await expect(selfDealer.getByTestId("dealer-card").getByRole("img", { name: "红相" })).toBeVisible();
    await expect(page.locator(".player-card [data-testid='dealer-card']")).toHaveCount(0);

    const expectSelfDealerContained = async () => {
      const geometry = await page.evaluate(() => {
        const seat = document.querySelector<HTMLElement>("[data-testid='player-self']")!.getBoundingClientRect();
        const lockup = document.querySelector<HTMLElement>("[data-testid='self-dealer-lockup']")!.getBoundingClientRect();
        const card = document.querySelector<HTMLElement>("[data-testid='self-dealer-lockup'] [data-testid='dealer-card']")!.getBoundingClientRect();
        const identityElement = document.querySelector<HTMLElement>("[data-testid='player-self'] .seat-identity")!;
        const identity = identityElement.getBoundingClientRect();
        const identityStyle = getComputedStyle(identityElement);
        return {
          contained:
            lockup.left >= seat.left - 0.5 &&
            lockup.right <= seat.right + 0.5 &&
            lockup.top >= seat.top - 0.5 &&
            lockup.bottom <= seat.bottom + 0.5 &&
            card.left >= seat.left - 0.5 &&
            card.right <= seat.right + 0.5 &&
            card.top >= seat.top - 0.5 &&
            card.bottom <= seat.bottom + 0.5,
          cardWidth: card.width,
          cardHeight: card.height,
          seat: { left: seat.left, top: seat.top, right: seat.right, bottom: seat.bottom },
          identity: { left: identity.left, top: identity.top, right: identity.right, bottom: identity.bottom },
          identityStyle: {
            display: identityStyle.display,
            width: identityStyle.width,
            gridTemplateColumns: identityStyle.gridTemplateColumns,
            overflow: identityStyle.overflow,
          },
          lockup: { left: lockup.left, top: lockup.top, right: lockup.right, bottom: lockup.bottom },
          card: { left: card.left, top: card.top, right: card.right, bottom: card.bottom },
        };
      });
      expect(geometry.contained, `dealer lockup must remain inside the self seat: ${JSON.stringify(geometry)}`).toBe(true);
      // Portrait phones rotate the fixed landscape canvas, so viewport-space
      // width and height swap. Assert the visible short/long edges instead.
      expect(Math.min(geometry.cardWidth, geometry.cardHeight)).toBeGreaterThanOrEqual(16);
      expect(Math.max(geometry.cardWidth, geometry.cardHeight)).toBeGreaterThanOrEqual(24);
    };

    await expectSelfDealerContained();
    await page.screenshot({ path: testInfo.outputPath("self-dealer-card-568x320.png") });

    await page.setViewportSize({ width: 320, height: 568 });
    await expect(page.locator("main.layout")).toHaveAttribute("data-rotated-phone-portrait", "true");
    await expectSelfDealerContained();

    await page.setViewportSize({ width: 667, height: 375 });
    await expectSelfDealerContained();

    await page.setViewportSize({ width: 1280, height: 720 });
    await expectSelfDealerContained();

    await page.emulateMedia({ reducedMotion: "reduce" });
    await applyLocalDebugScenario(page, "dealer_pick_intro");
    await expect(ceremony).toBeVisible();
    await expect.poll(() => page.getByTestId("dealer-reveal-back").evaluate((back) => getComputedStyle(back).animationName))
      .toBe("none");
    await applyLocalDebugScenario(page, "dealer_reveal_self");
    await expect.poll(() => page.getByTestId("dealer-reveal-card").evaluate((card) => getComputedStyle(card).animationName))
      .toBe("none");
  });

  test("lets a human hand control to a bot and take it back", async ({ page }, testInfo) => {
    await enterLobby(page);
    await page.getByTestId("lobby-start").click();

    const confirmDeclaration = page.getByTestId("confirm-declaration");
    await expect(confirmDeclaration).toBeEnabled({ timeout: 20_000 });
    await confirmDeclaration.click();
    await expect(page.locator("main.layout")).toHaveClass(/\bplaying\b/, { timeout: 20_000 });
    await page.setViewportSize({ width: 568, height: 320 });

    const autoPlay = page.getByTestId("game-auto-play");
    await expect(autoPlay).toHaveAttribute("aria-pressed", "false");
    await expect(autoPlay).toContainText("托管");
    await autoPlay.click();

    const dialog = page.getByRole("dialog", { name: "让机器人替你操作？" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("你可以随时拿回操作");
    await expect(page.getByTestId("cancel-auto-play")).toBeFocused();
    await autoPlay.evaluate((button) => button.focus());
    await expect(page.getByTestId("cancel-auto-play")).toBeFocused();
    await page.getByTestId("confirm-auto-play").click();

    await expect(dialog).toHaveCount(0);
    await expect(autoPlay).toHaveAttribute("aria-pressed", "true");
    await expect(autoPlay).toContainText("取消托管");
    await expect(page.getByTestId("player-self").locator(".tag.status")).toContainText(/机器人代打|托管中/);
    await expect(page.getByTestId("player-self")).toHaveAccessibleName(/机器人代打|托管中/);
    await expect(page.locator("[data-testid^='hand-card-']:enabled")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("voluntary-auto-play-568x320.png") });

    await autoPlay.click();
    await expect(autoPlay).toHaveAttribute("aria-pressed", "false");
    await expect(autoPlay).toHaveText("托管");
    await expect(page.getByTestId("player-self").locator(".tag.status")).toContainText("真人在线");
  });

  test("keeps exposed cards readable and opponent groups folded in every mode", async ({ page }, testInfo) => {
    await page.addInitScript(() => {
      localStorage.setItem("sise_game_display_preferences_v2", JSON.stringify({
        ownCards: "adaptive",
        tableCards: "long",
        seatDirection: "counterclockwise",
        turnAlert: "off",
        keepScreenAwake: false,
      }));
    });
    await enterLobby(page, "/?e2eDebug=1");
    await page.getByTestId("lobby-start").click();
    const confirmDeclaration = page.getByTestId("confirm-declaration");
    await expect(confirmDeclaration).toBeEnabled({ timeout: 20_000 });
    await confirmDeclaration.click();
    await expect(page.locator("main.layout")).toHaveClass(/\bplaying\b/, { timeout: 20_000 });
    await expect(page.locator(".deal-overlay")).toHaveCount(0, { timeout: 6_000 });
    await expect(page.locator(".fx-card")).toHaveCount(0, { timeout: 6_000 });

    await page.setViewportSize({ width: 667, height: 375 });
    await applyLocalDebugScenario(page, "readable_exposed_groups");
    const strip = page.locator(".self-groups-card .mini-card-strip.mode-long").first();
    const cards = strip.locator(".mini-card.mode-long");
    await expect(strip).toBeVisible();
    await expect(cards).toHaveCount(3);
    await expect(strip.locator(".response-card")).toHaveCount(1);
    await expect(strip.locator(".star")).toHaveCount(0);

    const compactGeometry = await cards.evaluateAll((items) => items.map((item) => {
      const rect = item.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        fontSize: Number.parseFloat(getComputedStyle(item).fontSize),
      };
    }));
    expect(compactGeometry[0].width).toBeGreaterThanOrEqual(19);
    expect(compactGeometry[0].height).toBeGreaterThanOrEqual(37);
    expect(compactGeometry[0].fontSize).toBeGreaterThanOrEqual(11);
    expect(compactGeometry[1].left).toBeLessThan(compactGeometry[0].right);
    expect(compactGeometry[1].left).toBeGreaterThan(compactGeometry[0].left);
    expect(compactGeometry[1].top).toBeGreaterThan(compactGeometry[0].top);
    await page.screenshot({ path: testInfo.outputPath("long-exposed-cards-667x375.png") });

    await page.setViewportSize({ width: 1280, height: 720 });
    const desktopCard = cards.first();
    const desktopGeometry = await desktopCard.evaluate((item) => {
      const rect = item.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
        fontSize: Number.parseFloat(getComputedStyle(item).fontSize),
      };
    });
    expect(desktopGeometry.width).toBeGreaterThanOrEqual(21);
    expect(desktopGeometry.height).toBeGreaterThanOrEqual(44);
    expect(desktopGeometry.fontSize).toBeGreaterThanOrEqual(12);
    await page.screenshot({ path: testInfo.outputPath("long-exposed-cards-1280x720.png") });

    await page.setViewportSize({ width: 667, height: 375 });
    await page.getByTestId("game-settings").click();
    await page.getByTestId("card-mode-table-large").click();
    await page.getByRole("button", { name: "关闭设置" }).click();
    await expect(page.getByTestId("settings-panel")).toHaveCount(0);

    const opponentStrip = page.getByTestId("player-top").locator(".mini-card-strip.stacked").first();
    const opponentCards = opponentStrip.locator(".mini-card.mode-large");
    await expect(opponentCards).toHaveCount(3);
    const largeGeometry = await opponentCards.evaluateAll((items) => items.map((item) => {
      const rect = item.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width };
    }));
    expect(largeGeometry[1].left).toBeLessThan(largeGeometry[0].right);
    expect(largeGeometry[0].right - largeGeometry[1].left).toBeLessThan(largeGeometry[0].width * 0.45);
    await page.screenshot({ path: testInfo.outputPath("large-folded-opponent-group-667x375.png") });
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

    await applyLocalDebugScenario(page, "waiting_other_turn");
    await expect.poll(async () => {
      const text = (await page.locator(".discard-tip").textContent()) ?? "";
      return /手牌（3张）/.test(text) && !text.includes("/");
    }).toBe(true);
    const waiting = page.getByTestId("action-waiting");
    await expect(waiting).toHaveCount(0);
    await expect(page.locator(".action-dock .btn")).toHaveCount(0);
    await expect(page.getByTestId("action-guidance")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("legacy-phone-waiting-dock.png") });

    await page.setViewportSize({ width: 320, height: 568 });
    await expect(page.locator("main.layout")).toHaveAttribute("data-rotated-phone-portrait", "true");
    await expect(waiting).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("rotated-phone-waiting-dock.png") });

    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(page.locator("main.layout")).toHaveAttribute("data-rotated-phone-portrait", "false");
    await expect(waiting).toHaveCount(0);
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

    await applyLocalDebugScenario(page, "local_draw_pass");
    await expect(waiting).toHaveCount(0);
    await expect(page.getByTestId("action-guidance")).toContainText("该你操作了");
    await expect(page.getByTestId("action-pass")).toBeEnabled();
    await expect(gameSettings).toBeEnabled();
    await expect(gameSettings).toHaveText("设置");
    await expect(gameSettings).toHaveAttribute("aria-label", "牌局设置，当前轮到你操作");
    await gameSettings.click();
    await expect(page.getByTestId("settings-decision-reminder")).toContainText("轮到你操作");
    await expect(page.getByTestId("settings-decision-reminder")).toContainText("练习局不限时");
    await page.getByTestId("settings-return-to-decision").click();
    await expect(page.getByTestId("settings-panel")).toHaveCount(0);
    await expect(page.locator(".hand-card.playable:focus, .action-dock .btn:not(:disabled):focus")).toHaveCount(1);
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

  test("keeps settings and rules available while a turn needs attention", async ({ page }, testInfo) => {
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
    await enterLobby(page, "/?e2eDebug=1");
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
    await expect(gameSettings).toBeEnabled({ timeout: 30_000 });
    await expect(rulesDialog).toBeVisible();
    await expect(page.getByTestId("rules-decision-reminder")).toContainText("轮到你操作");
    await expect(page.getByTestId("rules-decision-reminder")).toContainText("练习局不限时");
    await expect(gameSettings).toHaveText("设置");
    await expect(gameSettings).toHaveAttribute("aria-label", "牌局设置，当前轮到你操作");
    await page.getByTestId("rules-return-to-decision").click();
    await expect(rulesDialog).toHaveCount(0);
    await expect(page.locator(".hand-card.playable:focus, .action-dock .btn:not(:disabled):focus")).toHaveCount(1);
    await expect(page.locator(".hand [data-card-mode='long']").first()).toBeVisible();

    await applyLocalDebugScenario(page, "chi_local_upper");
    await page.getByTestId("action-chi").click();
    await expect(page.getByTestId("discard-confirm")).toBeVisible();
    const selectedCard = page.locator(".hand-card.playable:not(:disabled)").first();
    await expect(selectedCard).toBeVisible();
    await selectedCard.click();
    await expect(selectedCard).toHaveAttribute("aria-pressed", "true");
    await gameSettings.click();
    await expect(settingsPanel).toBeVisible();
    await page.getByTestId("card-mode-own-large").click();
    await expect(selectedCard).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("settings-return-to-decision").click();
    await expect(selectedCard).toBeFocused();
    await expect(selectedCard).toHaveAttribute("aria-pressed", "true");
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
    const declarationHandRange = page.getByTestId("declare-hand-visible-range");
    await expect(declarationHandTools).toBeVisible();
    await expect(declarationHandPrev).toBeDisabled();
    await expect(declarationHandNext).toBeEnabled();
    const initialDeclarationRange = await readVisibleHandRange(declarationHandRange);
    expect(initialDeclarationRange.start).toBe(1);
    expect(initialDeclarationRange.end).toBeLessThan(initialDeclarationRange.total);
    await expect(declarationHandRange).toHaveAttribute(
      "aria-label",
      `当前显示第 ${initialDeclarationRange.start} 到 ${initialDeclarationRange.end} 张，共 ${initialDeclarationRange.total} 张`,
    );
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
        panel.querySelectorAll<HTMLElement>(".section-result, .hand-total, .declare-timer span, .fish-option-copy small, .empty-option span, .kong-choice span, .untimed-message"),
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
        minimumPagerFontSize: Math.min(
          ...pagerButtons.map((button) => Number.parseFloat(getComputedStyle(button).fontSize)),
        ),
        rangeFontSize: Number.parseFloat(getComputedStyle(
          panel.querySelector<HTMLElement>("[data-testid='declare-hand-visible-range']")!,
        ).fontSize),
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
    expect(declarationGeometry.minimumPagerHeight).toBeGreaterThanOrEqual(36);
    expect(declarationGeometry.minimumPagerFontSize).toBeGreaterThanOrEqual(13);
    expect(declarationGeometry.rangeFontSize).toBeGreaterThanOrEqual(13);
    expect(declarationGeometry.minimumPrimaryLabelFontSize).toBeGreaterThanOrEqual(14);
    expect(declarationGeometry.minimumHelperLabelFontSize).toBeGreaterThanOrEqual(13);

    for (let attempt = 0; attempt < 8 && await declarationHandNext.isEnabled(); attempt += 1) {
      await declarationHandNext.click();
      await page.waitForTimeout(380);
    }
    await expect(declarationHandNext).toBeDisabled();
    await expect(declarationHandPrev).toBeEnabled();
    const finalDeclarationRange = await readVisibleHandRange(declarationHandRange);
    expect(finalDeclarationRange.end).toBe(finalDeclarationRange.total);
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
    expect((await readVisibleHandRange(declarationHandRange)).start).toBe(1);
    await page.screenshot({ path: testInfo.outputPath("iphone-5-declaration.png") });
    await confirmDeclaration.click();

    await expect(page.getByTestId("game-board")).toBeVisible({ timeout: 20_000 });
    await expectDedicatedGameHeader(page);
    await expect(page.getByTestId("bot-identity")).toHaveCount(3);
    await reachDiscardConfirmation(page);
    await expect(page.locator(".deal-overlay")).toHaveCount(0, { timeout: 6_000 });
    await expectReadableCompactSeatIdentities(page);

    const metrics = await page.evaluate(() => {
      const header = document.querySelector<HTMLElement>("[data-testid='game-control-header']")!;
      const board = document.querySelector<HTMLElement>("[data-testid='game-board']")!;
      const self = document.querySelector<HTMLElement>(".self-info-card")!;
      const hand = document.querySelector<HTMLElement>(".hand")!;
      const dock = document.querySelector<HTMLElement>(".action-dock")!;
      const opponentCounts = Array.from(document.querySelectorAll<HTMLElement>("[data-testid='opponent-hand-count']"));
      const botIdentities = Array.from(document.querySelectorAll<HTMLElement>("[data-testid='bot-identity']"));
      const handCount = document.querySelector<HTMLElement>(".discard-tip")!;
      const handRange = document.querySelector<HTMLElement>("[data-testid='hand-visible-range']")!;
      const essentialTurnSignals = Array.from(document.querySelectorAll<HTMLElement>(
        ".tag.turn, .response-caption, .center-seat-action, .flow-card p, [data-testid='self-seat-meta'], .dealer-badge, .self-seat-badge, .history-count, .action-dock .instruction, .action-dock .untimed-label",
      ));
      const deckUnit = document.querySelector<HTMLElement>(".deck-number small")!;
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
        minimumOpponentCountFontSize: Math.min(
          ...opponentCounts.map((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
        ),
        minimumBotIdentityFontSize: Math.min(
          ...botIdentities.map((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
        ),
        handCountFontSize: Number.parseFloat(getComputedStyle(handCount).fontSize),
        handRangeFontSize: Number.parseFloat(getComputedStyle(handRange).fontSize),
        essentialTurnSignalCount: essentialTurnSignals.length,
        minimumEssentialTurnSignalFontSize: Math.min(
          ...essentialTurnSignals.map((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
        ),
        deckUnitFontSize: Number.parseFloat(getComputedStyle(deckUnit).fontSize),
        deckUnitClipped: deckUnit.scrollWidth > deckUnit.clientWidth + 1
          || deckUnit.scrollHeight > deckUnit.clientHeight + 1,
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
    expect(metrics.minimumOpponentCountFontSize).toBeGreaterThanOrEqual(13);
    expect(metrics.minimumBotIdentityFontSize).toBeGreaterThanOrEqual(13);
    expect(metrics.handCountFontSize).toBeGreaterThanOrEqual(13);
    expect(metrics.handRangeFontSize).toBeGreaterThanOrEqual(13);
    // The exact phase decides whether the pending caption or a directional
    // action badge is mounted; current turn, dealer, self and history remain.
    expect(metrics.essentialTurnSignalCount).toBeGreaterThanOrEqual(4);
    expect(metrics.minimumEssentialTurnSignalFontSize).toBeGreaterThanOrEqual(13);
    expect(metrics.deckUnitFontSize).toBeGreaterThanOrEqual(10);
    expect(metrics.deckUnitClipped).toBe(false);
    const landscapeTableGeometry = await expectCompactTableContained(page);
    const handScrollTools = page.getByTestId("hand-scroll-tools");
    const handScrollPrev = page.getByTestId("hand-scroll-prev");
    const handScrollNext = page.getByTestId("hand-scroll-next");
    const handVisibleRange = page.getByTestId("hand-visible-range");
    await expect(handScrollTools).toBeVisible();
    await expect(handScrollPrev).toHaveText("‹ 前翻");
    await expect(handScrollNext).toHaveText("后翻 ›");
    const legacyInitialRange = await readVisibleHandRange(handVisibleRange);
    expect(legacyInitialRange.start).toBe(1);
    expect(legacyInitialRange.end).toBeLessThan(legacyInitialRange.total);
    const handScrollSizes = await handScrollTools.locator("button").evaluateAll((buttons) =>
      buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          fontSize: Number.parseFloat(getComputedStyle(button).fontSize),
        };
      }),
    );
    expect(Math.min(...handScrollSizes.map((size) => size.width))).toBeGreaterThanOrEqual(44);
    expect(Math.min(...handScrollSizes.map((size) => size.height))).toBeGreaterThanOrEqual(36);
    expect(Math.min(...handScrollSizes.map((size) => size.fontSize))).toBeGreaterThanOrEqual(13);
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
        minimumCounterFontSize: Math.min(
          ...Array.from(
            document.querySelectorAll<HTMLElement>("[data-testid='opponent-hand-count'], [data-testid='bot-identity']"),
          ).map((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
        ),
        handCountFontSize: Number.parseFloat(getComputedStyle(document.querySelector<HTMLElement>(".discard-tip")!).fontSize),
        handRangeFontSize: Number.parseFloat(getComputedStyle(
          document.querySelector<HTMLElement>("[data-testid='hand-visible-range']")!,
        ).fontSize),
      };
    });
    expect(rotatedControls.minimumCardWidth).toBeGreaterThanOrEqual(40);
    expect(rotatedControls.minimumCardHeight).toBeGreaterThanOrEqual(52);
    expect(rotatedControls.minimumGlyphFontSize).toBeGreaterThanOrEqual(22);
    expect(rotatedControls.minimumButtonWidth).toBeGreaterThanOrEqual(40);
    expect(rotatedControls.minimumButtonHeight).toBeGreaterThanOrEqual(40);
    expect(rotatedControls.minimumCounterFontSize).toBeGreaterThanOrEqual(13);
    expect(rotatedControls.handCountFontSize).toBeGreaterThanOrEqual(13);
    expect(rotatedControls.handRangeFontSize).toBeGreaterThanOrEqual(13);
    const rotatedHandRange = await readVisibleHandRange(handVisibleRange);
    expect(rotatedHandRange.start).toBe(1);
    expect(rotatedHandRange.end).toBeLessThan(rotatedHandRange.total);
    expect(rotatedHandRange.total).toBe(legacyInitialRange.total);
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
      spokenTurnGuidance: false,
      reduceMotion: false,
    });
  });
});

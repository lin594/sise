import { startLobbyAction } from "./helpers/game";
import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true });

async function enterPractice(page: Page): Promise<void> {
  await page.goto("/?e2eDebug=1");

  await startLobbyAction(page);
  await expect.poll(async () => {
    const layoutClass = await page.locator("main.layout").getAttribute("class");
    if (layoutClass?.split(/\s+/u).includes("playing")) return "playing";
    const declaration = page.getByTestId("confirm-declaration");
    // 无鱼或无坎时服务端会跳过相应阶段；有候选时逐阶段确认即可。
    if (await declaration.isVisible().catch(() => false) && await declaration.isEnabled()) {
      await declaration.click();
    }
    return "waiting";
  }, { timeout: 20_000 }).toBe("playing");
}

async function setupChiScenario(page: Page, scenario = "chi_local_upper"): Promise<void> {
  await page.evaluate((scenarioName) => {
    const bridge = (window as Window & {
      __siseLocalTest?: { setupScenario: (scenario: string) => void };
    }).__siseLocalTest;
    if (!bridge) throw new Error("Local test bridge is unavailable");
    bridge.setupScenario(scenarioName);
  }, scenario);
  await expect.poll(() =>
    page.evaluate(() =>
      (window as Window & {
        __siseLocalTest?: { getLastResult: () => { scenario: string; ok: boolean } | null };
      }).__siseLocalTest?.getLastResult() ?? null,
    ),
  ).toMatchObject({ scenario, ok: true });
}

test("a player composes chi directly from the real hand without a candidate dialog", async ({ page }) => {
  await enterPractice(page);
  await setupChiScenario(page);

  const chi = page.getByTestId("action-chi");
  const shi = page.getByTestId("hand-card-d1");
  const xiang = page.getByTestId("hand-card-d2");
  await expect(page.getByTestId("candidate-panel")).toHaveCount(0);
  const choices = page.getByTestId("chi-choices");
  const family = choices.locator('[data-kind="jsx"]');
  const single = choices.locator('[data-kind="single"]');
  await expect(family).toHaveAttribute("aria-pressed", "true");
  await expect(single).toHaveAccessibleName(/单吃，来牌红帥/);
  await single.click();
  await expect(shi).toHaveAttribute("aria-pressed", "false");
  await expect(single).toHaveAttribute("aria-pressed", "true");
  await family.click();
  await expect(chi).toHaveText("吃");
  await expect(chi).toBeEnabled(); // red jiang may be eaten as a single card

  // 将士象与直接吃将并存时先展示完整组合；取消后仍可自由重新选择。
  await expect(shi).toHaveAttribute("aria-pressed", "true");
  await expect(xiang).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(shi).toHaveAttribute("aria-pressed", "false");
  await expect(xiang).toHaveAttribute("aria-pressed", "false");

  await shi.scrollIntoViewIfNeeded();
  await shi.click();
  await expect(shi).toHaveAttribute("aria-pressed", "true");
  await expect(chi).toBeEnabled();
  await chi.click();
  await expect(page.getByTestId("table-notice-toast")).toContainText("这不是一个合法的吃牌组合");

  await shi.click();
  await expect(shi).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("table-notice-toast")).toHaveCount(0);
  await expect(chi).toBeEnabled();

  await shi.click();
  await xiang.scrollIntoViewIfNeeded();
  await xiang.click();
  await expect(shi).toHaveAttribute("aria-pressed", "true");
  await expect(xiang).toHaveAttribute("aria-pressed", "true");
  await expect(chi).toBeEnabled();

  await chi.click();
  const discard = page.getByTestId("discard-confirm");
  await expect(discard).toBeVisible();
  await expect(discard).toHaveText("出");
  await expect(discard).toBeDisabled();
});

test("the only visible chi composition is selected without submitting it", async ({ page }) => {
  await enterPractice(page);
  await setupChiScenario(page, "chi_unique_jmp");

  const ju = page.getByTestId("hand-card-unique-yellow-ju-1");
  const ma = page.getByTestId("hand-card-unique-yellow-ma");
  const chi = page.getByTestId("action-chi");
  await expect(ju).toHaveAttribute("aria-pressed", "true");
  await expect(ma).toHaveAttribute("aria-pressed", "true");
  await expect(chi).toBeEnabled();

  await page.keyboard.press("Escape");
  await expect(ju).toHaveAttribute("aria-pressed", "false");
  await expect(ma).toHaveAttribute("aria-pressed", "false");
  await expect(chi).toBeEnabled();
  await chi.click();
  await expect(page.getByTestId("table-notice-toast")).toContainText("请先选择要吃的手牌");
  await page.waitForTimeout(250);
  await expect(ju).toHaveAttribute("aria-pressed", "false");
  await expect(ma).toHaveAttribute("aria-pressed", "false");
});

test("duplicate physical cards still count as one visible chi composition", async ({ page }) => {
  await enterPractice(page);
  await setupChiScenario(page, "chi_unique_duplicate_jmp");

  await expect(page.getByTestId("chi-choices").locator("[data-kind]")).toHaveCount(1);
  await expect(page.getByTestId("hand-card-unique-yellow-ma")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("action-chi")).toBeEnabled();
  await expect.poll(() => page.locator('[data-testid^="hand-card-unique-yellow-ju-"][aria-pressed="true"]').count())
    .toBe(1);
  const first = page.getByTestId("hand-card-unique-yellow-ju-1");
  const second = page.getByTestId("hand-card-unique-yellow-ju-2");
  await first.click();
  await second.click();
  await page.getByTestId("chi-choices").locator("[data-kind]").click();
  await expect(second).toHaveAttribute("aria-pressed", "true");
  await expect(first).toHaveAttribute("aria-pressed", "false");
  await page.getByTestId("action-chi").click();
  await expect(page.getByTestId("discard-confirm")).toBeVisible();
  await expect(second).toHaveCount(0);
  await expect(first).toBeVisible();
});

test("a complete local chi draft survives an authoritative refresh for the same card", async ({ page }) => {
  await enterPractice(page);
  await setupChiScenario(page, "chi_collective_zu4");

  const selected = [
    page.getByTestId("hand-card-shared-zu-yellow"),
    page.getByTestId("hand-card-shared-zu-red"),
    page.getByTestId("hand-card-shared-zu-green"),
  ];
  await expect(page.getByTestId("action-chi")).toBeVisible();
  await selected[0].click();
  await expect(selected[0]).toHaveAttribute("aria-pressed", "true");
  await selected[1].click();
  await expect(selected[1]).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("action-chi")).toBeEnabled();
  await selected[2].click();
  await expect(selected[2]).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("action-chi")).toBeEnabled();

  await setupChiScenario(page, "chi_local_upper_zu4");
  await expect(page.getByTestId("game-board")).toHaveAttribute("data-response-phase", "local_upper");
  for (const card of selected) await expect(card).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("action-chi")).toBeEnabled();
});

test("a confirmed local chi is applied exactly once after the collective window clears", async ({ page }) => {
  await enterPractice(page);
  await setupChiScenario(page, "chi_collective_zu4");

  await expect(page.getByTestId("action-chi")).toBeVisible();
  for (const id of ["shared-zu-yellow", "shared-zu-red", "shared-zu-green"]) {
    await page.getByTestId(`hand-card-${id}`).click();
  }
  const chi = page.getByTestId("action-chi");
  await expect(chi).toBeEnabled();
  await chi.click();

  const exposedCounts = () => page.evaluate(() => {
    const state = (window as Window & { __siseLocalTest?: { getRoomState: () => any } })
      .__siseLocalTest?.getRoomState();
    const exposedIds = (state?.players ?? []).flatMap((player: any) =>
      (player.exposedArea ?? []).map((card: any) => card.id),
    );
    return ["shared-zu-yellow", "shared-zu-red", "shared-zu-green", "shared-zu-white"]
      .map((id) => exposedIds.filter((exposedId: string) => exposedId === id).length);
  });
  await expect.poll(exposedCounts).toEqual([1, 1, 1, 1]);
  await page.waitForTimeout(500);
  await expect.poll(exposedCounts).toEqual([1, 1, 1, 1]);
});

test("a player can freely choose a three-color or four-color zu chi from the hand", async ({ page }, info) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await enterPractice(page);
  await setupChiScenario(page, "chi_four_zu");

  const chi = page.getByTestId("action-chi");
  const red = page.getByTestId("hand-card-zu-red");
  const green = page.getByTestId("hand-card-zu-green");
  const white = page.getByTestId("hand-card-zu-white");
  await expect(chi).toBeEnabled();
  await chi.click();
  await expect(page.getByTestId("table-notice-toast")).toContainText("请先选择要吃的手牌");

  await red.click();
  await green.click();
  const choices = page.getByTestId("chi-choices");
  const selectedThree = choices.locator('[data-kind="zu3"][aria-pressed="true"]');
  await expect(choices.locator('[data-kind="zu3"]')).toHaveCount(3);
  await expect(selectedThree).toHaveCount(1);
  const four = choices.locator('[data-kind="zu4"]');
  await expect(four.locator('[data-preview-card-id]')).toHaveCount(4);
  await four.click();
  await expect(four).toHaveAttribute("aria-pressed", "true");
  await expect(four).toBeInViewport();
  await expect(chi).toBeInViewport();
  await page.screenshot({ path: info.outputPath("four-color-chi.png") });
  await expect(white).toHaveAttribute("aria-pressed", "true");
  await white.click();
  await expect(selectedThree).toHaveCount(1);
  await white.click();
  await expect(chi).toBeEnabled();
  await chi.click();

  await expect.poll(() => page.evaluate(() => {
    const state = (window as Window & { __siseLocalTest?: { getRoomState: () => any } })
      .__siseLocalTest?.getRoomState();
    const exposedIds = (state?.players ?? []).flatMap((player: any) =>
      (player.exposedArea ?? []).map((card: any) => card.id),
    );
    return ["zu-yellow", "zu-red", "zu-green", "zu-white"].every((id) => exposedIds.includes(id));
  })).toBe(true);
  await expect(page.getByTestId("discard-confirm")).toBeVisible();
});

test("the operation dock has no visible waiting narration", async ({ page }) => {
  await enterPractice(page);
  await expect(page.getByTestId("action-waiting")).toHaveCount(0);
  await expect(page.locator(".action-dock")).not.toContainText(/正在操作|轮到你时会提醒/);
});

test("the scrollable chi choices leave all response buttons on one 44px touch row", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("sise_context_hints_v1", '{"enabled":false}'));
  await enterPractice(page);
  for (const [width, height] of [[568, 320], [844, 390], [390, 844]] as const) {
    await page.setViewportSize({ width, height });
    const rotated = height > width;
    await expect(page.locator("main.layout")).toHaveAttribute("data-rotated-phone-portrait", String(rotated));
    for (const scenario of ["chi_local_upper_zu4", "chi_collective_confirm"]) {
      await setupChiScenario(page, scenario);
      const track = page.getByTestId("dynamic-action-track");
      const choices = track.getByTestId("chi-choices");
      await expect(choices.locator("[data-kind]").first()).toBeVisible();
      await expect(track.getByTestId("action-row").getByRole("button")).toHaveCount(scenario === "chi_local_upper_zu4" ? 2 : 3);
      const geometry = () => track.evaluate((element, rotated) => {
        const box = (selector: string) => element.querySelector(selector)!.getBoundingClientRect();
        const rail = element.getBoundingClientRect();
        const strip = box(".chi-choices");
        const buttons = [...element.querySelectorAll(".action-row button")].map(button => button.getBoundingClientRect());
        const inside = (rect: DOMRect) => rect.left >= rail.left - 1 && rect.right <= rail.right + 1 &&
          rect.top >= rail.top - 1 && rect.bottom <= rail.bottom + 1;
        const cross = (rect: DOMRect) => rotated ? rect.x : rect.y;
        const intersects = (a: DOMRect, b: DOMRect) => a.left < b.right - 1 && b.left < a.right - 1 &&
          a.top < b.bottom - 1 && b.top < a.bottom - 1;
        const otherZones = [".table", ".self-hand-card"].map(selector => element.closest(".board")!.querySelector(selector)!.getBoundingClientRect());
        return {
          sameRow: buttons.every(button => Math.abs(cross(button) - cross(buttons[0]!)) < 1),
          touchSize: buttons.every(button => button.width >= 43.99 && button.height >= 43.99),
          insideRail: buttons.every(inside),
          separate: buttons.every(button => ![strip, ...otherZones].some(zone => intersects(button, zone))),
          choicesVisible: (rotated ? strip.height : strip.width) >= 44,
          fixedPosition: buttons.map(button => [button.x - rail.x, button.y - rail.y]),
        };
      }, rotated);
      const expectedBounds = { sameRow: true, touchSize: true, insideRail: true, separate: true, choicesVisible: true };
      await expect.poll(geometry, { message: `${width}×${height} ${scenario}` }).toMatchObject(expectedBounds);
      const before = (await geometry()).fixedPosition;
      await choices.evaluate(element => { element.scrollLeft = element.scrollWidth; });
      expect((await geometry()).fixedPosition).toEqual(before);
      await choices.locator("[data-kind]").last().tap();
      await expect.poll(geometry).toMatchObject(expectedBounds);
    }
  }
});

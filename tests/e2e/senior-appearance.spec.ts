import { expect, test } from "@playwright/test";
import { resolveTableLayout } from "../../client/src/utils/appearance";
import { startLobbyAction } from "./helpers/game";

const preferencesKey = "sise_game_display_preferences_v2";

test("长辈版可以在大厅开启，在设置里关闭，原有显示偏好和刷新后的选择均保留", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.addInitScript(key => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({
      skin: "licheng-water", ownCards: "long", tableCards: "long", handLayout: "single", tableLayout: "classic",
    }));
  }, preferencesKey);
  await page.goto("/");
  const entry = page.getByTestId("senior-mode-entry");
  await expect(entry).toHaveAttribute("aria-pressed", "false");
  await entry.click();
  await page.reload();
  await expect(entry).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("game-settings").click();
  if (!await page.getByTestId("senior-mode-setting").isVisible()) await page.getByTestId("settings-category-appearance").click();
  const setting = page.getByTestId("senior-mode-setting");
  await expect(setting).toHaveAttribute("aria-checked", "true");
  await setting.click();
  await page.reload();
  await expect(entry).toHaveAttribute("aria-pressed", "false");
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), preferencesKey)).toMatchObject({
    seniorMode: false, skin: "licheng-water", ownCards: "long", tableCards: "long", handLayout: "single", tableLayout: "classic",
  });
});

test("长辈版放大实际牌桌，二十张手牌在手机上可翻到末张并返回", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/?e2eDebug=1");
  await startLobbyAction(page);
  await page.evaluate(() => (window as any).__siseLocalTest.setupScenario("chi_local_upper_full_hand"));
  const hand = page.locator(".hand-card"), pending = page.locator(".response-card-face");
  await expect(hand).toHaveCount(20);
  await expect(page.getByTestId("action-chi")).toBeEnabled();
  const entry = page.getByTestId("senior-mode-entry");
  await entry.click();
  for (const [width, height] of [[844, 390], [568, 320], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    await expect(page.locator("main.layout")).toHaveAttribute("data-effective-viewport", `${width}x${height}`);
    await expect(page.getByTestId("game-board")).toHaveAttribute("data-table-layout", resolveTableLayout("adaptive", width, height));
    await expect(page.getByTestId("game-board")).toHaveAttribute("data-layout-pending", "false");
    await expect(hand.first().locator(".card")).toHaveAttribute("data-card-mode", "large");
    await expect(pending).toHaveAttribute("data-card-mode", "large");
    const measurements = async () => page.evaluate(() => {
      const board = document.querySelector(".board")!, box = board.getBoundingClientRect();
      const table = board.querySelector(".table")!.getBoundingClientRect();
      const read = (selector: string) => {
        const el = board.querySelector(selector)!;
        const r = el.getBoundingClientRect();
        return { w: r.width, h: r.height, font: parseFloat(getComputedStyle(el).fontSize), insideFelt: r.top >= table.top - 1 && r.bottom <= table.bottom + 1, inside: r.top >= box.top - 1 && r.bottom <= box.bottom + 1 };
      };
      return {
        hand: read(".hand-card"), handInk: read(".hand-card .text-top"), target: read(".response-card-face"),
        targetInk: read(".response-card-face .text-top"), name: read(".player-left .seat-name"),
        count: read(".player-left .hand-count-badge"), chi: read("[data-testid=action-chi]"),
      };
    });
    await expect(async () => {
      const m = await measurements();
      expect(m.hand.w).toBeGreaterThanOrEqual(48);
      expect(m.hand.h).toBeGreaterThanOrEqual(48);
      expect(m.hand.inside).toBe(true);
      expect(m.handInk.font).toBeGreaterThanOrEqual(30);
      expect(m.target.w).toBeGreaterThanOrEqual(44);
      expect(m.target.insideFelt).toBe(true);
      expect(m.targetInk.font).toBeGreaterThanOrEqual(28);
      expect(m.name.font).toBeGreaterThanOrEqual(16);
      expect(m.count.font).toBeGreaterThanOrEqual(15);
      expect(m.chi.w).toBeGreaterThanOrEqual(48);
      expect(m.chi.h).toBeGreaterThanOrEqual(48);
    }).toPass({ timeout: 4000 });
    if (width < 1000) {
      const next = page.getByTestId("hand-scroll-next"), prev = page.getByTestId("hand-scroll-prev");
      await expect(next).toBeVisible();
      for (let n = 0; n < 8 && await next.isEnabled(); n++) await next.click();
      await expect(next).toBeDisabled();
      for (let n = 0; n < 8 && await prev.isEnabled(); n++) await prev.click();
      await expect(prev).toBeDisabled();
    }
    console.log(width, await page.evaluate(() => Object.fromEntries([".board", ".table", ".player-top", ".center", ".response-card-face", ".player-left", ".self-groups-card", ".self-command-row", ".self-hand-panel", ".hand", ".hand-card", ".hand-visible-range"].map(sel => {const el = document.querySelector(sel);const r = el?.getBoundingClientRect();return [sel,r && [r.x,r.y,r.width,r.height].map(Math.round).join(",")];}))));
    await page.screenshot({ path: testInfo.outputPath(`senior-${width}x${height}.png`) });
  }
  await entry.click();
  await expect(hand.first().locator(".card")).toHaveAttribute("data-card-mode", "long");
  await expect(page.locator(".hand-viewport.single-line")).toBeVisible();
});

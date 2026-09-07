import { revealSetting } from "./helpers/settings";
import { expect, test } from "@playwright/test";

test("global appearance settings are reachable before joining and retain other preferences", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("sise_game_display_preferences_v2", JSON.stringify({ ownCards: "long", handLayout: "paged" })));
  await page.goto("/?new=1");
  await page.getByTestId("game-settings").click();
  await expect(page.getByTestId("settings-panel")).toBeVisible();
  await revealSetting(page, "card-mode-own-long");
  await expect(page.getByTestId("card-mode-own-long")).toHaveAttribute("aria-checked", "true");
  await revealSetting(page, "hand-layout-paged");
  await expect(page.getByTestId("hand-layout-paged")).toHaveAttribute("aria-checked", "true");
  await revealSetting(page, "skin-cyber-minimal");
  await page.getByTestId("skin-cyber-minimal").click();
  await expect(page.locator("html")).toHaveAttribute("data-skin", "cyber-minimal");
  await page.getByRole("button", { name: "关闭设置", exact: true }).click();
  await expect(page.getByTestId("game-settings")).toBeFocused();
});

for (const skin of ["cyber-minimal", "licheng-water", "puxian-house", "meizhou-sea"]) {
  test(`skin ${skin} applies across the page and settings`, async ({ page }, testInfo) => {
    await page.goto("/?new=1");
    await page.getByTestId("game-settings").click();
    await revealSetting(page, `skin-${skin}`);
    await page.getByTestId(`skin-${skin}`).click();
    await expect(page.locator("html")).toHaveAttribute("data-skin", skin);
    await expect(page.getByTestId(`skin-${skin}`)).toHaveAttribute("aria-checked", "true");
    await page.screenshot({ path: testInfo.outputPath(`${skin}-settings.png`) });
    await page.getByRole("button", { name: "关闭设置", exact: true }).click();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-skin", skin);
    await expect(page.locator(".layout")).toBeVisible();
  });
}

async function startTable(page: import('@playwright/test').Page) {
  await page.goto('/?new=1&e2eDebug=1');
  await page.getByTestId('login-submit').click();
  await page.getByTestId('lobby-start').click();
  await expect(page.getByTestId('game-board')).toBeVisible();
  await page.evaluate(() => (window as any).__siseLocalTest.setupScenario('chi_local_upper'));
  await expect(page.getByTestId('hand-card-d1')).toBeVisible();
}

test('adaptive is the default while explicit classic still offers a small-screen recommendation', async ({ page }) => {
  await page.setViewportSize({width:568,height:320});
  await page.goto('/?new=1');
  await page.getByTestId('login-submit').click();
  await expect(page.locator('main.layout')).toHaveAttribute('data-table-layout','adaptive');
  await expect(page.getByTestId('small-screen-recommendation')).toHaveCount(0);
  await page.getByTestId('game-settings').click();
  await revealSetting(page,'layout-classic');
  await page.getByTestId('layout-classic').click();
  await page.getByRole('button',{name:'关闭设置',exact:true}).click();
  await expect(page.getByTestId('small-screen-recommendation')).toBeVisible();
  await page.getByTestId('recommend-compact').click();
  await page.reload();
  await expect(page.locator('main.layout')).toHaveAttribute('data-table-layout','compact');
  await expect(page.getByTestId('small-screen-recommendation')).toHaveCount(0);
});

test('all skins and layouts keep actual cards and actions inside representative viewports', async ({ page }, info) => {
  await startTable(page);
  for (const skin of ['cyber-minimal','licheng-water','puxian-house','meizhou-sea']) {
    for (const layout of ['compact','classic','adaptive']) {
      await page.getByTestId('game-settings').click();
      await revealSetting(page,`skin-${skin}`); await page.getByTestId(`skin-${skin}`).click();
      await revealSetting(page,`layout-${layout}`); await page.getByTestId(`layout-${layout}`).click();
      await page.getByRole('button',{name:'关闭设置',exact:true}).click();
      for (const [width,height] of [[568,320],[844,390],[390,844],[1024,768],[1440,900]]) {
        await page.setViewportSize({width,height});
        const effectiveWidth=Math.max(width,height), effectiveHeight=Math.min(width,height);
        const resolved = layout === 'adaptive' ? effectiveWidth<=720 || effectiveHeight<=380 ? 'compact' : 'classic' : layout;
        await expect(page.getByTestId('game-board')).toHaveAttribute('data-table-layout',resolved);
        await expect(page.getByTestId('hand-card-d1')).toBeInViewport({ratio:1});
        await expect(page.getByTestId('action-chi')).toBeInViewport({ratio:1});
        await expect(page.getByTestId('hand-card-d1')).toHaveAttribute('aria-pressed','true');
        await expect(page.locator('.response-caption')).toHaveCount(0);
        const delta=await page.locator('.deck-stack').evaluate(el => {
          const r=el.getBoundingClientRect();
          const layers=[...el.querySelectorAll('.deck-layer')].map(l=>l.getBoundingClientRect());
          return Math.max(...layers.map(l=>Math.abs((l.top+l.bottom)/2-(r.top+r.bottom)/2)));
        });
        expect(delta).toBeLessThanOrEqual(1);
        if(width===568 || width===1440) await page.screenshot({path:info.outputPath(`${skin}-${layout}-${width}.png`)});
      }
    }
  }
});

for (const mode of ['large','long']) test(`draw backs and faces retain ${mode} card geometry`, async ({ page }) => {
  await startTable(page);
  await page.getByTestId('game-settings').click(); await revealSetting(page,`card-mode-table-${mode}`);
  await page.getByTestId(`card-mode-table-${mode}`).click();
  await page.getByRole('button',{name:'关闭设置',exact:true}).click();
  await expect(page.getByTestId('pending-card').locator('.card')).toHaveAttribute('data-card-mode',mode);
  await page.evaluate(()=> (window as any).__siseLocalTest.setupScenario('draw_choice'));
  const flight=page.locator('[data-transition-kind="draw"]');
  await expect(flight.locator('.card-back')).toHaveAttribute('data-card-mode',mode);
  await expect(flight.locator('.card-back')).toHaveCSS('border-radius',mode==='long'?'50% / 18%':'6px');
  await expect(flight.locator('.card-back')).toHaveCSS('background-image',/rgb\(182, 36, 44\)/);
  await expect(page.getByTestId('pending-card').locator('.card')).toHaveAttribute('data-card-mode',mode);
});

test('settings use categories outside play and restore navigation focus', async ({ page }) => {
  await page.goto('/?new=1'); await page.getByTestId('game-settings').click();
  await page.getByTestId('settings-category-table').click();
  await page.getByTestId('settings-back').click();
  await expect(page.getByTestId('settings-category-table')).toBeFocused();
  await page.keyboard.press('Escape'); await expect(page.getByTestId('game-settings')).toBeFocused();
});

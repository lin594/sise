import { startLobbyAction, stageDeclarationForTest } from "./helpers/game";
import { revealSetting } from "./helpers/settings";
import { expect, test } from "@playwright/test";

test.use({ hasTouch: true });

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

  await startLobbyAction(page);
  await expect(page.getByTestId('game-board')).toBeVisible();
  await page.evaluate(() => (window as any).__siseLocalTest.setupScenario('chi_local_upper'));
  await expect(page.getByTestId('hand-card-d1')).toBeVisible();
}

test('adaptive is the default while explicit classic still offers a small-screen recommendation', async ({ page }) => {
  await page.setViewportSize({width:568,height:320});
  await page.goto('/?new=1');

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
          const rotated = el.closest(".layout")?.classList.contains("rotated-phone-portrait");
          return Math.max(...layers.map(l => rotated ? Math.abs((l.left+l.right-r.left-r.right)/2) : Math.abs((l.top+l.bottom-r.top-r.bottom)/2)));
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

test("lobby boots with a saved name and edits without an entry screen", async ({ page }) => {
  await page.addInitScript(() => { if (!localStorage.getItem("sise_entry_name")) localStorage.setItem("sise_entry_name", "荔城牌友"); });
  await page.goto("/?new=1");
  await expect(page.getByTestId("change-entry-name")).toContainText("荔城牌友");
  await expect(page.getByTestId("nickname-input")).toHaveCount(0);
  await page.getByTestId("change-entry-name").click();
  await page.getByTestId("nickname-input").fill("湄洲牌友");
  await page.getByTestId("cancel-nickname").click();
  await expect(page.getByTestId("change-entry-name")).toContainText("荔城牌友");
  await expect(page.getByTestId("change-entry-name")).toBeFocused();
  await page.getByTestId("change-entry-name").click();
  await page.getByTestId("nickname-input").fill("湄洲牌友");
  await page.getByTestId("login-submit").click();
  await page.reload();
  await expect(page.getByTestId("change-entry-name")).toContainText("湄洲牌友");
  await expect(page.locator(".mode-card")).toHaveCount(3);
});

test('invalid fields fall back independently and preserve valid preferences', async ({page}) => {
  await page.addInitScript(() => localStorage.setItem('sise_game_display_preferences_v2', JSON.stringify({skin:'unknown',tableLayout:'unknown',ownCards:'large',handLayout:'paged'})));
  await page.goto('/?new=1');
  await expect(page.locator('html')).toHaveAttribute('data-skin','puxian-house');
  await expect(page.locator('main')).toHaveAttribute('data-table-layout','adaptive');
  await page.getByTestId('game-settings').click();
  await revealSetting(page,'card-mode-own-large');
  await expect(page.getByTestId('card-mode-own-large')).toHaveAttribute('aria-checked','true');
  await expect(page.getByTestId('hand-layout-paged')).toHaveAttribute('aria-checked','true');
});

test('blocked storage retains choices and recommendation dismissal within the session', async ({page}) => {
  await page.setViewportSize({width:568,height:320});
  await page.addInitScript(() => { for(const name of ['getItem','setItem','removeItem']) Object.defineProperty(Storage.prototype,name,{configurable:true,value(){throw new DOMException('blocked','SecurityError');}}); });
  await page.goto('/?new=1');
  await expect(page.getByTestId('small-screen-recommendation')).toHaveCount(0);
  await page.getByTestId('game-settings').click();
  await revealSetting(page,'layout-classic');
  await page.getByTestId('layout-classic').click();
  await page.getByRole('button',{name:'关闭设置',exact:true}).click();
  await page.getByTestId('dismiss-compact-recommendation').click();
  await page.getByTestId('game-settings').click();
  await revealSetting(page,'skin-meizhou-sea');
  await page.getByTestId('skin-meizhou-sea').click();
  await page.getByRole('button',{name:'关闭设置',exact:true}).click();
  await expect(page.getByTestId('small-screen-recommendation')).toHaveCount(0);
  await page.getByTestId('mode-practice_bots').click();
  await expect(page.getByTestId('game-board')).toHaveAttribute('data-table-layout','classic');
  await expect(page.locator('html')).toHaveAttribute('data-skin','meizhou-sea');
});

test('a recent historical name supplies the automatic lobby identity', async ({page}) => {
  await page.addInitScript(() => localStorage.setItem('sise_entry_name_history',JSON.stringify(['历史牌友','旧昵称'])));
  await page.goto('/?new=1');
  await expect(page.getByTestId('change-entry-name')).toContainText('历史牌友');
  expect(await page.evaluate(() => localStorage.getItem('sise_entry_name'))).toBe('历史牌友');
});


test('mobile tools keep habits nested and session mute never changes saved preferences', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await startTable(page);
  await page.getByTestId('game-settings').click();
  await expect(page.getByTestId('settings-panel')).toContainText('全部设置');
  await expect(page.getByTestId('card-mode-own-large')).toHaveCount(0);
  const saved = await page.evaluate(() => localStorage.getItem('sise_game_display_preferences_v2'));
  await page.getByTestId('session-mute').click();
  await expect(page.getByTestId('session-mute')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => localStorage.getItem('sise_game_display_preferences_v2'))).toBe(saved);
  await page.getByTestId('game-history').click();
  await expect(page.getByTestId('history-panel')).toBeVisible();
  await page.getByRole('button', { name: '返回设置' }).click();
  await expect(page.getByTestId('session-mute')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('session-mute').click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('game-settings')).toBeFocused();
});

test('rotated PWA respects visual viewport offsets and safe edges', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const viewport = window.visualViewport!;
    Object.defineProperties(viewport, { width: { value: 390, configurable: true }, height: { value: 800, configurable: true }, offsetTop: { value: 20, configurable: true } });
  });
  await startTable(page);
  await expect(page.locator('main.layout')).toHaveAttribute('data-effective-viewport', '800x390');
  const padding = await page.locator('main.layout').evaluate(el => {
    const node = el as HTMLElement;
    for (const [side, size] of Object.entries({ top: 47, right: 9, bottom: 34, left: 7 })) node.style.setProperty(`--device-safe-${side}`, `${size}px`);
    const css = getComputedStyle(node);
    return [css.paddingTop, css.paddingRight, css.paddingBottom, css.paddingLeft].map(parseFloat);
  });
  expect(padding).toEqual([9, 34, 7, 47]);
  const rect = await page.locator('main.layout').boundingBox();
  expect(rect!.x).toBeCloseTo(0, 0); expect(rect!.y).toBeCloseTo(20, 0);
  expect(rect!.width).toBeCloseTo(390, 0); expect(rect!.height).toBeCloseTo(800, 0);
  await expect(page.getByTestId('action-chi')).toBeInViewport({ ratio: 1 });
  const geometry = await page.locator('.self-command-row').evaluate(el => {
    const clock = el.querySelector('.clock-slot') as HTMLElement;
    const info = el.querySelector('.self-info-card') as HTMLElement;
    return { clock: clock.offsetWidth, overlap: clock.offsetLeft + clock.offsetWidth > info.offsetLeft, widths: [...el.querySelectorAll<HTMLElement>('.action-row .btn')].map(b => b.offsetWidth) };
  });
  expect(geometry.clock).toBe(56); expect(geometry.overlap).toBe(false);
  for (const width of geometry.widths) { expect(width).toBeGreaterThanOrEqual(44); expect(width).toBeLessThanOrEqual(96); }
  await page.screenshot({ path: info.outputPath('rotated-pwa-visual-viewport.png') });
});


test('declaration guidance follows fish and kong confirmation without covering controls', async ({ page }, info) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await startTable(page);
  await stageDeclarationForTest(page);
  const guide = page.getByTestId('declaration-guidance');
  await expect(guide).toContainText('声明鱼');
  await expect(guide).toBeVisible();
  await expect(page.getByTestId('confirm-declaration')).toContainText('确认鱼');
  await page.screenshot({ path: info.outputPath('declaration-fish.png') });
  await page.getByTestId('confirm-declaration').click();
  await expect(guide).toContainText('声明坎');
  await expect(page.getByTestId('confirm-declaration')).toContainText('确认坎数');
  await page.getByTestId('confirm-declaration').click();
  await expect(guide).toHaveCount(0);
});

test('classic table places actual exposed groups around the felt', async ({ page }, info) => {
  await startTable(page);
  await page.evaluate(() => (window as any).__siseLocalTest.setupScenario('readable_exposed_groups'));
  await expect.poll(() => page.evaluate(() => (window as any).__siseLocalTest.getLastResult())).toMatchObject({ scenario: 'readable_exposed_groups', ok: true });
  for (const skin of ['licheng-water', 'puxian-house', 'meizhou-sea', 'cyber-minimal']) {
    await page.getByTestId('game-settings').click();
    await revealSetting(page, `skin-${skin}`); await page.getByTestId(`skin-${skin}`).click();
    await revealSetting(page, 'layout-classic'); await page.getByTestId('layout-classic').click();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('settings-panel')).toHaveCount(0);
    for (const [width, height] of [[844,390],[390,844],[1440,900]]) {
      await page.setViewportSize({ width, height });
      await expect(page.getByTestId('game-board')).toHaveAttribute('data-table-layout', 'classic');
      await expect(page.getByTestId('player-top')).toBeInViewport({ ratio: 1 });
      await expect(page.locator('.opponent-card-stack')).toHaveCount(0);
      await expect(page.locator('.self-groups-card .group-block-list [data-face-id]').first()).toBeVisible();
      await page.waitForTimeout(250);
      await page.screenshot({ path: info.outputPath(`${skin}-classic-groups-${width}.png`) });
    }
  }
});

test('dealer ceremony counts from the picker to the authoritative dealer for every color', async ({ page }, info) => {
  await page.setViewportSize({ width: 568, height: 320 });
  await startTable(page);
  for (const [color, total] of [['yellow', 1], ['red', 2], ['green', 3], ['white', 4], ['gold', 2]] as const) {
    await page.evaluate(scenario => (window as any).__siseLocalTest.setupScenario(scenario), `dealer_count_${color}`);
    const status = page.getByTestId('dealer-count-status');
    await expect(status).toHaveAttribute('data-count-step', '1');
    await expect(page.getByTestId('dealer-ceremony')).not.toContainText('从翻牌者数起');
    const startPosition = await status.boundingBox();
    const state = await page.evaluate(() => (window as any).__siseLocalTest.getRoomState());
    const seats = [...state.players].sort((a: any,b: any) => a.seatIndex - b.seatIndex);
    const first = seats.findIndex((p: any) => p.clientId === state.dealerPickerId);
    for (let step = 1; step <= total; step++) {
      await expect(status).toHaveAttribute('data-count-step', String(step));
      await expect(status).toHaveAttribute('data-count-seat', seats[(first + step - 1) % seats.length].clientId);
    }
    await expect(status).toHaveAttribute('data-count-seat', state.dealerId);
    await page.waitForTimeout(520);
    const endPosition = await status.boundingBox();
    if (total > 1) expect(Math.hypot(endPosition!.x - startPosition!.x, endPosition!.y - startPosition!.y)).toBeGreaterThan(30);
    await expect(page.locator('.dealer-reveal-result')).toBeVisible();
    await expect(page.getByTestId('game-interaction')).toBeInViewport({ ratio: 1 });
    await expect(page.getByTestId('game-auto-play')).toBeInViewport({ ratio: 1 });
    if (color === 'white') await page.screenshot({ path: info.outputPath('dealer-count-white-4.png') });
  }
});

test('a clock-only snapshot cannot leave rotation waiting on an expired animation', async ({ page }) => {
  await page.setViewportSize({ width: 568, height: 320 });
  await startTable(page);
  const board = page.getByTestId('game-board');
  await expect(board).toHaveAttribute('data-geometry-busy', 'false');
  // This rendering-only fixture reserves a revision range against late real
  // snapshots; it submits no gameplay actions after installing the transition.
  // An already completed transition leaves the RAF loop idle. A same-revision
  // snapshot may then correct only serverNow, without replacing public state.
  await page.evaluate(() => {
    const bridge = (window as any).__siseLocalTest;
    const state = bridge.getRoomState();
    const now = Date.now();
    bridge.applyRoomSnapshot({ ...state, stateRevision: state.stateRevision + 1000, serverNow: now, tableTransitions: [{
      id: 98765, round: 1, kind: 'draw', startsAt: now - 2000, endsAt: now - 100,
      moves: [{ card: { id: 'clock-regression-card', color: 'red', type: 'ma' }, from: { zone: 'deck' }, to: { zone: 'center' } }],
    }] }, 'explicit');
  });
  await expect(board).toHaveAttribute('data-geometry-busy', 'false');
  await page.evaluate(() => {
    const bridge = (window as any).__siseLocalTest;
    const state = bridge.getRoomState();
    bridge.applyRoomSnapshot({ ...state, serverNow: state.tableTransitions[0].endsAt - 1200 }, 'explicit');
  });
  await expect(board).toHaveAttribute('data-geometry-busy', 'true');
  await page.setViewportSize({ width: 320, height: 568 });
  await expect(page.locator('main.layout')).toHaveAttribute('data-rotated-phone-portrait', 'true', { timeout: 5000 });
  await expect(board).toHaveAttribute('data-geometry-busy', 'false');
  await expect(page.locator('main.layout')).toHaveAttribute('data-effective-viewport', '568x320');
});

import { expect, test, type Page } from '@playwright/test';
async function login(page: Page) {
  await page.goto('/?e2eDebug=1');
  await page.getByTestId('random-nickname').click();
  await page.getByTestId('login-submit').click();
}
async function assertHandFits(page: Page) {
  await expect.poll(() => page.locator('.cards.hand').evaluate((el) => {
    const rail = el.getBoundingClientRect();
    const cards = [...el.querySelectorAll('[data-card-id]')].map((c) => c.getBoundingClientRect());
    return cards.length >= 20 && cards.every((c) => c.left >= rail.left - 2 && c.right <= rail.right + 2 && c.top >= rail.top - 2 && c.bottom <= rail.bottom + 2 && c.left >= -2 && c.right <= window.innerWidth + 2 && c.top >= -2 && c.bottom <= window.innerHeight + 2);
  })).toBe(true);
}
for (const viewport of [{ width: 1280, height: 800 }, { width: 568, height: 320 }, { width: 667, height: 375 }, { width: 375, height: 667 }]) {
  test(`single row and embedded declaration ${viewport.width}x${viewport.height}`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    await login(page);
    await page.getByTestId('lobby-start').click();
    await expect(page.getByTestId('confirm-declaration')).toBeEnabled({ timeout: 20000 });
    await expect(page.locator('.declare-mask')).toHaveClass(/embedded/);
    await expect(page.locator('.hand-preview')).toHaveCount(0);
    await expect(page.getByTestId('decision-countdown')).toHaveText('不限时');
    await assertHandFits(page);
    await page.screenshot({ path: info.outputPath('declaration.png') });
    await page.getByTestId('confirm-declaration').click();
    await expect(page.locator('.declare-mask')).toHaveCount(0);
    await page.getByTestId('game-settings').click();
    await page.getByTestId('hand-layout-paged').click();
    await expect(page.getByTestId('hand-layout-paged')).toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('hand-layout-single').click();
    await page.getByTestId('settings-rules').click();
    await expect(page.getByTestId('rules-panel')).toBeVisible();
    await expect(page.getByTestId('settings-panel')).toHaveCount(0);
    await expect(page.getByText('哪些牌能成组', { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath('rules.png') });
    await page.getByTestId('close-rules').click();
    await page.screenshot({ path: info.outputPath('playing.png') });
  });
}
test('friend waiting room rules entry opens the shared guide', async ({ page }) => {
  await login(page);
  await page.getByTestId('mode-friends').click();
  await page.getByTestId('lobby-start').click();
  await page.getByRole('button', { name: '查看规则', exact: true }).click();
  await expect(page.getByTestId('rules-panel')).toBeVisible();
  await expect(page.getByText('现在怎么操作', { exact: true })).toBeVisible();
  await page.getByTestId('close-rules').click();
  await expect(page.getByRole('button', { name: '查看规则', exact: true })).toBeFocused();
});
test('listening marks stay in the hand and only discard selection opens a preview', async ({ page }, info) => {
  await page.setViewportSize({ width: 667, height: 375 });
  await login(page);
  await page.getByTestId('lobby-start').click();
  await page.getByTestId('confirm-declaration').click();
  await page.evaluate(() => (window as any).__siseLocalTest.setupScenario('chi_unique_jsx'));
  await expect(page.getByTestId('hand-card-unique-red-jiang')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('hand-card-unique-red-shi')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('selected-card-preview')).toHaveCount(0);
  await expect(page.getByTestId('listening-summary')).toHaveCount(0);
  const projectedMark = page.getByTestId('hand-card-post-yellow-shi').getByTestId('listening-mark');
  await expect(projectedMark).toHaveAttribute('data-listening-context', 'post-chi');
  await expect(page.getByTestId('hand-card-post-yellow-shi')).toHaveAttribute('aria-label', /吃后打出可听牌/);

  await page.getByTestId('action-chi').click();
  await expect(page.getByTestId('discard-confirm')).toBeVisible();
  const discardMark = page.getByTestId('hand-card-post-yellow-shi').getByTestId('listening-mark');
  await expect(discardMark).toHaveAttribute('data-listening-context', 'discard');
  await expect(page.getByTestId('hand-card-post-yellow-shi')).toHaveAttribute('aria-label', /打出后可听牌/);
  await page.getByTestId('hand-card-post-yellow-shi').click();
  const preview = page.getByTestId('selected-card-preview');
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute('aria-label', /打出后等待/);
  await expect.poll(() => preview.locator('[role="img"]').count()).toBeGreaterThan(1);

  const ordinaryDiscard = page.locator('.hand-card:not(.deal-concealed):not(:has([data-testid="listening-mark"]))').first();
  await ordinaryDiscard.click();
  await expect(preview.locator('[role="img"]')).toHaveCount(1);
  await expect(page.getByText('当前选择暂无听牌路线', { exact: true })).toHaveCount(0);
  await expect(page.getByText('当前没有打出一张即可听牌的路线', { exact: true })).toHaveCount(0);
  await page.getByTestId('hand-card-post-yellow-shi').click();
  await expect.poll(() => preview.locator('[role="img"]').count()).toBeGreaterThan(1);
  await page.screenshot({ path: info.outputPath('listening.png') });

  await page.evaluate(() => {
    const bridge = (window as any).__siseLocalTest;
    const state = bridge.getRoomState();
    bridge.applyRoomSnapshot({
      stateRevision: state.stateRevision + 20,
      listeningHints: { stateRevision: state.stateRevision - 1, decisionKey: bridge.getDecisionTimer().decisionKey, discards: [], chi: [] },
    }, 'explicit');
  });
  await expect(page.getByTestId('listening-mark')).toHaveCount(0);
  await expect(page.getByTestId('listening-summary')).toHaveCount(0);
  await expect(preview.locator('[role="img"]')).toHaveCount(1);
  await expect(page.getByTestId('discard-confirm')).toBeEnabled();
});

test('opening deal keeps one authoritative scale and a stable hand viewport', async ({ page }) => {
  await page.setViewportSize({ width: 568, height: 320 });
  await login(page);
  await page.evaluate(() => {
    const probe = window as any;
    probe.__siseHandScaleSamples = [];
    probe.__siseHandScaleProbe = window.setInterval(() => {
      const hand = document.querySelector<HTMLElement>('.cards.hand.single-line');
      const viewport = document.querySelector<HTMLElement>('.hand-viewport.single-line');
      if (!hand || !viewport) return;
      const cards = [...hand.querySelectorAll<HTMLElement>('[data-card-id]')];
      const visibleCount = cards.filter((card) => !card.classList.contains('deal-concealed')).length;
      if (!visibleCount) return;
      const rect = viewport.getBoundingClientRect();
      probe.__siseHandScaleSamples.push({
        scale: Number.parseFloat(getComputedStyle(hand).zoom || '1'),
        visibleCount,
        authoritativeCount: cards.length,
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      });
    }, 8);
  });
  await page.getByTestId('lobby-start').click();
  await expect(page.getByTestId('confirm-declaration')).toBeEnabled({ timeout: 20_000 });
  const samples = await page.evaluate(() => {
    const probe = window as any;
    window.clearInterval(probe.__siseHandScaleProbe);
    return probe.__siseHandScaleSamples as Array<Record<string, number>>;
  });
  expect(samples.length).toBeGreaterThan(2);
  expect(samples.every((sample) => sample.authoritativeCount >= 20)).toBe(true);
  expect(new Set(samples.map((sample) => sample.scale.toFixed(4))).size).toBe(1);
  for (const key of ['left', 'top', 'width', 'height'] as const) {
    const values = samples.map((sample) => sample[key]);
    expect(Math.max(...values) - Math.min(...values), `${key} must stay stable during the deal`).toBeLessThanOrEqual(0.5);
  }
});
test('21-card single row adapts to both card styles and layout preference survives refresh', async ({ page }) => {
  await page.setViewportSize({ width: 568, height: 320 });
  await login(page);
  await page.getByTestId('lobby-start').click();
  await expect(page.getByTestId('confirm-declaration')).toBeEnabled();
  await page.evaluate(() => {
    const bridge = (window as any).__siseLocalTest;
    const state = bridge.getRoomState();
    const types = ['jiang', 'shi', 'xiang', 'ju', 'ma', 'pao', 'zu'];
    bridge.applyRoomSnapshot({
      stateRevision: state.stateRevision + 100,
      privateHand: Array.from({ length: 21 }, (_, i) => ({ id: `sizing-${i}`, color: 'red', type: types[i % 7] })),
      players: state.players.map((p: any) => p.isBot ? p : { ...p, handCount: 21 }),
    });
  });
  for (const style of ['large', 'long']) {
    await page.getByTestId('game-settings').click();
    await page.getByTestId(`card-mode-own-${style}`).click();
    await page.getByRole('button', { name: '关闭设置', exact: true }).click();
    await assertHandFits(page);
  }
  await page.getByTestId('game-settings').click();
  await page.getByTestId('hand-layout-paged').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('sise_game_display_preferences_v2')!).handLayout)).toBe('paged');
  await page.reload();
  await expect(page.getByTestId('game-settings')).toBeVisible();
  await page.getByTestId('game-settings').click();
  await expect(page.getByTestId('hand-layout-paged')).toHaveAttribute('aria-checked', 'true');
});

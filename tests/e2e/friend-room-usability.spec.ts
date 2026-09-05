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
test('chi previews listening routes and stale hints disappear', async ({ page }, info) => {
  await page.setViewportSize({ width: 667, height: 375 });
  await login(page);
  await page.getByTestId('lobby-start').click();
  await page.getByTestId('confirm-declaration').click();
  await page.evaluate(() => (window as any).__siseLocalTest.setupScenario('chi_unique_jmp'));
  await expect(page.getByTestId('listening-summary')).toContainText('这样吃后');
  await expect(page.getByTestId('listening-summary').locator('[role="img"]')).not.toHaveCount(0);
  await page.getByTestId('action-chi').click();
  await expect(page.getByTestId('discard-confirm')).toBeVisible();
  await page.getByTestId('hand-card-unique-red-shi').click();
  await expect(page.getByTestId('listening-summary')).toContainText('听牌提示');
  await expect(page.locator('.selected-card-preview')).toBeVisible();
  await page.screenshot({ path: info.outputPath('listening.png') });
  await page.evaluate(() => {
    const bridge = (window as any).__siseLocalTest;
    const state = bridge.getRoomState();
    bridge.applyRoomSnapshot({
      stateRevision: state.stateRevision + 20,
      listeningHints: { stateRevision: state.stateRevision - 1, decisionKey: bridge.getDecisionTimer().decisionKey, discards: [], chi: [] },
    }, 'explicit');
  });
  await expect(page.getByTestId('listening-summary')).toHaveCount(0);
  await expect(page.getByTestId('discard-confirm')).toBeEnabled();
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

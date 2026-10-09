import { test, expect, type Page } from '@playwright/test';
import { openGameAs, startLobbyAction, finishDeclarationIfNeeded } from './helpers/game';

async function chi(page: Page) {
  await page.evaluate(() => (window as any).__siseLocalTest.setupScenario('chi_local_upper'));
  await expect(page.getByTestId('action-chi')).toBeEnabled();
}
async function earlyChi(page: Page) {
  await page.evaluate(() => (window as any).__siseLocalTest.setupScenario('chi_collective_confirm'));
  await expect.poll(() => page.evaluate(() => (window as any).__siseLocalTest.getLastResult())).toMatchObject({ scenario: 'chi_collective_confirm', ok: true });
  await expect(page.getByTestId('action-chi')).toBeEnabled();
}
async function settings(page: Page) {
  await page.getByTestId('game-settings').click();
  await page.getByRole('button', { name: /辅助功能/ }).click();
}

test('early Chi teaching explains priority once and restores focus to the action', async ({ browser }) => {
  const hostContext = await browser.newContext({ viewport: { width: 568, height: 320 } });
  const guestContext = await browser.newContext({ viewport: { width: 568, height: 320 } });
  const page = await hostContext.newPage();
  const guest = await guestContext.newPage();
  await hostContext.addInitScript(() => {
    localStorage.setItem('sise_context_hints_v1', JSON.stringify({
      enabled: true,
      seen: ['hu', 'kai', 'peng', 'chi', 'grab', 'pass', 'fish', 'kan', 'general'],
    }));
  });
  try {
    await openGameAs(page, '/?e2eDebug=1', '提前吃教学');
    await page.getByTestId('mode-friends').click();
    await expect.poll(() => page.url()).toContain('roomId=');
    await openGameAs(guest, page.url(), '优先响应');
    await guest.getByTestId('claim-seat-1').click();
    await page.getByTestId('fill-bots').click();
    await guest.getByTestId('lobby-ready').click();
    await startLobbyAction(page);
    await Promise.all([finishDeclarationIfNeeded(page), finishDeclarationIfNeeded(guest)]);
    await earlyChi(page);

    const hint = page.locator('[data-testid="context-hint"][data-concept="earlyChi"]');
    await expect(hint).toBeVisible();
    await expect(hint.getByRole('status')).toContainText('可以提前吃');
    await expect(hint.getByRole('status')).toContainText('不会立即抢牌');
    await expect(hint.getByRole('status')).toContainText('胡、开、碰仍然优先');
    await expect(hint).not.toContainText(/deferred|collective|intent/i);
    const hintBox = await hint.boundingBox();
    expect(hintBox && hintBox.y >= 0 && hintBox.y + hintBox.height <= 320).toBeTruthy();

    const close = hint.getByRole('button', { name: '关闭这条提示', exact: true });
    await close.focus();
    await close.press('Enter');
    await expect(hint).toHaveCount(0);
    await expect(page.getByTestId('action-chi')).toBeFocused();

    await page.evaluate(() => (window as any).__siseLocalTest.setupScenario('chi_local_upper'));
    await earlyChi(page);
    await expect(hint).toHaveCount(0);

    await settings(page);
    await page.getByTestId('context-hints-reset').click();
    await page.keyboard.press('Escape');
    await expect(hint).toBeVisible();
  } finally {
    await guestContext.close();
    await hostContext.close();
  }
});
for (const blocked of [false, true]) test(`context hints explain only authority, dismiss and reset with blocked storage=${blocked}`, async ({ page }) => {
  await page.setViewportSize({ width: 568, height: 320 });
  await page.addInitScript((blocked) => {
    if (blocked) {
      for (const name of ['getItem', 'setItem', 'removeItem']) Object.defineProperty(Storage.prototype, name, { value() { throw new DOMException('disabled', 'SecurityError'); } });
    } else if (!localStorage.getItem('sise_context_hints_v1')) localStorage.setItem('sise_context_hints_v1', JSON.stringify({enabled:false,seen:[]}));
  }, blocked);
  await page.goto('/?e2eDebug=1');
  await startLobbyAction(page); await finishDeclarationIfNeeded(page);
  await chi(page);
  await settings(page);
  await page.getByTestId('context-hints-reset').click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('settings-panel')).not.toBeVisible();
  const hint = page.getByTestId('context-hint');
  await expect(hint).toHaveAttribute('data-concept', 'chi');
  await expect(hint.getByRole('status')).toContainText('吃');
  if (!blocked) await page.screenshot({ path: "/tmp/sise-context-hint-568.png" });
  const box = await hint.boundingBox();
  expect(box && box.y >= 0 && box.y + box.height <= 320).toBeTruthy();
  await hint.getByRole('button', { name: '关闭这条提示', exact:true }).press('Enter');
  await expect(hint).toHaveCount(0);
  await chi(page);
  await expect(page.locator('[data-testid="context-hint"][data-concept="chi"]')).toHaveCount(0);
  await settings(page);
  await page.getByTestId('context-hints-setting').click();
  await expect(page.getByTestId('context-hints-setting')).toHaveAttribute('aria-checked','false');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('settings-panel')).not.toBeVisible();
  await expect(hint).toHaveCount(0);
  await page.getByTestId('action-chi').click();
  await expect(page.getByTestId('discard-confirm')).toBeVisible();
  if (!blocked) {
    await page.reload();
    await expect(page.getByTestId('game-board')).toBeVisible();
    await settings(page);
    await expect(page.getByTestId('context-hints-setting')).toHaveAttribute('aria-checked','false');
  }
});

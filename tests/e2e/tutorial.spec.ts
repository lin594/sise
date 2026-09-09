import { test, expect } from '@playwright/test';

for (const viewport of [{ width: 1280, height: 800 }, { width: 568, height: 320 }, { width: 375, height: 667 }]) {
  test(`authoritative tutorial completes and resumes at ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.getByTestId('tutorial-entry').click();
    const guide = page.getByTestId('tutorial-guide');
    await expect(guide).toHaveAttribute('data-step', 'intro');
    await expect(page.getByTestId('game-auto-play')).toHaveCount(0);
    const box = await guide.boundingBox();
    expect(box && box.y >= 0 && box.y + box.height <= viewport.height).toBeTruthy();
    await page.getByRole('button', { name: '开始演练', exact: true }).press('Enter');
    await expect(guide).toHaveAttribute('data-step', 'grab');
    await page.getByTestId('action-pass').click();
    await expect(page.getByTestId('action-chi')).toBeEnabled({ timeout: 20000 });
    await page.getByTestId('action-chi').click();
    await expect(guide).toHaveAttribute('data-step', 'discard_chi');
    await page.reload();
    await expect(guide).toHaveAttribute('data-step', 'discard_chi', { timeout: 20000 });
    await page.getByTestId('hand-card-white_shi_01').click();
    await page.getByTestId('discard-confirm').click();
    await expect(guide).toHaveAttribute('data-step', 'peng');
    await expect(page.getByTestId('action-peng')).toBeEnabled({ timeout: 20000 });
    await page.getByTestId('action-peng').click();
    await expect(guide).toHaveAttribute('data-step', 'discard_peng');
    await page.getByTestId('hand-card-white_pao_01').click();
    await page.getByTestId('discard-confirm').click();
    await expect(page.getByTestId('action-hu')).toBeEnabled({ timeout: 20000 });
    await page.getByTestId('action-hu').click();
    await expect(page.getByTestId('tutorial-practice')).toBeVisible({ timeout: 20000 });
    const primary = await page.getByTestId('tutorial-practice').boundingBox();
    expect(primary && primary.y >= 0 && primary.y + primary.height <= viewport.height).toBeTruthy();
    await page.getByTestId('tutorial-practice').click();
    await expect(page.getByTestId('game-board')).toBeVisible({ timeout: 20000 });
    await expect(guide).toHaveCount(0);
  });
}

test('tutorial creation accepts no client fixture or non-practice tutorial', async ({ request }) => {
  for (const data of [{mode:'friends',tutorial:true}, {mode:'practice',tutorial:true,seed:1}, {mode:'practice',tutorial:true,hand:[]}]) {
    expect((await request.post('http://127.0.0.1:2567/rooms', {data})).status()).toBe(400);
  }
});


test('tutorial works with storage disabled and explicit exit clears guidance', async ({ page }) => {
  await page.addInitScript(() => {
    for (const name of ['getItem', 'setItem', 'removeItem']) Object.defineProperty(Storage.prototype, name, { value() { throw new DOMException('disabled', 'SecurityError'); } });
  });
  await page.goto('/');
  await page.getByTestId('tutorial-entry').click();
  await expect(page.getByTestId('tutorial-guide')).toHaveAttribute('data-step', 'intro');
  await expect(page.getByTestId('tutorial-guide').getByRole('status')).toContainText('认牌');
  await page.getByTestId('game-settings').click();
  await page.getByTestId('game-exit').click();
  await page.getByRole('button', { name: '确认退出', exact: true }).click();
  await expect(page.getByTestId('tutorial-guide')).toHaveCount(0);
  await expect(page.getByTestId('tutorial-entry')).toBeVisible();
});


test('public matchmaking cannot submit teaching or recovery state', async ({ request }) => {
  for (const method of ['create', 'joinOrCreate']) {
    const response = await request.post(`http://127.0.0.1:2567/matchmake/${method}/four-color`, {data:{roomMode:'practice', tutorial:true, recoverySnapshot:{}}});
    const body = await response.json();
    expect(body.room).toBeUndefined();
    expect(body.error).toBeTruthy();
  }
});

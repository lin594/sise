import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('a missing initial join acknowledgment recovers without showing an empty table', async ({ page }) => {
  await page.addInitScript(joinCode => {
    const send = WebSocket.prototype.send;
    const dropped = new WeakSet<WebSocket>();
    WebSocket.prototype.send = function (data) {
      const bytes = data instanceof ArrayBuffer ? new Uint8Array(data)
        : ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : null;
      if (bytes?.length === 1 && bytes[0] === joinCode && !dropped.has(this)) {
        dropped.add(this);
        return;
      }
      send.call(this, data);
    };
  }, 10); // Colyseus Protocol.JOIN_ROOM, independent of the application's recovery code.
  await page.goto('/');
  await page.getByTestId('mode-practice_bots').click();
  await expect(page.getByTestId('opponent-hand-count')).toHaveCount(3, { timeout: 15000 });
  await expect.poll(() => page.locator('.hand-card').count(), { timeout: 15000 }).toBeGreaterThan(0);
  await page.reload();
  await expect(page.getByTestId('opponent-hand-count')).toHaveCount(3, { timeout: 15000 });
  await expect.poll(() => page.locator('.hand-card').count(), { timeout: 15000 }).toBeGreaterThan(0);
});

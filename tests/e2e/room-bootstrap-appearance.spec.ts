import { expect, test } from '@playwright/test';
import { finishDeclarationIfNeeded } from './helpers/game';

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

for (const format of ['blob', 'view', 'mixed'] as const) {
  test(`browser ${format} frames preserve room initialization and recovery`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(format => {
      const descriptor = Object.getOwnPropertyDescriptor(WebSocket.prototype, 'onmessage')!;
      Object.defineProperty(WebSocket.prototype, 'onmessage', {
        ...descriptor,
        set(handler) {
          let frame = 0;
          descriptor.set!.call(this, typeof handler !== 'function' ? handler : function (event: MessageEvent) {
            let data = event.data;
            if (data instanceof ArrayBuffer && (format !== 'mixed' || frame++ > 0)) {
              if (format !== 'view') data = new Blob([data]);
              else {
                const padded = new Uint8Array(data.byteLength + 8);
                padded.set(new Uint8Array(data), 4);
                data = padded.subarray(4, padded.length - 4);
              }
            }
            handler.call(this, new MessageEvent('message', { data }));
          });
        },
      });
    }, format);
    await page.goto('/');
    await page.getByTestId('mode-practice_bots').click();
    await expect(page.getByTestId('opponent-hand-count')).toHaveCount(3, { timeout: 15000 });
    await finishDeclarationIfNeeded(page);
    await expect.poll(() => page.locator('.hand-card').count()).toBeGreaterThan(0);
    await page.reload();
    await expect(page.getByTestId('opponent-hand-count')).toHaveCount(3, { timeout: 15000 });
    await expect.poll(() => page.locator('.hand-card').count()).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
}

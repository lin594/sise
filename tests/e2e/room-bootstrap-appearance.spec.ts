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

for (const stop of ['socket-close', 'pagehide', 'beforeunload'] as const) {
  test(`queued Blob frames stop decoding after ${stop}`, async ({ page }) => {
    await page.addInitScript(() => {
      const state = { socket: null as WebSocket | null, reads: 0, aborts: 0, release: null as (() => void) | null };
      (window as any).__blobReadTest = state;
      const read = Blob.prototype.arrayBuffer;
      Blob.prototype.arrayBuffer = function () {
        state.reads += 1;
        if (state.reads === 1) {
          return new Promise<ArrayBuffer>((resolve, reject) => {
            state.release = () => read.call(this).then(resolve, reject);
          });
        }
        return read.call(this);
      };
      const NativeReader = FileReader;
      // Hold one read in progress so teardown is deterministic in either engine.
      class HeldReader {
        result: string | ArrayBuffer | null = null;
        error: DOMException | null = null;
        readyState = 0;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        onabort: (() => void) | null = null;
        private reader = new NativeReader();
        readAsArrayBuffer(blob: Blob) {
          this.readyState = 1;
          state.reads += 1;
          const begin = () => {
            if (this.readyState !== 1) return;
            this.reader.onload = () => { this.result = this.reader.result; this.readyState = 2; this.onload?.(); };
            this.reader.onerror = () => { this.error = this.reader.error; this.readyState = 2; this.onerror?.(); };
            this.reader.readAsArrayBuffer(blob);
          };
          if (state.reads === 1) state.release = begin;
          else begin();
        }
        abort() {
          if (this.readyState !== 1) return;
          state.aborts += 1;
          this.readyState = 2;
          this.reader.abort();
          this.onabort?.();
        }
      }
      window.FileReader = HeldReader as unknown as typeof FileReader;
      const descriptor = Object.getOwnPropertyDescriptor(WebSocket.prototype, 'onmessage')!;
      Object.defineProperty(WebSocket.prototype, 'onmessage', {
        ...descriptor,
        set(handler) {
          state.socket = this;
          descriptor.set!.call(this, typeof handler !== 'function' ? handler : function (event: MessageEvent) {
            handler.call(this, new MessageEvent('message', {
              data: event.data instanceof ArrayBuffer ? new Blob([event.data]) : event.data,
            }));
          });
        },
      });
    });
    await page.goto('/');
    await page.getByTestId('mode-practice_bots').click();
    await page.waitForFunction(() => (window as any).__blobReadTest.release !== null);
    const result = await page.evaluate(async stop => {
      const state = (window as any).__blobReadTest;
      const socket = state.socket as WebSocket;
      for (let i = 0; i < 3; i++) socket.dispatchEvent(new MessageEvent('message', { data: new Blob([new Uint8Array([0])]) }));
      if (stop === 'pagehide') window.dispatchEvent(new PageTransitionEvent('pagehide'));
      else if (stop === 'beforeunload') window.dispatchEvent(new Event('beforeunload'));
      else await new Promise<void>(resolve => {
        socket.addEventListener('close', () => resolve(), { once: true });
        socket.close();
      });
      state.release();
      await new Promise(resolve => setTimeout(resolve, 100));
      return { reads: state.reads, aborts: state.aborts, stopped: socket.readyState !== WebSocket.OPEN };
    }, stop);
    expect(result).toEqual({ reads: 1, aborts: 1, stopped: true });
  });
}

import { WebSocketTransport } from '@colyseus/sdk/transport/WebSocketTransport';

// Keep the adaptation local to the SDK; do not replace the browser's WebSocket.
// Its Node-first constructor passes an options object as browser subprotocols.
WebSocketTransport.prototype.connect = function (url: string): void {
  const socket = this.protocols === undefined
    ? new WebSocket(url)
    : new WebSocket(url, this.protocols);
  this.ws = socket;
  socket.binaryType = 'arraybuffer';
  let stopped = false;
  let activeReader: FileReader | null = null;
  const stopReading = () => {
    stopped = true;
    activeReader?.abort();
    window.removeEventListener('beforeunload', handlePageHide);
    window.removeEventListener('pagehide', handlePageHide);
  };
  const handlePageHide = () => {
    stopReading();
    socket.close();
  };
  // WebKit invalidates a document's Blob URLs during navigation. Cancel the
  // queue when navigation starts: pagehide can arrive after Blob invalidation.
  // Keep pagehide as a fallback for mobile lifecycle transitions.
  window.addEventListener('beforeunload', handlePageHide, { once: true });
  window.addEventListener('pagehide', handlePageHide, { once: true });
  socket.addEventListener('close', stopReading, { once: true });
  const canRead = () => !stopped && this.ws === socket && socket.readyState === WebSocket.OPEN;
  const readBlob = (blob: Blob) => new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    activeReader = reader;
    const finish = () => { if (activeReader === reader) activeReader = null; };
    reader.onload = () => {
      finish();
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error('Invalid binary room message'));
    };
    reader.onerror = () => { finish(); reject(reader.error); };
    reader.onabort = () => { finish(); reject(new DOMException('Room connection closed', 'AbortError')); };
    reader.readAsArrayBuffer(blob);
  });
  socket.onopen = event => this.events.onopen?.(event);
  socket.onclose = event => this.events.onclose?.(event);
  socket.onerror = event => this.events.onerror?.(event);

  // Embedded browsers can deliver Blob frames despite the requested binaryType.
  // Serialize conversion so a slower Blob never lets a later state overtake it.
  let incoming = Promise.resolve();
  socket.onmessage = event => {
    incoming = incoming.then(async () => {
      if (!canRead()) return;
      const raw: unknown = event.data;
      const data = raw instanceof Blob ? await readBlob(raw)
        : ArrayBuffer.isView(raw) ? new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength).slice().buffer
        : raw;
      if (!canRead()) return;
      if (!(data instanceof ArrayBuffer)) throw new Error('Invalid binary room message');
      this.events.onmessage?.(new MessageEvent('message', { data }));
    }).catch(() => {
      if (canRead()) {
        this.events.onerror?.({ code: 1002, reason: '房间消息读取失败，正在重新连接。' });
        socket.close();
      }
    });
  };
};

WebSocketTransport.prototype.send = function (data: Uint8Array): void {
  // Send precisely this message, without sharing the SDK's reusable buffer.
  (this.ws as WebSocket).send(new Uint8Array(data).buffer);
};

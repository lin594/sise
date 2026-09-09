import { WebSocketTransport } from '@colyseus/sdk/transport/WebSocketTransport';

// Keep the adaptation local to the SDK; do not replace the browser's WebSocket.
// Its Node-first constructor passes an options object as browser subprotocols.
WebSocketTransport.prototype.connect = function (url: string): void {
  const socket = this.protocols === undefined
    ? new WebSocket(url)
    : new WebSocket(url, this.protocols);
  this.ws = socket;
  socket.binaryType = 'arraybuffer';
  socket.onopen = event => this.events.onopen?.(event);
  socket.onclose = event => this.events.onclose?.(event);
  socket.onerror = event => this.events.onerror?.(event);

  // Embedded browsers can deliver Blob frames despite the requested binaryType.
  // Serialize conversion so a slower Blob never lets a later state overtake it.
  let incoming = Promise.resolve();
  socket.onmessage = event => {
    incoming = incoming.then(async () => {
      if (this.ws !== socket) return;
      const raw: unknown = event.data;
      const data = raw instanceof Blob ? await raw.arrayBuffer()
        : ArrayBuffer.isView(raw) ? new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength).slice().buffer
        : raw;
      if (this.ws !== socket) return;
      if (!(data instanceof ArrayBuffer)) throw new Error('Invalid binary room message');
      this.events.onmessage?.(new MessageEvent('message', { data }));
    }).catch(() => {
      if (this.ws === socket) {
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

import { anonymizeEvent, type AnonymousEvent, type ProductEventInput } from "./events.js";
export interface ProductEventStore { record(event: AnonymousEvent): Promise<void>; close?(): Promise<void>; }
/** Nothing retaining credentials, rooms, hands or raw payloads crosses this boundary. */
export class ProductAnalytics {
  private queue: AnonymousEvent[] = [];
  private running = false;
  private closed = false;
  private dropped = 0;
  private written = 0;
  constructor(private store: ProductEventStore, private secret: string, private maxQueue = 256) {}
  emit(input: ProductEventInput, token: string, source: "client" | "server" = "server"): void {
    try {
      const event = anonymizeEvent(input, token, this.secret, source);
      if (!event || this.closed) return;
      if (this.queue.length >= this.maxQueue) { this.dropped++; return; }
      this.queue.push(event);
      void this.drain();
    } catch { this.dropped++; }
  }
  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length && !this.closed) {
        const event = this.queue.shift()!;
        try { await this.store.record(event); this.written++; } catch { this.dropped++; }
      }
    } finally { this.running = false; }
  }
  status() { return { queued: this.queue.length, dropped: this.dropped, written: this.written }; }
  async close(): Promise<void> {
    this.closed = true;
    this.dropped += this.queue.length;
    this.queue = [];
    await this.store.close?.();
  }
}
let active: ProductAnalytics | null = null;
export function configureProductAnalytics(runtime: ProductAnalytics | null) { active = runtime; }
export function emitProductEvent(input: ProductEventInput, token: string, source: "client" | "server" = "server") { active?.emit(input, token, source); }

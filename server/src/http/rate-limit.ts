import type { Request, RequestHandler } from "express";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  maxRequests: number;
  windowMs: number;
  message?: string;
  maxTrackedKeys?: number;
  key?: (request: Request) => string;
  now?: () => number;
}

export function parseBoundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(minimum, Math.min(maximum, Math.trunc(parsed)));
}

function requestAddress(request: Request): string {
  return String(request.ip || request.socket?.remoteAddress || "unknown");
}

/**
 * A small in-process fixed-window limiter for the single-process deployment.
 * It deliberately protects only expensive HTTP helpers; Colyseus still owns
 * WebSocket admission and room capacity.
 */
export function createRateLimitMiddleware(options: RateLimitOptions): RequestHandler {
  const maxRequests = Math.max(1, Math.trunc(options.maxRequests));
  const windowMs = Math.max(1_000, Math.trunc(options.windowMs));
  const maxTrackedKeys = Math.max(100, Math.trunc(options.maxTrackedKeys ?? 10_000));
  const entries = new Map<string, RateLimitEntry>();
  const now = options.now ?? Date.now;
  const getKey = options.key ?? requestAddress;

  return (request, response, next) => {
    const timestamp = now();
    const key = getKey(request) || "unknown";
    let entry = entries.get(key);
    if (!entry || timestamp >= entry.resetAt) {
      entry = { count: 0, resetAt: timestamp + windowMs };
      entries.set(key, entry);
    }

    if (entries.size > maxTrackedKeys) {
      for (const [trackedKey, tracked] of entries) {
        if (timestamp >= tracked.resetAt) {
          entries.delete(trackedKey);
        }
      }
      while (entries.size > maxTrackedKeys) {
        const oldestKey = entries.keys().next().value as string | undefined;
        if (!oldestKey) break;
        entries.delete(oldestKey);
      }
    }

    const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - timestamp) / 1_000));
    response.setHeader("RateLimit-Limit", String(maxRequests));
    response.setHeader("RateLimit-Remaining", String(Math.max(0, maxRequests - entry.count - 1)));
    response.setHeader("RateLimit-Reset", String(retryAfterSeconds));

    if (entry.count >= maxRequests) {
      response.setHeader("Retry-After", String(retryAfterSeconds));
      response.status(429).json({
        ok: false,
        code: "rate_limited",
        message: options.message ?? "请求过于频繁，请稍后再试。",
      });
      return;
    }

    entry.count += 1;
    next();
  };
}

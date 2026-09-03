import type { RequestHandler } from "express";

export interface OriginPolicy {
  allowAny: boolean;
  allowedOrigins: ReadonlySet<string>;
}

function normalizeWebOrigin(value: string): string {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    return parsed.origin;
  } catch {
    return "";
  }
}

export function createOriginPolicy(configuredOrigins: string | undefined, runtimeEnv: string | undefined): OriginPolicy {
  const values = String(configuredOrigins ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (values.includes("*")) {
    return { allowAny: true, allowedOrigins: new Set() };
  }

  const allowedOrigins = new Set(values.map(normalizeWebOrigin).filter(Boolean));
  if (allowedOrigins.size > 0) {
    return { allowAny: false, allowedOrigins };
  }

  // Local development regularly uses different ports and LAN addresses. A
  // production process must opt into each browser origin explicitly.
  return runtimeEnv === "production"
    ? { allowAny: false, allowedOrigins: new Set() }
    : { allowAny: true, allowedOrigins: new Set() };
}

export function isOriginAllowed(origin: string | undefined, policy: OriginPolicy): boolean {
  // CLI probes and server-to-server clients do not send a browser Origin.
  if (!origin) {
    return true;
  }
  if (policy.allowAny) {
    return true;
  }
  const normalized = normalizeWebOrigin(origin);
  return Boolean(normalized && policy.allowedOrigins.has(normalized));
}

export function buildCorsOriginHeaders(
  origin: string | undefined,
  policy: OriginPolicy,
): Record<string, string> {
  if (!origin) {
    return { "Access-Control-Allow-Origin": "*" };
  }
  const normalized = normalizeWebOrigin(origin);
  return {
    "Access-Control-Allow-Origin": isOriginAllowed(origin, policy) && normalized ? normalized : "null",
    Vary: "Origin",
  };
}

export function shouldEnableMonitor(runtimeEnv: string | undefined, configured: string | undefined): boolean {
  const normalized = String(configured ?? "").trim().toLowerCase();
  if (normalized) {
    return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
  }
  return runtimeEnv !== "production";
}

export function createCorsMiddleware(policy: OriginPolicy): RequestHandler {
  return (req, res, next) => {
    const origin = typeof req.headers.origin === "string" ? req.headers.origin : undefined;
    if (!isOriginAllowed(origin, policy)) {
      res.status(403).json({ ok: false, message: "origin not allowed" });
      return;
    }

    for (const [header, value] of Object.entries(buildCorsOriginHeaders(origin, policy))) {
      res.header(header, value);
    }
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.header(
      "Access-Control-Expose-Headers",
      "Retry-After, RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset",
    );
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  };
}

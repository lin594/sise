const DEFAULT_BACKEND_PORT = "2567";

export interface BackendLocationInput {
  protocol?: string;
  hostname?: string;
}

export interface BackendUrlInput extends BackendLocationInput {
  httpUrl?: unknown;
  wsUrl?: unknown;
  port?: string;
}

function normalizedValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedBaseUrl(value: unknown, protocols: readonly string[]): string {
  const raw = normalizedValue(value);
  if (!raw) {
    return "";
  }
  try {
    const parsed = new URL(raw);
    if (!protocols.includes(parsed.protocol) || parsed.username || parsed.password) {
      return "";
    }
    parsed.search = "";
    parsed.hash = "";
    const path = parsed.pathname.replace(/\/+$/u, "");
    return `${parsed.origin}${path}`;
  } catch {
    return "";
  }
}

function hostForUrl(hostname: string): string {
  return hostname.includes(":") && !hostname.startsWith("[") ? `[${hostname}]` : hostname;
}

function withProtocol(baseUrl: string, protocol: "http:" | "https:" | "ws:" | "wss:"): string {
  const parsed = new URL(baseUrl);
  const path = parsed.pathname.replace(/\/+$/u, "");
  return `${protocol}//${parsed.host}${path}`;
}

export function resolveBackendUrls(input: BackendUrlInput): { httpUrl: string; wsUrl: string } {
  const pageProtocol = input.protocol === "https:" ? "https:" : "http:";
  const wsProtocol = pageProtocol === "https:" ? "wss:" : "ws:";
  const hostname = hostForUrl(normalizedValue(input.hostname) || "localhost");
  const port = normalizedValue(input.port) || DEFAULT_BACKEND_PORT;
  const explicitHttp = normalizedBaseUrl(input.httpUrl, ["http:", "https:"]);
  const explicitWs = normalizedBaseUrl(input.wsUrl, ["ws:", "wss:"]);

  const httpUrl = explicitHttp ||
    (explicitWs
      ? withProtocol(explicitWs, explicitWs.startsWith("wss:") ? "https:" : "http:")
      : `${pageProtocol}//${hostname}:${port}`);
  const wsUrl = explicitWs ||
    (explicitHttp
      ? withProtocol(explicitHttp, explicitHttp.startsWith("https:") ? "wss:" : "ws:")
      : `${wsProtocol}//${hostname}:${port}`);
  return { httpUrl, wsUrl };
}

export const BACKEND_DEFAULT_PORT = DEFAULT_BACKEND_PORT;

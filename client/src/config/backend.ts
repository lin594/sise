const DEFAULT_BACKEND_PORT = "2567";

function normalizedEnvValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function browserHttpProtocol(): string {
  return window.location.protocol || "http:";
}

function browserWsProtocol(): string {
  return browserHttpProtocol() === "https:" ? "wss:" : "ws:";
}

function browserHostName(): string {
  return window.location.hostname || "localhost";
}

function defaultHttpBase(): string {
  return `${browserHttpProtocol()}//${browserHostName()}:${DEFAULT_BACKEND_PORT}`;
}

function defaultWsBase(): string {
  return `${browserWsProtocol()}//${browserHostName()}:${DEFAULT_BACKEND_PORT}`;
}

export const BACKEND_HTTP_URL = normalizedEnvValue(import.meta.env.VITE_SERVER_HTTP_URL) || defaultHttpBase();
export const BACKEND_WS_URL = normalizedEnvValue(import.meta.env.VITE_SERVER_URL) || defaultWsBase();

export const BACKEND_CONFIG = {
  port: DEFAULT_BACKEND_PORT,
  httpUrl: BACKEND_HTTP_URL,
  wsUrl: BACKEND_WS_URL,
} as const;

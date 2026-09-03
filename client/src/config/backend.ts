import { BACKEND_DEFAULT_PORT, resolveBackendUrls, type BackendLocationInput } from "./backend-urls";

const browserLocation: BackendLocationInput = typeof window === "undefined"
  ? { protocol: "http:", hostname: "localhost" }
  : window.location;
const resolvedBackendUrls = resolveBackendUrls({
  protocol: browserLocation.protocol,
  hostname: browserLocation.hostname,
  httpUrl: import.meta.env?.VITE_SERVER_HTTP_URL,
  wsUrl: import.meta.env?.VITE_SERVER_URL,
});

export const BACKEND_HTTP_URL = resolvedBackendUrls.httpUrl;
export const BACKEND_WS_URL = resolvedBackendUrls.wsUrl;

export const BACKEND_CONFIG = {
  port: BACKEND_DEFAULT_PORT,
  httpUrl: BACKEND_HTTP_URL,
  wsUrl: BACKEND_WS_URL,
} as const;

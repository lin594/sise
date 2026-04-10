const DEFAULT_BACKEND_PORT = "2567";
function normalizedEnvValue(value) {
    return typeof value === "string" ? value.trim() : "";
}
function browserHttpProtocol() {
    return window.location.protocol || "http:";
}
function browserWsProtocol() {
    return browserHttpProtocol() === "https:" ? "wss:" : "ws:";
}
function browserHostName() {
    return window.location.hostname || "localhost";
}
function defaultHttpBase() {
    return `${browserHttpProtocol()}//${browserHostName()}:${DEFAULT_BACKEND_PORT}`;
}
function defaultWsBase() {
    return `${browserWsProtocol()}//${browserHostName()}:${DEFAULT_BACKEND_PORT}`;
}
export const BACKEND_HTTP_URL = normalizedEnvValue(import.meta.env.VITE_SERVER_HTTP_URL) || defaultHttpBase();
export const BACKEND_WS_URL = normalizedEnvValue(import.meta.env.VITE_SERVER_URL) || defaultWsBase();
export const BACKEND_CONFIG = {
    port: DEFAULT_BACKEND_PORT,
    httpUrl: BACKEND_HTTP_URL,
    wsUrl: BACKEND_WS_URL,
};

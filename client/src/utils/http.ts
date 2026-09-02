type ApiErrorPayload = {
  code?: unknown;
  message?: unknown;
};

export function retryAfterMilliseconds(response: Response, now = Date.now()): number {
  const raw = response.headers.get("Retry-After")?.trim() ?? "";
  if (!raw) {
    return 0;
  }
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) {
    return Math.max(0, Math.min(3_600_000, Math.ceil(seconds * 1_000)));
  }
  const retryAt = Date.parse(raw);
  if (!Number.isFinite(retryAt)) {
    return 0;
  }
  return Math.max(0, Math.min(3_600_000, retryAt - now));
}

function readableClientMessage(payload: ApiErrorPayload, status: number): string {
  if (status < 400 || status >= 500 || typeof payload.message !== "string") {
    return "";
  }
  const message = payload.message.replace(/\s+/gu, " ").trim();
  return message.length > 0 && message.length <= 160 ? message : "";
}

export async function apiErrorMessage(response: Response, fallback: string): Promise<string> {
  let payload: ApiErrorPayload = {};
  try {
    payload = (await response.json()) as ApiErrorPayload;
  } catch {
    // Invalid or empty error bodies use the caller's safe fallback.
  }

  const base = readableClientMessage(payload, response.status) || fallback;
  if (response.status !== 429) {
    return base;
  }

  const subject = base
    .replace(/[。！!]+$/u, "")
    .replace(/，?请稍后再试$/u, "");
  const retryMs = retryAfterMilliseconds(response);
  if (!retryMs) {
    return `${subject}，请稍后再试。`;
  }
  return `${subject}，请在 ${Math.max(1, Math.ceil(retryMs / 1_000))} 秒后再试。`;
}

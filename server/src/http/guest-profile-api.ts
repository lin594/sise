import type { Request, Response } from "express";
import {
  normalizeGuestProfileName,
  normalizeGuestProfileToken,
  type GuestProfileStore,
} from "../profiles/guest-profile-store.js";

const INVALID_CREDENTIAL_MESSAGE = "本机档案凭证无效，请刷新页面后重试。";
const UNAVAILABLE_MESSAGE = "本机档案暂时不可用，请稍后再试。";

function bearerProfileToken(request: Request): string {
  const authorization = request.headers.authorization;
  if (typeof authorization !== "string") {
    return "";
  }
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization.trim());
  return normalizeGuestProfileToken(match?.[1]);
}

function hasVisibleNickname(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.replace(/[\p{Cc}\p{Cf}\s]/gu, "").length > 0
  );
}

function prepareResponse(response: Response): void {
  response.setHeader("Cache-Control", "no-store");
}

function rejectInvalidCredential(response: Response): void {
  response.status(401).json({ ok: false, message: INVALID_CREDENTIAL_MESSAGE });
}

function rejectUnavailable(response: Response): void {
  response.status(503).json({ ok: false, message: UNAVAILABLE_MESSAGE });
}

export function createGuestProfileHandlers(store: GuestProfileStore) {
  return {
    get: async (request: Request, response: Response): Promise<void> => {
      prepareResponse(response);
      const token = bearerProfileToken(request);
      if (!token) {
        rejectInvalidCredential(response);
        return;
      }
      try {
        response.json({ ok: true, profile: await store.getOrCreate(token) });
      } catch {
        rejectUnavailable(response);
      }
    },

    put: async (request: Request, response: Response): Promise<void> => {
      prepareResponse(response);
      const token = bearerProfileToken(request);
      if (!token) {
        rejectInvalidCredential(response);
        return;
      }
      const nickname = request.body?.nickname;
      if (!hasVisibleNickname(nickname)) {
        response.status(400).json({ ok: false, message: "请先填写牌桌昵称。" });
        return;
      }
      try {
        response.json({
          ok: true,
          profile: await store.updateName(token, normalizeGuestProfileName(nickname)),
        });
      } catch {
        rejectUnavailable(response);
      }
    },
  };
}

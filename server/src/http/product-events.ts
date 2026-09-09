import type { Request, Response } from "express";
import { validateProductEvent } from "../analytics/events.js";
import { emitProductEvent } from "../analytics/runtime.js";
import { normalizeGuestProfileToken } from "../profiles/guest-profile-store.js";
export function receiveProductEvent(req: Request, res: Response): void {
  res.setHeader("Cache-Control", "no-store");
  const token = normalizeGuestProfileToken(/^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? "")?.[1]);
  if (!token || !validateProductEvent(req.body, "client")) {
    res.status(400).json({ ok: false });
    return;
  }
  emitProductEvent(req.body, token, "client");
  // Receipt is deliberately independent of storage success; never retry gameplay.
  res.status(202).json({ ok: true });
}

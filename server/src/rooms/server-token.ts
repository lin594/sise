import { randomBytes } from "node:crypto";

/** Server-only room credential generation. Never import this module into game-core. */
export function generateRoomToken(): string {
  return `pt_${randomBytes(24).toString("hex")}`;
}

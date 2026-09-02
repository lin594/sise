/**
 * Reads the room-scoped player token without putting new credentials in URLs.
 * The query fallback keeps older clients compatible during rolling deploys.
 */
export function readPrivateStateToken(authorization: unknown, queryToken: unknown): string {
  const rawHeader = Array.isArray(authorization) ? authorization[0] : authorization;
  const header = typeof rawHeader === "string" ? rawHeader.trim() : "";
  const bearer = header.match(/^Bearer\s+(\S+)$/i)?.[1]?.trim() ?? "";
  if (bearer) {
    return bearer;
  }
  return typeof queryToken === "string" ? queryToken.trim() : "";
}

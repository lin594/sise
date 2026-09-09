/** Client matchmaking may create only normal quick tables; all other creation is HTTP/server-owned. */
export function isPublicMatchmakingAllowed(method: string, options: unknown): boolean {
  if (method === "create" || method === "join") return false;
  if (method !== "joinOrCreate") return true;
  if (!options || typeof options !== "object" || Array.isArray(options)) return false;
  const input = options as Record<string, unknown>;
  return input.roomMode === "match" && input.matchOpen === true &&
    Object.keys(input).every(key => ["roomMode", "matchOpen", "name", "playerToken", "profileToken", "analyticsVisitId"].includes(key));
}

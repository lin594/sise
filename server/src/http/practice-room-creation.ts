export type PracticeRoomCreator = (
  roomName: string,
  options: { roomMode: "practice" },
) => Promise<{ roomId?: unknown }>;

/**
 * Creates one isolated practice room for one entrance request.
 * Deliberately contains no shared cache: concurrent callers must never receive
 * the same room merely because neither browser has completed its WebSocket join.
 */
export async function createIsolatedPracticeRoomId(createRoom: PracticeRoomCreator): Promise<string> {
  const created = await createRoom("four-color", { roomMode: "practice" });
  const roomId = String(created?.roomId ?? "").trim();
  if (!roomId) {
    throw new Error("房间服务没有返回房间 ID");
  }
  return roomId;
}

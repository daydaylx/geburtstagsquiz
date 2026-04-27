import type { RoomRecord, SessionRecord, TrackedWebSocket } from "./server-types.js";

export const roomsById = new Map<string, RoomRecord>();
export const roomIdByJoinCode = new Map<string, string>();
export const roomIdByHostToken = new Map<string, string>();
export const sessionsById = new Map<string, SessionRecord>();

export function getRoomByJoinCode(joinCode: string): RoomRecord | undefined {
  const roomId = roomIdByJoinCode.get(joinCode);
  return roomId ? roomsById.get(roomId) : undefined;
}

export function logRoomEvent(
  event: string,
  room: RoomRecord,
  details: Record<string, import("@quiz/shared-types").ClientInfo | number | string | undefined>,
): void {
  console.log(event, {
    roomId: room.id,
    joinCode: room.joinCode,
    ...details,
  });
}

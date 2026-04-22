import type { ClientRole, Room } from "@quiz/shared-types";
import type WebSocket from "ws";

export interface TrackedWebSocket extends WebSocket {
  connectionId: string;
  isAlive: boolean;
  sessionId: string | null;
}

export interface SessionRecord {
  sessionId: string;
  role: ClientRole;
  roomId: string;
  playerId?: string;
  socket: TrackedWebSocket | null;
}

export interface RoomRecord extends Room {
  createdAt: number;
  lastActivityAt: number;
  hostDisconnectTimer: ReturnType<typeof setTimeout> | null;
  playerDisconnectTimers: Map<string, ReturnType<typeof setTimeout>>;
}

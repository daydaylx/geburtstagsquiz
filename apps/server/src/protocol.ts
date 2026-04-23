import { WebSocket } from "ws";

import {
  EVENTS,
  PROTOCOL_ERROR_CODES,
  serializeEnvelope,
  type ErrorPayload,
  type LobbyUpdatePayload,
  type ServerToClientEventName,
  type ServerToClientEventPayloadMap,
} from "@quiz/shared-protocol";
import { PlayerState, RoomState } from "@quiz/shared-types";

import type { RoomRecord, TrackedWebSocket } from "./server-types.js";

export function sendEvent<TEvent extends ServerToClientEventName>(
  socket: TrackedWebSocket | null | undefined,
  event: TEvent,
  payload: ServerToClientEventPayloadMap[TEvent],
): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }

  socket.send(serializeEnvelope(event, payload));
}

export function sendProtocolError(
  socket: TrackedWebSocket | null | undefined,
  code: ErrorPayload["code"],
  message: string,
  context: ErrorPayload["context"],
): void {
  sendEvent(socket, EVENTS.ERROR_PROTOCOL, {
    code,
    message,
    context,
  });
}

export function toLobbyUpdatePayload(room: RoomRecord): LobbyUpdatePayload {
  return {
    roomId: room.id,
    roomState: room.state,
    hostConnected: room.hostConnected,
    players: room.players.map((player) => ({
      playerId: player.id,
      name: player.name,
      connected: player.state !== PlayerState.Disconnected,
      score: player.score,
    })),
    playerCount: room.players.length,
  };
}

export function unsupportedLobbyPhaseMessage(event: string): string {
  return `${event} is not available in the lobby phase`;
}

export { PROTOCOL_ERROR_CODES };

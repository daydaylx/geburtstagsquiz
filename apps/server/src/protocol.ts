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
import { getDefaultQuiz } from "./quiz-data.js";

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
  const categories =
    room.state === RoomState.Waiting
      ? getDefaultQuiz().categories.map((c) => ({ id: c.id, name: c.name }))
      : undefined;

  return {
    roomId: room.id,
    roomState: room.state,
    hostConnected: room.hostConnected,
    displayConnected: room.displayConnected,
    settings: room.settings,
    players: room.players.map((player) => ({
      playerId: player.id,
      name: player.name,
      connected: player.state !== PlayerState.Disconnected,
      score: player.score,
    })),
    playerCount: room.players.length,
    ...(categories ? { categories } : {}),
  };
}

export { PROTOCOL_ERROR_CODES };

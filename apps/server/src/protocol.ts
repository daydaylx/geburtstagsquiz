import {
  type ErrorPayload,
  EVENTS,
  type LobbyUpdatePayload,
  PROTOCOL_ERROR_CODES,
  type ServerToClientEventName,
  type ServerToClientEventPayloadMap,
  serializeEnvelope,
} from "@quiz/shared-protocol";
import { type ClientRole, PlayerState, type RoomSettings, RoomState } from "@quiz/shared-types";
import { WebSocket } from "ws";
import { getDefaultQuiz } from "./quiz-data.js";
import type { RoomRecord, TrackedWebSocket } from "./server-types.js";

export function sendEvent<TEvent extends ServerToClientEventName>(
  socket: TrackedWebSocket | null | undefined,
  event: TEvent,
  payload: ServerToClientEventPayloadMap[TEvent],
): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    console.warn("sendEvent: socket not open", { event, readyState: socket?.readyState });
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

export function toLobbyUpdatePayload(room: RoomRecord, role: ClientRole): LobbyUpdatePayload {
  const categories =
    room.state === RoomState.Waiting ? getDefaultQuiz().categories.map((c) => ({ id: c.id, name: c.name })) : undefined;
  const displaySettings: RoomSettings = {
    showAnswerTextOnPlayerDevices: room.settings.showAnswerTextOnPlayerDevices,
    moderatorEnabled: room.settings.moderatorEnabled ?? false,
    moderatorFrequency: room.settings.moderatorFrequency ?? "low",
  };
  const playerSettings = {
    showAnswerTextOnPlayerDevices: room.settings.showAnswerTextOnPlayerDevices,
  };
  const settings = role === "host" ? room.settings : role === "display" ? displaySettings : playerSettings;

  return {
    roomId: room.id,
    roomState: room.state,
    hostConnected: room.hostConnected,
    displayConnected: room.displayConnected,
    settings,
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

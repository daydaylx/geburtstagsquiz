import { EVENTS } from "@quiz/shared-protocol";
import { PlayerState, RoomState } from "@quiz/shared-types";

import {
  DISPLAY_DISCONNECT_GRACE_MS,
  HOST_DISCONNECT_GRACE_MS,
  PLAYER_DISCONNECT_GRACE_MS,
} from "./config.js";
import { PROTOCOL_ERROR_CODES, sendProtocolError } from "./protocol.js";
import type { RoomRecord, TrackedWebSocket } from "./server-types.js";
import { roomsById, sessionsById, logRoomEvent } from "./state.js";
import { sendToHost, sendToPlayers } from "./connection.js";
import { closeRoom, removePlayerFromRoom } from "./room.js";
import { broadcastLobbyUpdate } from "./lobby.js";
import { handleAnswerEligibilityChanged, handleScoreboardReadinessChanged } from "./game.js";

export function handleSocketClose(socket: TrackedWebSocket): void {
  if (!socket.sessionId) {
    return;
  }

  const session = sessionsById.get(socket.sessionId);
  socket.sessionId = null;

  if (!session || session.socket !== socket) {
    return;
  }

  session.socket = null;

  const room = roomsById.get(session.roomId);

  if (!room) {
    return;
  }

  room.lastActivityAt = Date.now();

  if (session.role === "display") {
    if (room.state === RoomState.Closed) {
      return;
    }

    room.displayConnected = false;

    if (room.displayDisconnectTimer) {
      clearTimeout(room.displayDisconnectTimer);
    }

    room.displayDisconnectTimer = setTimeout(() => {
      room.displayConnected = false;
      room.displayDisconnectTimer = null;
      broadcastLobbyUpdate(room);
    }, DISPLAY_DISCONNECT_GRACE_MS);

    logRoomEvent("display:disconnected", room, {
      sessionId: session.sessionId,
    });

    broadcastLobbyUpdate(room);
    return;
  }

  if (session.role === "host") {
    if (room.state === RoomState.Closed) {
      return;
    }

    room.hostConnected = false;

    if (room.hostDisconnectTimer) {
      clearTimeout(room.hostDisconnectTimer);
    }

    room.hostDisconnectTimer = setTimeout(() => {
      closeRoom(room, "Host did not reconnect in time");
    }, HOST_DISCONNECT_GRACE_MS);

    logRoomEvent("host:disconnected", room, {
      sessionId: session.sessionId,
    });

    broadcastLobbyUpdate(room);
    return;
  }

  const player = room.players.find((entry) => entry.id === session.playerId);

  if (!player || room.state === RoomState.Closed) {
    return;
  }

  player.state = PlayerState.Disconnected;

  const existingTimer = room.playerDisconnectTimers.get(player.id);

  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  room.playerDisconnectTimers.set(
    player.id,
    setTimeout(() => {
      removePlayerFromRoom(room, player.id);
    }, PLAYER_DISCONNECT_GRACE_MS),
  );

  logRoomEvent("player:disconnected", room, {
    sessionId: session.sessionId,
    playerId: player.id,
  });

  const disconnectedPayload = {
    roomId: room.id,
    playerId: player.id,
    playerState: PlayerState.Disconnected,
    connected: false,
  } as const;
  sendToHost(room, EVENTS.PLAYER_DISCONNECTED, disconnectedPayload);
  sendToPlayers(room, EVENTS.PLAYER_DISCONNECTED, disconnectedPayload);

  broadcastLobbyUpdate(room);
  handleAnswerEligibilityChanged(room);
  handleScoreboardReadinessChanged(room);
}

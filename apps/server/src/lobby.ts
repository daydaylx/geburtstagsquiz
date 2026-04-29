import { randomUUID } from "node:crypto";

import { EVENTS } from "@quiz/shared-protocol";
import { GameState, PlayerState, RoomState, type Player } from "@quiz/shared-types";
import { normalizePlayerName } from "@quiz/shared-utils";

import type { RoomRecord, SessionRecord, TrackedWebSocket } from "./server-types.js";
import {
  PROTOCOL_ERROR_CODES,
  sendEvent,
  sendProtocolError,
  toLobbyUpdatePayload,
} from "./protocol.js";
import {
  roomsById,
  roomIdByHostToken,
  sessionsById,
  getRoomByJoinCode,
  logRoomEvent,
} from "./state.js";
import { attachSocketToSession } from "./room.js";
import {
  broadcastToAllRoomClients,
  sendToDisplay,
  sendToHost,
  sendToPlayers,
  syncSessionToRoomState,
} from "./connection.js";
import { buildCatalogSummary } from "./game-plan.js";
import { getDefaultQuiz } from "./quiz-data.js";

export function handleRoomJoin(
  socket: TrackedWebSocket,
  payload: import("@quiz/shared-protocol").RoomJoinPayload,
): void {
  if (socket.sessionId) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.INVALID_STATE, "Socket is already assigned", {
      event: EVENTS.ROOM_JOIN,
      roomId: null,
      questionId: null,
    });
    return;
  }

  const room = getRoomByJoinCode(payload.joinCode);

  if (!room) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.ROOM_NOT_FOUND, "Room not found", {
      event: EVENTS.ROOM_JOIN,
      roomId: null,
      questionId: null,
    });
    return;
  }

  if (room.state !== RoomState.Waiting) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.ROOM_CLOSED, "Room is not accepting joins", {
      event: EVENTS.ROOM_JOIN,
      roomId: room.id,
      questionId: null,
    });
    return;
  }

  if (payload.sessionId) {
    const existingSession = sessionsById.get(payload.sessionId);

    if (
      existingSession &&
      existingSession.role === "player" &&
      existingSession.roomId === room.id
    ) {
      resumeSession(socket, existingSession, room, EVENTS.ROOM_JOIN);
      return;
    }
  }

  const playerId = randomUUID();
  const sessionId = randomUUID();

  const player: Player = {
    id: playerId,
    name: normalizePlayerName(payload.playerName) || "Spieler",
    sessionId,
    state: PlayerState.Ready,
    score: 0,
  };

  const session: SessionRecord = {
    sessionId,
    role: "player",
    roomId: room.id,
    playerId,
    socket,
  };

  room.players.push(player);
  room.lastActivityAt = Date.now();
  sessionsById.set(sessionId, session);
  attachSocketToSession(socket, session);

  logRoomEvent("room:join", room, {
    playerId,
    sessionId,
  });

  sendEvent(socket, EVENTS.PLAYER_JOINED, {
    roomId: room.id,
    playerId,
    sessionId,
    playerState: PlayerState.Ready,
    roomState: RoomState.Waiting,
  });

  broadcastLobbyUpdate(room);
}

export function handleHostConnect(
  socket: TrackedWebSocket,
  payload: import("@quiz/shared-protocol").HostConnectPayload,
): void {
  if (socket.sessionId) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.INVALID_STATE, "Socket is already assigned", {
      event: EVENTS.HOST_CONNECT,
      roomId: null,
      questionId: null,
    });
    return;
  }

  const roomId = roomIdByHostToken.get(payload.hostToken);
  const room = roomId ? roomsById.get(roomId) : undefined;

  if (!room) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.NOT_AUTHORIZED, "Invalid host token", {
      event: EVENTS.HOST_CONNECT,
      roomId: null,
      questionId: null,
    });
    return;
  }

  if (room.hostTokenUsed) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.NOT_AUTHORIZED, "Host token already used", {
      event: EVENTS.HOST_CONNECT,
      roomId: room.id,
      questionId: null,
    });
    return;
  }

  const hostSessionId = randomUUID();

  const session: SessionRecord = {
    sessionId: hostSessionId,
    role: "host",
    roomId: room.id,
    socket,
  };

  room.hostSessionId = hostSessionId;
  room.hostTokenUsed = true;
  room.hostConnected = true;
  room.lastActivityAt = Date.now();

  sessionsById.set(hostSessionId, session);
  attachSocketToSession(socket, session);

  logRoomEvent("host:connect", room, {
    hostSessionId,
    clientInfo: payload.clientInfo,
  });

  sendEvent(socket, EVENTS.HOST_CONNECTED, {
    roomId: room.id,
    hostSessionId,
    joinCode: room.joinCode,
    roomState: room.state,
    gameState: room.gameState,
  });
  sendEvent(socket, EVENTS.CATALOG_SUMMARY, buildCatalogSummary(getDefaultQuiz()));

  if (room.displaySessionId && room.displayConnected) {
    sendToDisplay(room, EVENTS.DISPLAY_HOST_PAIRED, { hostConnected: true });
  }

  broadcastLobbyUpdate(room);
}

export function resumeSession(
  socket: TrackedWebSocket,
  session: SessionRecord,
  room: RoomRecord,
  sourceEvent: typeof EVENTS.CONNECTION_RESUME | typeof EVENTS.ROOM_JOIN,
): void {
  if (session.role === "display") {
    if (room.displayDisconnectTimer) {
      clearTimeout(room.displayDisconnectTimer);
      room.displayDisconnectTimer = null;
    }

    room.displayConnected = true;
    room.lastActivityAt = Date.now();
    attachSocketToSession(socket, session);

    logRoomEvent("connection:resume:display", room, {
      sessionId: session.sessionId,
      sourceEvent,
    });

    sendEvent(socket, EVENTS.CONNECTION_RESUMED, {
      role: "display",
      roomId: room.id,
      roomState: room.state,
      sessionId: session.sessionId,
      joinCode: room.joinCode,
      gameState: room.gameState,
    });

    syncSessionToRoomState(session, room);
    broadcastLobbyUpdate(room);
    return;
  }

  if (session.role === "host") {
    if (room.hostDisconnectTimer) {
      clearTimeout(room.hostDisconnectTimer);
      room.hostDisconnectTimer = null;
    }

    room.hostConnected = true;
    room.lastActivityAt = Date.now();
    attachSocketToSession(socket, session);

    logRoomEvent("connection:resume:host", room, {
      sessionId: session.sessionId,
      sourceEvent,
    });

    sendEvent(socket, EVENTS.CONNECTION_RESUMED, {
      role: "host",
      roomId: room.id,
      roomState: room.state,
      sessionId: session.sessionId,
      joinCode: room.joinCode,
      gameState: room.gameState,
    });
    sendEvent(socket, EVENTS.CATALOG_SUMMARY, buildCatalogSummary(getDefaultQuiz()));

    syncSessionToRoomState(session, room);
    broadcastLobbyUpdate(room);
    return;
  }

  const player = room.players.find((entry) => entry.id === session.playerId);

  if (!player) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.PLAYER_NOT_FOUND, "Player not found", {
      event: sourceEvent,
      roomId: room.id,
      questionId: null,
    });
    return;
  }

  const disconnectTimer = room.playerDisconnectTimers.get(session.sessionId);

  if (disconnectTimer) {
    clearTimeout(disconnectTimer);
    room.playerDisconnectTimers.delete(session.sessionId);
  }

  if (room.state === RoomState.Waiting) {
    player.state = PlayerState.Ready;
  } else if (room.gameState === GameState.QuestionActive) {
    player.state = room.currentAnswers.has(player.id)
      ? PlayerState.Answered
      : PlayerState.Answering;
  } else if (room.currentAnswers.has(player.id)) {
    player.state = PlayerState.Answered;
  } else {
    player.state = PlayerState.Ready;
  }
  room.lastActivityAt = Date.now();
  attachSocketToSession(socket, session);

  logRoomEvent("connection:resume:player", room, {
    sessionId: session.sessionId,
    playerId: player.id,
    sourceEvent,
  });

  sendEvent(socket, EVENTS.CONNECTION_RESUMED, {
    role: "player",
    roomId: room.id,
    roomState: room.state,
    sessionId: session.sessionId,
    joinCode: room.joinCode,
    gameState: room.gameState,
    playerId: player.id,
    playerState: player.state,
    currentAnswer: room.currentAnswers.get(player.id)?.answer ?? null,
  });

  syncSessionToRoomState(session, room);
  const reconnectedPayload = {
    roomId: room.id,
    playerId: player.id,
    playerState: player.state,
    connected: true,
  } as const;
  sendToHost(room, EVENTS.PLAYER_RECONNECTED, reconnectedPayload);
  sendToPlayers(room, EVENTS.PLAYER_RECONNECTED, reconnectedPayload, {
    excludeSessionIds: new Set([session.sessionId]),
  });

  broadcastLobbyUpdate(room);
}

export function handleConnectionResume(
  socket: TrackedWebSocket,
  payload: import("@quiz/shared-protocol").ConnectionResumePayload,
): void {
  if (socket.sessionId) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.INVALID_STATE, "Socket is already assigned", {
      event: EVENTS.CONNECTION_RESUME,
      roomId: payload.roomId,
      questionId: null,
    });
    return;
  }

  const room = roomsById.get(payload.roomId);

  if (!room) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.ROOM_NOT_FOUND, "Room not found", {
      event: EVENTS.CONNECTION_RESUME,
      roomId: payload.roomId,
      questionId: null,
    });
    return;
  }

  const session = sessionsById.get(payload.sessionId);

  if (!session || session.roomId !== room.id) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.SESSION_NOT_FOUND, "Session not found", {
      event: EVENTS.CONNECTION_RESUME,
      roomId: room.id,
      questionId: null,
    });
    return;
  }

  resumeSession(socket, session, room, EVENTS.CONNECTION_RESUME);
}

export function handleRoomSettingsUpdate(
  socket: TrackedWebSocket,
  payload: import("@quiz/shared-protocol").RoomSettingsUpdatePayload,
): void {
  const room = roomsById.get(payload.roomId);

  if (!room) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.ROOM_NOT_FOUND, "Room not found", {
      event: EVENTS.ROOM_SETTINGS_UPDATE,
      roomId: payload.roomId,
      questionId: null,
    });
    return;
  }

  const session = socket.sessionId ? sessionsById.get(socket.sessionId) : null;

  if (!session || session.role !== "host" || session.roomId !== room.id) {
    sendProtocolError(
      socket,
      PROTOCOL_ERROR_CODES.NOT_AUTHORIZED,
      "Only the host can update room settings",
      {
        event: EVENTS.ROOM_SETTINGS_UPDATE,
        roomId: room.id,
        questionId: null,
      },
    );
    return;
  }

  if (room.state !== RoomState.Waiting) {
    sendProtocolError(
      socket,
      PROTOCOL_ERROR_CODES.INVALID_STATE,
      "Room settings can only be changed in the lobby",
      {
        event: EVENTS.ROOM_SETTINGS_UPDATE,
        roomId: room.id,
        questionId: null,
      },
    );
    return;
  }

  room.settings = {
    showAnswerTextOnPlayerDevices: payload.showAnswerTextOnPlayerDevices,
    ...(payload.gamePlanDraft ?? room.settings.gamePlanDraft
      ? { gamePlanDraft: payload.gamePlanDraft ?? room.settings.gamePlanDraft }
      : {}),
  };
  room.lastActivityAt = Date.now();

  logRoomEvent("room:settings:update", room, {
    showAnswerTextOnPlayerDevices: String(room.settings.showAnswerTextOnPlayerDevices),
  });

  broadcastLobbyUpdate(room);
}

export function broadcastLobbyUpdate(room: RoomRecord): void {
  if (room.state === RoomState.Closed) {
    return;
  }

  broadcastToAllRoomClients(room, EVENTS.LOBBY_UPDATE, toLobbyUpdatePayload(room));
}

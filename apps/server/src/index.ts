import { randomInt, randomUUID } from "node:crypto";
import { createServer } from "node:http";

import { WebSocket, WebSocketServer } from "ws";

import {
  EVENTS,
  parseClientToServerEnvelope,
  type ConnectionResumePayload,
  type EventName,
  type RoomCreatePayload,
  type RoomJoinPayload,
} from "@quiz/shared-protocol";
import {
  ClientRole,
  GameState,
  PlayerState,
  RoomState,
  type ClientInfo,
  type Player,
} from "@quiz/shared-types";
import { JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH, normalizePlayerName } from "@quiz/shared-utils";

import {
  HEARTBEAT_INTERVAL_MS,
  HOST_DISCONNECT_GRACE_MS,
  PLAYER_DISCONNECT_GRACE_MS,
  PORT,
} from "./config.js";
import {
  PROTOCOL_ERROR_CODES,
  sendEvent,
  sendProtocolError,
  toLobbyUpdatePayload,
  unsupportedLobbyPhaseMessage,
} from "./protocol.js";
import type { RoomRecord, SessionRecord, TrackedWebSocket } from "./server-types.js";

const roomsById = new Map<string, RoomRecord>();
const roomIdByJoinCode = new Map<string, string>();
const sessionsById = new Map<string, SessionRecord>();

const server = createServer((_request, response) => {
  response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Quiz Server – Lobby Phase");
});

const websocketServer = new WebSocketServer({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  websocketServer.handleUpgrade(request, socket, head, (websocket) => {
    const trackedSocket = websocket as TrackedWebSocket;
    trackedSocket.connectionId = randomUUID();
    trackedSocket.isAlive = true;
    trackedSocket.sessionId = null;

    websocketServer.emit("connection", trackedSocket, request);
  });
});

websocketServer.on("connection", (websocket) => {
  const socket = websocket as TrackedWebSocket;

  socket.on("pong", () => {
    socket.isAlive = true;
  });

  socket.on("message", (rawMessage) => {
    handleSocketMessage(socket, rawMessage.toString());
  });

  socket.on("close", () => {
    handleSocketClose(socket);
  });

  socket.on("error", (error) => {
    console.error("ws:error", {
      connectionId: socket.connectionId,
      message: error.message,
    });
  });

  sendEvent(socket, EVENTS.CONNECTION_ACK, {
    connectionId: socket.connectionId,
    serverTime: new Date().toISOString(),
  });
});

const heartbeatInterval = setInterval(() => {
  for (const websocket of websocketServer.clients) {
    const socket = websocket as TrackedWebSocket;

    if (!socket.isAlive) {
      socket.terminate();
      continue;
    }

    socket.isAlive = false;
    socket.ping();
  }
}, HEARTBEAT_INTERVAL_MS);

websocketServer.on("close", () => {
  clearInterval(heartbeatInterval);
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

function handleSocketMessage(socket: TrackedWebSocket, rawMessage: string): void {
  const parsedEnvelope = parseClientToServerEnvelope(rawMessage);

  if (!parsedEnvelope.success) {
    sendProtocolError(
      socket,
      PROTOCOL_ERROR_CODES.INVALID_PAYLOAD,
      parsedEnvelope.error,
      {
        event: toKnownEventName(parsedEnvelope.event),
        roomId: null,
        questionId: null,
      },
    );
    return;
  }

  switch (parsedEnvelope.data.event) {
    case EVENTS.ROOM_CREATE:
      handleRoomCreate(socket, parsedEnvelope.data.payload);
      return;

    case EVENTS.ROOM_JOIN:
      handleRoomJoin(socket, parsedEnvelope.data.payload);
      return;

    case EVENTS.CONNECTION_RESUME:
      handleConnectionResume(socket, parsedEnvelope.data.payload);
      return;

    case EVENTS.ROOM_CLOSE:
      handleRoomClose(socket, parsedEnvelope.data.payload.roomId);
      return;

    case EVENTS.GAME_START:
    case EVENTS.GAME_NEXT_QUESTION:
    case EVENTS.ANSWER_SUBMIT:
      sendProtocolError(
        socket,
        PROTOCOL_ERROR_CODES.INVALID_STATE,
        unsupportedLobbyPhaseMessage(parsedEnvelope.data.event),
        {
          event: parsedEnvelope.data.event,
          roomId:
            "roomId" in parsedEnvelope.data.payload ? parsedEnvelope.data.payload.roomId ?? null : null,
          questionId:
            "questionId" in parsedEnvelope.data.payload
              ? parsedEnvelope.data.payload.questionId ?? null
              : null,
        },
      );
      return;

  }
}

function handleRoomCreate(socket: TrackedWebSocket, payload: RoomCreatePayload): void {
  if (socket.sessionId) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.INVALID_STATE, "Socket is already assigned", {
      event: EVENTS.ROOM_CREATE,
      roomId: null,
      questionId: null,
    });
    return;
  }

  const roomId = randomUUID();
  const hostSessionId = randomUUID();
  const joinCode = generateUniqueJoinCode();
  const now = Date.now();

  const room: RoomRecord = {
    id: roomId,
    joinCode,
    state: RoomState.Waiting,
    hostName: normalizeHostName(payload.hostName),
    hostSessionId,
    hostConnected: true,
    players: [],
    quiz: null,
    currentQuestionIndex: null,
    gameState: null,
    createdAt: now,
    lastActivityAt: now,
    hostDisconnectTimer: null,
    playerDisconnectTimers: new Map(),
  };

  const session: SessionRecord = {
    sessionId: hostSessionId,
    role: "host",
    roomId,
    socket,
  };

  roomsById.set(roomId, room);
  roomIdByJoinCode.set(joinCode, roomId);
  sessionsById.set(hostSessionId, session);
  attachSocketToSession(socket, session);

  logRoomEvent("room:create", room, {
    hostSessionId,
    clientInfo: payload.clientInfo,
  });

  sendEvent(socket, EVENTS.ROOM_CREATED, {
    roomId,
    joinCode,
    roomState: RoomState.Waiting,
    hostSessionId,
  });

  broadcastLobbyUpdate(room);
}

function handleRoomJoin(socket: TrackedWebSocket, payload: RoomJoinPayload): void {
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

    if (existingSession && existingSession.role === "player" && existingSession.roomId === room.id) {
      resumeSession(socket, existingSession, room, EVENTS.ROOM_JOIN);
      return;
    }
  }

  const playerId = randomUUID();
  const sessionId = randomUUID();

  const player: Player = {
    id: playerId,
    name: normalizePlayerName(payload.playerName),
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
    playerState: PlayerState.Connected,
    roomState: RoomState.Waiting,
  });

  broadcastLobbyUpdate(room);
}

function handleConnectionResume(
  socket: TrackedWebSocket,
  payload: ConnectionResumePayload,
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

function handleRoomClose(socket: TrackedWebSocket, roomId: string): void {
  const room = roomsById.get(roomId);

  if (!room) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.ROOM_NOT_FOUND, "Room not found", {
      event: EVENTS.ROOM_CLOSE,
      roomId,
      questionId: null,
    });
    return;
  }

  const session = socket.sessionId ? sessionsById.get(socket.sessionId) : null;

  if (!session || session.role !== "host" || session.roomId !== room.id) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.NOT_AUTHORIZED, "Only the host can close a room", {
      event: EVENTS.ROOM_CLOSE,
      roomId,
      questionId: null,
    });
    return;
  }

  closeRoom(room, "Room closed by host");
}

function resumeSession(
  socket: TrackedWebSocket,
  session: SessionRecord,
  room: RoomRecord,
  sourceEvent: typeof EVENTS.CONNECTION_RESUME | typeof EVENTS.ROOM_JOIN,
): void {
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
      roomState: RoomState.Waiting,
      sessionId: session.sessionId,
      joinCode: room.joinCode,
    });

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

  player.state = PlayerState.Ready;
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
    roomState: RoomState.Waiting,
    sessionId: session.sessionId,
    joinCode: room.joinCode,
    playerId: player.id,
    playerState: PlayerState.Ready,
  });

  broadcastToRoom(
    room,
    EVENTS.PLAYER_RECONNECTED,
    {
      roomId: room.id,
      playerId: player.id,
      playerState: PlayerState.Connected,
      connected: true,
    },
    { excludeSessionIds: new Set([session.sessionId]) },
  );

  broadcastLobbyUpdate(room);
}

function handleSocketClose(socket: TrackedWebSocket): void {
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

  const existingTimer = room.playerDisconnectTimers.get(session.sessionId);

  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  room.playerDisconnectTimers.set(
    session.sessionId,
    setTimeout(() => {
      removePlayerFromRoom(room, player.id);
    }, PLAYER_DISCONNECT_GRACE_MS),
  );

  logRoomEvent("player:disconnected", room, {
    sessionId: session.sessionId,
    playerId: player.id,
  });

  broadcastToRoom(room, EVENTS.PLAYER_DISCONNECTED, {
    roomId: room.id,
    playerId: player.id,
    playerState: PlayerState.Disconnected,
    connected: false,
  });

  broadcastLobbyUpdate(room);
}

function broadcastLobbyUpdate(room: RoomRecord): void {
  if (room.state === RoomState.Closed) {
    return;
  }

  broadcastToRoom(room, EVENTS.LOBBY_UPDATE, toLobbyUpdatePayload(room));
}

function broadcastToRoom<TEvent extends keyof import("@quiz/shared-protocol").ServerToClientEventPayloadMap>(
  room: RoomRecord,
  event: TEvent,
  payload: import("@quiz/shared-protocol").ServerToClientEventPayloadMap[TEvent],
  options?: {
    excludeSessionIds?: Set<string>;
  },
): void {
  const excludedSessions = options?.excludeSessionIds ?? new Set<string>();

  if (!excludedSessions.has(room.hostSessionId)) {
    const hostSession = sessionsById.get(room.hostSessionId);
    sendEvent(hostSession?.socket, event, payload);
  }

  for (const player of room.players) {
    if (excludedSessions.has(player.sessionId)) {
      continue;
    }

    const session = sessionsById.get(player.sessionId);
    sendEvent(session?.socket, event, payload);
  }
}

function attachSocketToSession(socket: TrackedWebSocket, session: SessionRecord): void {
  if (session.socket && session.socket !== socket) {
    const previousSocket = session.socket;
    previousSocket.sessionId = null;
    previousSocket.close(1000, "Session resumed elsewhere");
  }

  socket.sessionId = session.sessionId;
  socket.isAlive = true;
  session.socket = socket;
}

function removePlayerFromRoom(room: RoomRecord, playerId: string): void {
  const playerIndex = room.players.findIndex((entry) => entry.id === playerId);

  if (playerIndex < 0) {
    return;
  }

  const [player] = room.players.splice(playerIndex, 1);
  const disconnectTimer = room.playerDisconnectTimers.get(player.sessionId);

  if (disconnectTimer) {
    clearTimeout(disconnectTimer);
    room.playerDisconnectTimers.delete(player.sessionId);
  }

  const session = sessionsById.get(player.sessionId);

  if (session?.socket) {
    session.socket.sessionId = null;
    session.socket.close(1000, "Player removed from room");
  }

  sessionsById.delete(player.sessionId);
  room.lastActivityAt = Date.now();

  logRoomEvent("player:removed", room, {
    playerId,
  });

  broadcastLobbyUpdate(room);
}

function closeRoom(room: RoomRecord, reason: string): void {
  if (room.state === RoomState.Closed) {
    return;
  }

  room.state = RoomState.Closed;
  room.hostConnected = false;

  if (room.hostDisconnectTimer) {
    clearTimeout(room.hostDisconnectTimer);
    room.hostDisconnectTimer = null;
  }

  for (const disconnectTimer of room.playerDisconnectTimers.values()) {
    clearTimeout(disconnectTimer);
  }

  room.playerDisconnectTimers.clear();

  const socketsToClose: TrackedWebSocket[] = [];
  const hostSession = sessionsById.get(room.hostSessionId);

  if (hostSession?.socket) {
    socketsToClose.push(hostSession.socket);
  }

  for (const player of room.players) {
    const session = sessionsById.get(player.sessionId);

    if (session?.socket) {
      socketsToClose.push(session.socket);
    }
  }

  logRoomEvent("room:closed", room, { reason });

  for (const socket of socketsToClose) {
    sendEvent(socket, EVENTS.ROOM_CLOSED, {
      roomId: room.id,
      roomState: RoomState.Closed,
    });
  }

  roomIdByJoinCode.delete(room.joinCode);
  roomsById.delete(room.id);
  sessionsById.delete(room.hostSessionId);

  for (const player of room.players) {
    sessionsById.delete(player.sessionId);
  }

  for (const socket of socketsToClose) {
    socket.sessionId = null;
    socket.close(1000, reason);
  }
}

function getRoomByJoinCode(joinCode: string): RoomRecord | undefined {
  const roomId = roomIdByJoinCode.get(joinCode);
  return roomId ? roomsById.get(roomId) : undefined;
}

function generateUniqueJoinCode(): string {
  let joinCode = "";

  do {
    joinCode = Array.from({ length: JOIN_CODE_LENGTH }, () =>
      JOIN_CODE_ALPHABET[randomInt(0, JOIN_CODE_ALPHABET.length)],
    ).join("");
  } while (roomIdByJoinCode.has(joinCode));

  return joinCode;
}

function normalizeHostName(hostName: string): string {
  const normalizedName = normalizePlayerName(hostName);
  return normalizedName.length > 0 ? normalizedName : "Host";
}

function toKnownEventName(event: string | undefined): EventName | undefined {
  if (!event) {
    return undefined;
  }

  return Object.values(EVENTS).includes(event as EventName) ? (event as EventName) : undefined;
}

function logRoomEvent(
  event: string,
  room: RoomRecord,
  details: Record<string, ClientInfo | number | string | undefined>,
): void {
  console.log(event, {
    roomId: room.id,
    joinCode: room.joinCode,
    ...details,
  });
}

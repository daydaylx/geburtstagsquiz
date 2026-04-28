import { randomUUID } from "node:crypto";
import { randomInt } from "node:crypto";

import { EVENTS } from "@quiz/shared-protocol";
import { RoomState, type Player } from "@quiz/shared-types";
import { JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH, normalizePlayerName } from "@quiz/shared-utils";

import type { RoomRecord, SessionRecord, TrackedWebSocket } from "./server-types.js";
import { PROTOCOL_ERROR_CODES, sendEvent, sendProtocolError } from "./protocol.js";
import {
  roomsById,
  roomIdByJoinCode,
  roomIdByHostToken,
  sessionsById,
  logRoomEvent,
} from "./state.js";

function generateHostToken(): string {
  return randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
}

function generateDisplayToken(): string {
  return randomUUID();
}

export function generateUniqueJoinCode(): string {
  let joinCode = "";

  do {
    joinCode = Array.from(
      { length: JOIN_CODE_LENGTH },
      () => JOIN_CODE_ALPHABET[randomInt(0, JOIN_CODE_ALPHABET.length)],
    ).join("");
  } while (roomIdByJoinCode.has(joinCode));

  return joinCode;
}

export function closeRoom(room: RoomRecord, reason: string): void {
  if (room.state === RoomState.Closed) {
    return;
  }

  room.state = RoomState.Closed;
  room.hostConnected = false;
  room.displayConnected = false;

  if (room.displayDisconnectTimer) {
    clearTimeout(room.displayDisconnectTimer);
    room.displayDisconnectTimer = null;
  }

  if (room.hostDisconnectTimer) {
    clearTimeout(room.hostDisconnectTimer);
    room.hostDisconnectTimer = null;
  }

  if (room.questionTimer) {
    clearTimeout(room.questionTimer);
    room.questionTimer = null;
  }

  if (room.timerTickInterval) {
    clearInterval(room.timerTickInterval);
    room.timerTickInterval = null;
  }

  if (room.revealTimer) {
    clearTimeout(room.revealTimer);
    room.revealTimer = null;
  }

  for (const disconnectTimer of room.playerDisconnectTimers.values()) {
    clearTimeout(disconnectTimer);
  }

  room.playerDisconnectTimers.clear();

  const socketsToClose: TrackedWebSocket[] = [];

  if (room.displaySessionId) {
    const displaySession = sessionsById.get(room.displaySessionId);
    if (displaySession?.socket) {
      socketsToClose.push(displaySession.socket);
    }
  }

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
  if (room.hostToken) {
    roomIdByHostToken.delete(room.hostToken);
  }
  roomsById.delete(room.id);

  if (room.displaySessionId) {
    sessionsById.delete(room.displaySessionId);
  }
  sessionsById.delete(room.hostSessionId);

  for (const player of room.players) {
    sessionsById.delete(player.sessionId);
  }

  for (const socket of socketsToClose) {
    socket.sessionId = null;
    socket.close(1000, reason);
  }
}

export function removePlayerFromRoom(room: RoomRecord, playerId: string): void {
  const playerIndex = room.players.findIndex((entry) => entry.id === playerId);

  if (playerIndex < 0) {
    return;
  }

  const [player] = room.players.splice(playerIndex, 1);
  room.nextQuestionReadyPlayerIds.delete(player.id);
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
}

export function attachSocketToSession(socket: TrackedWebSocket, session: SessionRecord): void {
  if (session.socket && session.socket !== socket) {
    const previousSocket = session.socket;
    previousSocket.sessionId = null;
    previousSocket.close(1000, "Session resumed elsewhere");
  }

  socket.sessionId = session.sessionId;
  socket.isAlive = true;
  session.socket = socket;
}

export function handleDisplayCreateRoom(
  socket: TrackedWebSocket,
  payload: import("@quiz/shared-protocol").DisplayCreateRoomPayload,
): void {
  if (socket.sessionId) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.INVALID_STATE, "Socket is already assigned", {
      event: EVENTS.DISPLAY_CREATE_ROOM,
      roomId: null,
      questionId: null,
    });
    return;
  }

  const roomId = randomUUID();
  const displaySessionId = randomUUID();
  const joinCode = generateUniqueJoinCode();
  const hostToken = generateHostToken();
  const displayToken = generateDisplayToken();
  const now = Date.now();

  const room: RoomRecord = {
    id: roomId,
    joinCode,
    state: RoomState.Waiting,
    hostName: "",
    hostSessionId: "",
    hostConnected: false,
    displayConnected: true,
    hostToken,
    hostTokenUsed: false,
    displayToken,
    displaySessionId,
    settings: {
      showAnswerTextOnPlayerDevices: false,
    },
    players: [],
    quiz: null,
    currentQuestionIndex: null,
    gameState: null,
    createdAt: now,
    lastActivityAt: now,
    displayDisconnectTimer: null,
    hostDisconnectTimer: null,
    playerDisconnectTimers: new Map(),
    questionTimer: null,
    timerTickInterval: null,
    revealTimer: null,
    currentAnswers: new Map(),
    nextQuestionReadyPlayerIds: new Set(),
    questionStartedAt: null,
    lastRoundResult: null,
  };

  const session: SessionRecord = {
    sessionId: displaySessionId,
    role: "display",
    roomId,
    socket,
  };

  roomsById.set(roomId, room);
  roomIdByJoinCode.set(joinCode, roomId);
  roomIdByHostToken.set(hostToken, roomId);
  sessionsById.set(displaySessionId, session);
  attachSocketToSession(socket, session);

  logRoomEvent("display:create-room", room, {
    displaySessionId,
    clientInfo: payload.clientInfo,
  });

  sendEvent(socket, EVENTS.DISPLAY_ROOM_CREATED, {
    roomId,
    displaySessionId,
    displayToken,
    joinCode,
    hostToken,
  });
}

export function toKnownEventName(
  event: string | undefined,
): import("@quiz/shared-protocol").EventName | undefined {
  if (!event) {
    return undefined;
  }

  return Object.values(EVENTS).includes(event as import("@quiz/shared-protocol").EventName)
    ? (event as import("@quiz/shared-protocol").EventName)
    : undefined;
}

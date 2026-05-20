import { randomUUID } from "node:crypto";

import {
  type CategoryVotePayload,
  type DisplayConnectRoomPayload,
  EVENTS,
  type HostCreateRoomPayload,
  type ModeratorControlPayload,
} from "@quiz/shared-protocol";
import { GameState, type Player, PlayerState, RoomState } from "@quiz/shared-types";
import { normalizePlayerName } from "@quiz/shared-utils";
import {
  broadcastLobbyUpdate,
  broadcastToAllRoomClients,
  sendToDisplay,
  sendToHost,
  sendToPlayers,
  syncSessionToRoomState,
} from "./connection.js";
import { handleAnswerEligibilityChanged, handleScoreboardReadinessChanged } from "./game.js";
import { buildCatalogSummary } from "./game-plan.js";
import { PROTOCOL_ERROR_CODES, sendEvent, sendProtocolError } from "./protocol.js";
import { getDefaultQuiz } from "./quiz-data.js";
import { attachSocketToSession, generateDisplayToken, generateHostToken, generateUniqueJoinCode } from "./room.js";
import { createDefaultRoomSettings } from "./room-settings.js";
import type { RoomRecord, SessionRecord, TrackedWebSocket } from "./server-types.js";
import {
  getRoomByJoinCode,
  logRoomEvent,
  roomIdByHostToken,
  roomIdByJoinCode,
  roomsById,
  sessionsById,
} from "./state.js";

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

    if (existingSession && existingSession.role === "player" && existingSession.roomId === room.id) {
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

  if (room.hostTokenUsed && room.hostConnected) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.NOT_AUTHORIZED, "Host token already used", {
      event: EVENTS.HOST_CONNECT,
      roomId: room.id,
      questionId: null,
    });
    return;
  }

  // Cleanup old host session if it exists (e.g. from a disconnected previous session)
  if (room.hostSessionId) {
    const oldSession = sessionsById.get(room.hostSessionId);
    if (oldSession?.socket) {
      oldSession.socket.sessionId = null;
      oldSession.socket.close();
    }
    sessionsById.delete(room.hostSessionId);
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
    displayConnectToken: room.displayConnectToken,
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
      hostConnected: room.hostConnected,
      hostToken: room.hostTokenUsed ? null : room.hostToken,
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
      displayConnectToken: !room.displayConnected ? room.displayConnectToken : null,
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

  const disconnectTimer = room.playerDisconnectTimers.get(player.id);

  if (disconnectTimer) {
    clearTimeout(disconnectTimer);
    room.playerDisconnectTimers.delete(player.id);
  }

  if (room.state === RoomState.Waiting) {
    player.state = PlayerState.Ready;
  } else if (room.gameState === GameState.QuestionActive) {
    player.state = room.currentAnswers.has(player.id) ? PlayerState.Answered : PlayerState.Answering;
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
  handleAnswerEligibilityChanged(room);
  handleScoreboardReadinessChanged(room);
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
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.NOT_AUTHORIZED, "Only the host can update room settings", {
      event: EVENTS.ROOM_SETTINGS_UPDATE,
      roomId: room.id,
      questionId: null,
    });
    return;
  }

  if (room.state !== RoomState.Waiting) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.INVALID_STATE, "Room settings can only be changed in the lobby", {
      event: EVENTS.ROOM_SETTINGS_UPDATE,
      roomId: room.id,
      questionId: null,
    });
    return;
  }

  room.settings = {
    ...room.settings,
    showAnswerTextOnPlayerDevices: payload.showAnswerTextOnPlayerDevices,
    ...(payload.gamePlanDraft !== undefined ? { gamePlanDraft: payload.gamePlanDraft } : {}),
    ...(payload.moderatorEnabled !== undefined ? { moderatorEnabled: payload.moderatorEnabled } : {}),
    ...(payload.moderatorFrequency !== undefined ? { moderatorFrequency: payload.moderatorFrequency } : {}),
  };
  room.lastActivityAt = Date.now();

  logRoomEvent("room:settings:update", room, {
    showAnswerTextOnPlayerDevices: String(room.settings.showAnswerTextOnPlayerDevices),
  });

  broadcastLobbyUpdate(room);
}

export function handleModeratorControl(socket: TrackedWebSocket, payload: ModeratorControlPayload): void {
  const room = roomsById.get(payload.roomId);

  if (!room) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.ROOM_NOT_FOUND, "Room not found", {
      event: EVENTS.MODERATOR_CONTROL,
      roomId: payload.roomId,
      questionId: null,
    });
    return;
  }

  const session = socket.sessionId ? sessionsById.get(socket.sessionId) : null;

  if (!session || session.role !== "host" || session.roomId !== room.id) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.NOT_AUTHORIZED, "Only the host can send moderator control", {
      event: EVENTS.MODERATOR_CONTROL,
      roomId: room.id,
      questionId: null,
    });
    return;
  }

  sendToDisplay(room, EVENTS.MODERATOR_CONTROL, { roomId: room.id, action: payload.action });
}

function tallyVotes(categoryVotes: Map<string, string>): Record<string, number> {
  const tally: Record<string, number> = {};
  for (const categoryId of categoryVotes.values()) {
    tally[categoryId] = (tally[categoryId] ?? 0) + 1;
  }
  return tally;
}

export function handleCategoryVote(socket: TrackedWebSocket, payload: CategoryVotePayload): void {
  const session = socket.sessionId ? sessionsById.get(socket.sessionId) : null;

  if (!session || session.role !== "player" || !session.playerId) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.NOT_AUTHORIZED, "Only players can vote", {
      event: EVENTS.CATEGORY_VOTE,
      roomId: payload.roomId,
      questionId: null,
    });
    return;
  }

  if (session.roomId !== payload.roomId) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.NOT_AUTHORIZED, "Player is not in this room", {
      event: EVENTS.CATEGORY_VOTE,
      roomId: payload.roomId,
      questionId: null,
    });
    return;
  }

  const room = roomsById.get(payload.roomId);

  if (!room) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.ROOM_NOT_FOUND, "Room not found", {
      event: EVENTS.CATEGORY_VOTE,
      roomId: payload.roomId,
      questionId: null,
    });
    return;
  }

  if (room.state !== RoomState.Waiting) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.INVALID_STATE, "Voting only allowed in lobby", {
      event: EVENTS.CATEGORY_VOTE,
      roomId: room.id,
      questionId: null,
    });
    return;
  }

  const quiz = getDefaultQuiz();
  const categoryExists = quiz.categories.some((c) => c.id === payload.categoryId);

  if (!categoryExists) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.INVALID_PAYLOAD, `Unknown category: ${payload.categoryId}`, {
      event: EVENTS.CATEGORY_VOTE,
      roomId: room.id,
      questionId: null,
    });
    return;
  }

  room.categoryVotes.set(session.playerId, payload.categoryId);
  room.lastActivityAt = Date.now();

  broadcastToAllRoomClients(room, EVENTS.VOTE_UPDATE, {
    roomId: room.id,
    votes: tallyVotes(room.categoryVotes),
  });
}

export function handleHostCreateRoom(socket: TrackedWebSocket, payload: HostCreateRoomPayload): void {
  if (socket.sessionId) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.INVALID_STATE, "Socket is already assigned", {
      event: EVENTS.HOST_CREATE_ROOM,
      roomId: null,
      questionId: null,
    });
    return;
  }

  const roomId = randomUUID();
  const hostSessionId = randomUUID();
  const joinCode = generateUniqueJoinCode();
  const hostToken = generateHostToken();
  const displayToken = generateDisplayToken();
  const displayConnectToken = randomUUID();
  const now = Date.now();

  const room: RoomRecord = {
    id: roomId,
    joinCode,
    state: RoomState.Waiting,
    hostSessionId,
    hostConnected: true,
    displayConnected: false,
    hostToken,
    hostTokenUsed: true,
    displayToken,
    displaySessionId: null,
    displayConnectToken,
    displayConnectTokenUsed: false,
    settings: createDefaultRoomSettings(),
    players: [],
    quiz: null,
    currentQuestionIndex: null,
    gameState: null,
    createdAt: now,
    lastActivityAt: now,
    displayDisconnectTimer: null,
    hostDisconnectTimer: null,
    playerDisconnectTimers: new Map(),
    countdownTimer: null,
    countdownStartedAt: null,
    questionTimer: null,
    timerTickInterval: null,
    revealTimer: null,
    revealDelayTimer: null,
    completedRoomTtlTimer: null,
    currentAnswers: new Map(),
    nextQuestionReadyPlayerIds: new Set(),
    questionStartedAt: null,
    lastRoundResult: null,
    lastScoreChanges: [],
    completedRoundResults: [],
    completedAnswers: [],
    categoryVotes: new Map(),
  };

  const session: SessionRecord = {
    sessionId: hostSessionId,
    role: "host",
    roomId,
    socket,
  };

  roomsById.set(roomId, room);
  roomIdByJoinCode.set(joinCode, roomId);
  roomIdByHostToken.set(hostToken, roomId);
  sessionsById.set(hostSessionId, session);
  attachSocketToSession(socket, session);

  logRoomEvent("host:create-room", room, {
    hostSessionId,
    clientInfo: payload.clientInfo,
  });

  sendEvent(socket, EVENTS.HOST_ROOM_CREATED, {
    roomId,
    hostSessionId,
    joinCode,
    displayConnectToken,
  });
  sendEvent(socket, EVENTS.CATALOG_SUMMARY, buildCatalogSummary(getDefaultQuiz()));
}

export function handleDisplayConnectRoom(socket: TrackedWebSocket, payload: DisplayConnectRoomPayload): void {
  if (socket.sessionId) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.INVALID_STATE, "Socket is already assigned", {
      event: EVENTS.DISPLAY_CONNECT_ROOM,
      roomId: null,
      questionId: null,
    });
    return;
  }

  const room = roomsById.get(payload.roomId);

  if (!room) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.ROOM_NOT_FOUND, "Room not found", {
      event: EVENTS.DISPLAY_CONNECT_ROOM,
      roomId: payload.roomId,
      questionId: null,
    });
    return;
  }

  if (
    !room.displayConnectToken ||
    room.displayConnectToken !== payload.displayConnectToken ||
    (room.displayConnectTokenUsed && room.displayConnected)
  ) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.NOT_AUTHORIZED, "Invalid or already used display connect token", {
      event: EVENTS.DISPLAY_CONNECT_ROOM,
      roomId: room.id,
      questionId: null,
    });
    return;
  }

  if (room.state !== RoomState.Waiting) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.INVALID_STATE, "Cannot connect display after game has started", {
      event: EVENTS.DISPLAY_CONNECT_ROOM,
      roomId: room.id,
      questionId: null,
    });
    return;
  }

  // Cleanup old display session if it exists
  if (room.displaySessionId) {
    const oldSession = sessionsById.get(room.displaySessionId);
    if (oldSession?.socket) {
      oldSession.socket.sessionId = null;
      oldSession.socket.close();
    }
    sessionsById.delete(room.displaySessionId);
  }

  const displaySessionId = randomUUID();
  const displayToken = randomUUID();
  const now = Date.now();

  const session: SessionRecord = {
    sessionId: displaySessionId,
    role: "display",
    roomId: room.id,
    socket,
  };

  room.displaySessionId = displaySessionId;
  room.displayToken = displayToken;
  room.displayConnected = true;
  room.displayConnectTokenUsed = true;
  room.lastActivityAt = now;

  sessionsById.set(displaySessionId, session);
  attachSocketToSession(socket, session);

  logRoomEvent("display:connect-room", room, { displaySessionId });

  sendEvent(socket, EVENTS.DISPLAY_ROOM_CONNECTED, {
    roomId: room.id,
    displaySessionId,
    displayToken,
    joinCode: room.joinCode,
    hostConnected: room.hostConnected,
  });

  sendToHost(room, EVENTS.HOST_DISPLAY_PAIRED, { displayConnected: true });
  broadcastLobbyUpdate(room);
}

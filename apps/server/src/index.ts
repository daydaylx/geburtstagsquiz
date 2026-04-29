import { randomUUID } from "node:crypto";
import { createServer } from "node:http";

import { WebSocketServer } from "ws";

import { EVENTS, parseClientToServerEnvelope, type EventName } from "@quiz/shared-protocol";
import { type ClientRole } from "@quiz/shared-types";

import { HEARTBEAT_INTERVAL_MS, HOST, PORT, isOriginAllowed } from "./config.js";
import { PROTOCOL_ERROR_CODES, sendEvent, sendProtocolError } from "./protocol.js";
import type { TrackedWebSocket } from "./server-types.js";
import { roomsById, sessionsById } from "./state.js";
import { toKnownEventName, closeRoom, handleDisplayCreateRoom } from "./room.js";
import {
  handleRoomJoin,
  handleConnectionResume,
  handleRoomSettingsUpdate,
  handleHostConnect,
} from "./lobby.js";
import { handleSocketClose } from "./session.js";
import {
  handleGameStart,
  handleGameNextQuestion,
  handleGameShowScoreboard,
  handleGameFinishNow,
  handlePlayerRemove,
  handleQuestionForceClose,
  handleAnswerSubmit,
  handleNextQuestionReady,
} from "./game.js";

const server = createServer((request, response) => {
  const origin = request.headers.origin;
  const originAllowed = isOriginAllowed(origin);

  if (origin && originAllowed) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (request.method === "OPTIONS") {
    response.writeHead(originAllowed ? 204 : 403);
    response.end();
    return;
  }

  if (request.url === "/health") {
    response.writeHead(originAllowed ? 200 : 403, {
      "Content-Type": "application/json; charset=utf-8",
    });
    response.end(
      JSON.stringify({
        ok: originAllowed,
        status: originAllowed ? "ok" : "forbidden",
        service: "geburtstagsquiz-server",
        time: new Date().toISOString(),
      }),
    );
    return;
  }

  response.writeHead(originAllowed ? 200 : 403, {
    "Content-Type": "text/plain; charset=utf-8",
  });
  response.end(originAllowed ? "Quiz Server – Lobby Phase" : "Forbidden origin");
});

const websocketServer = new WebSocketServer({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  if (!isOriginAllowed(request.headers.origin)) {
    socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }

  websocketServer.handleUpgrade(request, socket, head, (websocket) => {
    const trackedSocket = websocket as TrackedWebSocket;
    trackedSocket.connectionId = randomUUID();
    trackedSocket.isAlive = true;
    trackedSocket.sessionId = null;

    websocketServer.emit("connection", trackedSocket, request);
  });
});

websocketServer.on("connection", (websocket, request) => {
  const socket = websocket as TrackedWebSocket;

  console.log("socket:connected", {
    connectionId: socket.connectionId,
    remoteAddress: request.socket.remoteAddress,
  });

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

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Server port ${PORT} is already in use.`);
  } else if (error.code === "EPERM") {
    console.error(
      `Server is not allowed to listen on ${HOST ?? "0.0.0.0"}:${PORT}. ` +
        "Run it outside a restricted sandbox or adjust HOST/PORT.",
    );
  } else {
    console.error("Server failed to start", error);
  }

  process.exit(1);
});

const logServerStarted = () => {
  console.log(`Server running on ${HOST ?? "0.0.0.0"}:${PORT}`);
};

if (HOST) {
  server.listen(PORT, HOST, logServerStarted);
} else {
  server.listen(PORT, logServerStarted);
}

export function isEventAllowedForRole(event: EventName, role: ClientRole | null): boolean {
  const hostOnlyEvents: EventName[] = [
    EVENTS.GAME_START,
    EVENTS.GAME_NEXT_QUESTION,
    EVENTS.QUESTION_FORCE_CLOSE,
    EVENTS.GAME_SHOW_SCOREBOARD,
    EVENTS.GAME_FINISH_NOW,
    EVENTS.PLAYER_REMOVE,
    EVENTS.ROOM_SETTINGS_UPDATE,
    EVENTS.ROOM_CLOSE,
  ];
  const playerOnlyEvents: EventName[] = [EVENTS.ANSWER_SUBMIT, EVENTS.NEXT_QUESTION_READY];
  const displayOnlyEvents: EventName[] = [EVENTS.DISPLAY_CREATE_ROOM];

  if (role === "display") {
    return ![...hostOnlyEvents, ...playerOnlyEvents].includes(event);
  }
  if (role === "host") {
    return ![...playerOnlyEvents, ...displayOnlyEvents].includes(event);
  }
  if (role === "player") {
    return ![...hostOnlyEvents, ...displayOnlyEvents, EVENTS.HOST_CONNECT].includes(event);
  }
  return true;
}

function handleSocketMessage(socket: TrackedWebSocket, rawMessage: string): void {
  const parsedEnvelope = parseClientToServerEnvelope(rawMessage);

  if (!parsedEnvelope.success) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.INVALID_PAYLOAD, parsedEnvelope.error, {
      event: toKnownEventName(parsedEnvelope.event),
      roomId: null,
      questionId: null,
    });
    return;
  }

  const event = parsedEnvelope.data.event;
  const session = socket.sessionId ? sessionsById.get(socket.sessionId) : null;
  const role = session?.role ?? null;

  if (!isEventAllowedForRole(event, role)) {
    sendProtocolError(
      socket,
      PROTOCOL_ERROR_CODES.NOT_AUTHORIZED,
      `Event '${event}' is not allowed for role '${role ?? "none"}'`,
      { event, roomId: null, questionId: null },
    );
    return;
  }

  switch (event) {
    case EVENTS.DISPLAY_CREATE_ROOM:
      handleDisplayCreateRoom(socket, parsedEnvelope.data.payload);
      return;

    case EVENTS.HOST_CONNECT:
      handleHostConnect(socket, parsedEnvelope.data.payload);
      return;

    case EVENTS.ROOM_JOIN:
      handleRoomJoin(socket, parsedEnvelope.data.payload);
      return;

    case EVENTS.ROOM_SETTINGS_UPDATE:
      handleRoomSettingsUpdate(socket, parsedEnvelope.data.payload);
      return;

    case EVENTS.CONNECTION_RESUME:
      handleConnectionResume(socket, parsedEnvelope.data.payload);
      return;

    case EVENTS.ROOM_CLOSE:
      handleRoomClose(socket, parsedEnvelope.data.payload.roomId);
      return;

    case EVENTS.GAME_START:
      handleGameStart(socket, parsedEnvelope.data.payload);
      return;

    case EVENTS.GAME_NEXT_QUESTION:
      handleGameNextQuestion(socket, parsedEnvelope.data.payload.roomId);
      return;

    case EVENTS.QUESTION_FORCE_CLOSE:
      handleQuestionForceClose(socket, parsedEnvelope.data.payload.roomId);
      return;

    case EVENTS.GAME_SHOW_SCOREBOARD:
      handleGameShowScoreboard(socket, parsedEnvelope.data.payload.roomId);
      return;

    case EVENTS.GAME_FINISH_NOW:
      handleGameFinishNow(socket, parsedEnvelope.data.payload.roomId);
      return;

    case EVENTS.PLAYER_REMOVE:
      handlePlayerRemove(socket, parsedEnvelope.data.payload);
      return;

    case EVENTS.ANSWER_SUBMIT:
      handleAnswerSubmit(socket, parsedEnvelope.data.payload);
      return;

    case EVENTS.NEXT_QUESTION_READY:
      handleNextQuestionReady(socket, parsedEnvelope.data.payload);
      return;
  }
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
    sendProtocolError(
      socket,
      PROTOCOL_ERROR_CODES.NOT_AUTHORIZED,
      "Only the host can close a room",
      {
        event: EVENTS.ROOM_CLOSE,
        roomId,
        questionId: null,
      },
    );
    return;
  }

  closeRoom(room, "Room closed by host");
}

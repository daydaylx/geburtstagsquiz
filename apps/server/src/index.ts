import { randomUUID } from "node:crypto";
import { createServer } from "node:http";

import { WebSocketServer } from "ws";

import { EVENTS, parseClientToServerEnvelope } from "@quiz/shared-protocol";

import { HEARTBEAT_INTERVAL_MS, PORT } from "./config.js";
import { PROTOCOL_ERROR_CODES, sendEvent, sendProtocolError } from "./protocol.js";
import type { TrackedWebSocket } from "./server-types.js";
import { roomsById, sessionsById } from "./state.js";
import { toKnownEventName, createRoom, closeRoom } from "./room.js";
import { handleRoomJoin, handleConnectionResume } from "./lobby.js";
import { handleSocketClose } from "./session.js";
import { handleGameStart, handleGameNextQuestion, handleAnswerSubmit } from "./game.js";

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
      createRoom(socket, parsedEnvelope.data.payload);
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
      handleGameStart(socket, parsedEnvelope.data.payload.roomId);
      return;

    case EVENTS.GAME_NEXT_QUESTION:
      handleGameNextQuestion(socket, parsedEnvelope.data.payload.roomId);
      return;

    case EVENTS.ANSWER_SUBMIT:
      handleAnswerSubmit(socket, parsedEnvelope.data.payload);
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
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.NOT_AUTHORIZED, "Only the host can close a room", {
      event: EVENTS.ROOM_CLOSE,
      roomId,
      questionId: null,
    });
    return;
  }

  closeRoom(room, "Room closed by host");
}

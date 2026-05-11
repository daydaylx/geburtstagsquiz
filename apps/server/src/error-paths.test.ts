import { EVENTS, PROTOCOL_ERROR_CODES } from "@quiz/shared-protocol";
import type { Question } from "@quiz/shared-types";
import { GameState, PlayerState, QuestionType } from "@quiz/shared-types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { handleAnswerSubmit, handleGameStart } from "./game.js";
import { buildCatalogSummary, buildDefaultGamePlan } from "./game-plan.js";
import { handleConnectionResume, handleHostConnect, handleRoomJoin } from "./lobby.js";
import { getDefaultQuiz } from "./quiz-data.js";
import { handleDisplayCreateRoom } from "./room.js";
import type { RoomRecord, SessionRecord, TrackedWebSocket } from "./server-types.js";
import { roomIdByHostToken, roomIdByJoinCode, roomsById, sessionsById } from "./state.js";

function makeMockSocket(): TrackedWebSocket {
  const sent: any[] = [];
  return {
    connectionId: `conn-${Math.random().toString(36).slice(2)}`,
    isAlive: true,
    sessionId: null,
    readyState: WebSocket.OPEN,
    send: (data: string) => sent.push(JSON.parse(data)),
    close: vi.fn(),
    ping: vi.fn(),
    _sent: sent,
  } as unknown as TrackedWebSocket;
}

function getSentEvents(socket: TrackedWebSocket): string[] {
  return (socket as any)._sent.map((msg: any) => msg.event);
}

function getSentPayload(socket: TrackedWebSocket, event: string): any {
  const matches = (socket as any)._sent.filter((msg: any) => msg.event === event);
  return matches.length > 0 ? matches[matches.length - 1].payload : undefined;
}

function makeTestGamePlan() {
  const catalog = buildCatalogSummary(getDefaultQuiz());
  return {
    ...buildDefaultGamePlan(catalog),
    questionCount: 2,
    enableDemoQuestion: false,
    displayShowLevel: "minimal" as const,
  };
}

describe("Error paths – join", () => {
  let room: RoomRecord;
  let hostSocket: TrackedWebSocket;
  let playerSocket: TrackedWebSocket;

  beforeEach(() => {
    vi.useFakeTimers();
    roomsById.clear();
    roomIdByJoinCode.clear();
    roomIdByHostToken.clear();
    sessionsById.clear();

    const displaySocket = makeMockSocket();
    handleDisplayCreateRoom(displaySocket, {});
    room = roomsById.values().next().value as RoomRecord;

    hostSocket = makeMockSocket();
    handleHostConnect(hostSocket, { hostToken: room.hostToken });

    playerSocket = makeMockSocket();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("rejects join with unknown join code", () => {
    handleRoomJoin(playerSocket, { joinCode: "XXXXX", playerName: "Ghost" });

    const events = getSentEvents(playerSocket);
    expect(events).toContain(EVENTS.ERROR_PROTOCOL);

    const errorPayload = getSentPayload(playerSocket, EVENTS.ERROR_PROTOCOL);
    expect(errorPayload.code).toBe(PROTOCOL_ERROR_CODES.ROOM_NOT_FOUND);
  });

  it("rejects host connect with invalid host token", () => {
    const badSocket = makeMockSocket();
    handleHostConnect(badSocket, { hostToken: "not-a-real-token" });

    const events = getSentEvents(badSocket);
    expect(events).toContain(EVENTS.ERROR_PROTOCOL);

    const errorPayload = getSentPayload(badSocket, EVENTS.ERROR_PROTOCOL);
    expect(errorPayload.code).toBe(PROTOCOL_ERROR_CODES.NOT_AUTHORIZED);
  });

  it("rejects host connect with already-used host token", () => {
    // First connection already consumed the token in beforeEach
    const secondHostSocket = makeMockSocket();
    handleHostConnect(secondHostSocket, { hostToken: room.hostToken });

    const events = getSentEvents(secondHostSocket);
    expect(events).toContain(EVENTS.ERROR_PROTOCOL);

    const errorPayload = getSentPayload(secondHostSocket, EVENTS.ERROR_PROTOCOL);
    expect(errorPayload.code).toBe(PROTOCOL_ERROR_CODES.NOT_AUTHORIZED);
  });
});

describe("Error paths – connection resume", () => {
  let room: RoomRecord;

  beforeEach(() => {
    vi.useFakeTimers();
    roomsById.clear();
    roomIdByJoinCode.clear();
    roomIdByHostToken.clear();
    sessionsById.clear();

    const displaySocket = makeMockSocket();
    handleDisplayCreateRoom(displaySocket, {});
    room = roomsById.values().next().value as RoomRecord;
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("rejects resume with unknown sessionId", () => {
    const socket = makeMockSocket();
    handleConnectionResume(socket, { sessionId: "fake-session-id", roomId: room.id });

    const events = getSentEvents(socket);
    expect(events).toContain(EVENTS.ERROR_PROTOCOL);

    const errorPayload = getSentPayload(socket, EVENTS.ERROR_PROTOCOL);
    expect(errorPayload.code).toBe(PROTOCOL_ERROR_CODES.SESSION_NOT_FOUND);
  });

  it("rejects resume with unknown roomId", () => {
    const hostToken = room.hostToken;
    const hostSocket = makeMockSocket();
    handleHostConnect(hostSocket, { hostToken });
    const hostSessionId = room.hostSessionId;

    const socket = makeMockSocket();
    handleConnectionResume(socket, { sessionId: hostSessionId, roomId: "nonexistent-room" });

    const events = getSentEvents(socket);
    expect(events).toContain(EVENTS.ERROR_PROTOCOL);

    const errorPayload = getSentPayload(socket, EVENTS.ERROR_PROTOCOL);
    expect(errorPayload.code).toBe(PROTOCOL_ERROR_CODES.ROOM_NOT_FOUND);
  });
});

describe("Error paths – answer submission", () => {
  let room: RoomRecord;
  let hostSocket: TrackedWebSocket;
  let playerSocket: TrackedWebSocket;
  let playerSession: SessionRecord;
  let question: Question;

  beforeEach(() => {
    vi.useFakeTimers();
    roomsById.clear();
    roomIdByJoinCode.clear();
    roomIdByHostToken.clear();
    sessionsById.clear();

    const displaySocket = makeMockSocket();
    handleDisplayCreateRoom(displaySocket, {});
    room = roomsById.values().next().value as RoomRecord;

    hostSocket = makeMockSocket();
    handleHostConnect(hostSocket, { hostToken: room.hostToken });

    playerSocket = makeMockSocket();
    handleRoomJoin(playerSocket, { joinCode: room.joinCode, playerName: "Tester" });

    playerSession = [...sessionsById.values()].find((s) => s.role === "player")!;

    hostSocket.sessionId = room.hostSessionId;
    handleGameStart(hostSocket, { roomId: room.id, gamePlan: makeTestGamePlan() });

    question = room.quiz!.questions[0];
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("rejects a second answer from the same player", () => {
    playerSocket.sessionId = playerSession.sessionId;
    const answer = {
      type: "option" as const,
      value:
        question.type === QuestionType.MultipleChoice ||
        question.type === QuestionType.Logic ||
        question.type === QuestionType.MajorityGuess
          ? question.options[0].id
          : "A",
    };

    handleAnswerSubmit(playerSocket, {
      roomId: room.id,
      questionId: question.id,
      playerId: playerSession.playerId!,
      answer,
      requestId: "req-1",
    });

    expect(getSentEvents(playerSocket)).toContain(EVENTS.ANSWER_ACCEPTED);

    (playerSocket as any)._sent.length = 0;

    handleAnswerSubmit(playerSocket, {
      roomId: room.id,
      questionId: question.id,
      playerId: playerSession.playerId!,
      answer,
      requestId: "req-2",
    });

    expect(getSentEvents(playerSocket)).toContain(EVENTS.ANSWER_REJECTED);
  });

  it("sends protocol error for a stale question ID", () => {
    playerSocket.sessionId = playerSession.sessionId;

    handleAnswerSubmit(playerSocket, {
      roomId: room.id,
      questionId: "wrong-question-id",
      playerId: playerSession.playerId!,
      answer: { type: "option" as const, value: "A" },
      requestId: "req-stale",
    });

    const errorPayload = getSentPayload(playerSocket, EVENTS.ERROR_PROTOCOL);
    expect(errorPayload).toBeDefined();
    expect(errorPayload.code).toBe(PROTOCOL_ERROR_CODES.INVALID_STATE);
    expect(getSentEvents(playerSocket)).not.toContain(EVENTS.ANSWER_ACCEPTED);
  });
});

describe("Error paths – player reconnect during question", () => {
  let room: RoomRecord;
  let hostSocket: TrackedWebSocket;
  let playerSocket: TrackedWebSocket;
  let playerSession: SessionRecord;
  let question: Question;

  beforeEach(() => {
    vi.useFakeTimers();
    roomsById.clear();
    roomIdByJoinCode.clear();
    roomIdByHostToken.clear();
    sessionsById.clear();

    const displaySocket = makeMockSocket();
    handleDisplayCreateRoom(displaySocket, {});
    room = roomsById.values().next().value as RoomRecord;

    hostSocket = makeMockSocket();
    handleHostConnect(hostSocket, { hostToken: room.hostToken });

    playerSocket = makeMockSocket();
    handleRoomJoin(playerSocket, { joinCode: room.joinCode, playerName: "Reconnector" });

    playerSession = [...sessionsById.values()].find((s) => s.role === "player")!;

    hostSocket.sessionId = room.hostSessionId;
    handleGameStart(hostSocket, { roomId: room.id, gamePlan: makeTestGamePlan() });

    question = room.quiz!.questions[0];
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("player reconnect mid-question receives question:show state", () => {
    expect(room.gameState).toBe(GameState.QuestionActive);

    const newSocket = makeMockSocket();
    handleConnectionResume(newSocket, {
      sessionId: playerSession.sessionId,
      roomId: room.id,
    });

    const events = getSentEvents(newSocket);
    expect(events).toContain(EVENTS.CONNECTION_RESUMED);
    // Players get QUESTION_CONTROLLER (not QUESTION_SHOW which is for display/host)
    expect(events).toContain(EVENTS.QUESTION_CONTROLLER);
  });

  it("player reconnect after answering receives accepted state", () => {
    playerSocket.sessionId = playerSession.sessionId;

    const answer:
      | { type: "option"; value: string }
      | { type: "number"; value: number }
      | { type: "text"; value: string } =
      "options" in question
        ? { type: "option", value: (question as any).options[0].id }
        : "correctValue" in question
          ? { type: "number", value: (question as any).correctValue }
          : { type: "text", value: "test" };

    handleAnswerSubmit(playerSocket, {
      roomId: room.id,
      questionId: question.id,
      playerId: playerSession.playerId!,
      answer,
      requestId: "req-before-reconnect",
    });

    const newSocket = makeMockSocket();
    handleConnectionResume(newSocket, {
      sessionId: playerSession.sessionId,
      roomId: room.id,
    });

    const resumePayload = getSentPayload(newSocket, EVENTS.CONNECTION_RESUMED);
    expect(resumePayload).toBeDefined();
    expect(resumePayload.playerState).toBe(PlayerState.Answered);
  });
});

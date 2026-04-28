import { WebSocket } from "ws";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import { EVENTS } from "@quiz/shared-protocol";
import { GameState, PlayerState, RoomState, QuestionType } from "@quiz/shared-types";
import type { Question } from "@quiz/shared-types";

import { roomsById, roomIdByJoinCode, roomIdByHostToken, sessionsById } from "./state.js";
import { handleDisplayCreateRoom } from "./room.js";
import { handleHostConnect, handleRoomJoin } from "./lobby.js";
import { handleGameStart, handleAnswerSubmit, handleNextQuestionReady } from "./game.js";
import { syncSessionToRoomState } from "./connection.js";
import { QUESTION_DURATION_MS, REVEAL_DURATION_MS } from "./config.js";
import type { RoomRecord, TrackedWebSocket, SessionRecord } from "./server-types.js";

function makeMockSocket(): TrackedWebSocket {
  const sent: any[] = [];
  const socket = {
    connectionId: "conn-" + Math.random().toString(36).slice(2),
    isAlive: true,
    sessionId: null,
    readyState: WebSocket.OPEN,
    send: (data: string) => {
      sent.push(JSON.parse(data));
    },
    close: vi.fn(),
    ping: vi.fn(),
    _sent: sent,
  };
  return socket as unknown as TrackedWebSocket;
}

function getSentEvents(socket: TrackedWebSocket): string[] {
  return (socket as any)._sent.map((msg: any) => msg.event);
}

function getSentPayload(socket: TrackedWebSocket, event: string): any {
  const matches = (socket as any)._sent.filter((msg: any) => msg.event === event);
  return matches.length > 0 ? matches[matches.length - 1].payload : undefined;
}

function getPlayerSession(): SessionRecord {
  const playerSession = [...sessionsById.values()].find((session) => session.role === "player");
  if (!playerSession) throw new Error("Expected player session");
  return playerSession;
}

function makeAnswerForQuestion(question: Question): any {
  if (
    question.type === QuestionType.MultipleChoice ||
    question.type === QuestionType.Logic ||
    question.type === QuestionType.MajorityGuess
  ) {
    return { type: "option", value: question.options[0].id };
  }

  if (question.type === QuestionType.Estimate) {
    return { type: "number", value: 42 };
  }

  if (question.type === QuestionType.Ranking) {
    return { type: "ranking", value: question.items.map((item) => item.id) };
  }

  return { type: "text", value: "some text" };
}

function startGameWithOnePlayer(
  room: RoomRecord,
  hostSocket: TrackedWebSocket,
  playerSocket: TrackedWebSocket,
): { playerSession: SessionRecord; question: Question } {
  handleRoomJoin(playerSocket, { joinCode: room.joinCode, playerName: "Player 1" });
  const playerSession = getPlayerSession();

  hostSocket.sessionId = room.hostSessionId;
  handleGameStart(hostSocket, room.id);

  const question = room.quiz!.questions[0];
  room.quiz!.questions = [question];

  return { playerSession, question };
}

function submitAnswer(
  room: RoomRecord,
  playerSocket: TrackedWebSocket,
  playerSession: SessionRecord,
  question: Question,
): void {
  playerSocket.sessionId = playerSession.sessionId;
  handleAnswerSubmit(playerSocket, {
    roomId: room.id,
    questionId: question.id,
    playerId: playerSession.playerId!,
    answer: makeAnswerForQuestion(question),
    requestId: "req-1",
  });
}

describe("Display Broadcast Logic", () => {
  let displaySocket: TrackedWebSocket;
  let hostSocket: TrackedWebSocket;
  let playerSocket: TrackedWebSocket;
  let room: RoomRecord;

  beforeEach(() => {
    vi.useFakeTimers();
    roomsById.clear();
    roomIdByJoinCode.clear();
    roomIdByHostToken.clear();
    sessionsById.clear();

    displaySocket = makeMockSocket();
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

  it("sends lobby:update to display when a player joins", () => {
    // Clear initial lobby update from host connect
    (displaySocket as any)._sent.length = 0;

    handleRoomJoin(playerSocket, { joinCode: room.joinCode, playerName: "Player 1" });

    const events = getSentEvents(displaySocket);
    expect(events).toContain(EVENTS.LOBBY_UPDATE);

    const payload = getSentPayload(displaySocket, EVENTS.LOBBY_UPDATE);
    expect(payload.playerCount).toBe(1);
    expect(payload.players[0].name).toBe("Player 1");
    expect(payload.hostConnected).toBe(true);
    expect(payload.displayConnected).toBe(true);
    expect(payload).not.toHaveProperty("hostToken");
    expect(payload).not.toHaveProperty("displayToken");
    expect(payload).not.toHaveProperty("displaySessionId");
  });

  it("sends game:started and question:show to display when game starts", () => {
    startGameWithOnePlayer(room, hostSocket, playerSocket);

    const events = getSentEvents(displaySocket);
    expect(events).toContain(EVENTS.GAME_STARTED);
    expect(events).toContain(EVENTS.QUESTION_SHOW);

    const questionPayload = getSentPayload(displaySocket, EVENTS.QUESTION_SHOW);
    expect(questionPayload.text).toBeTruthy();
  });

  it("sends question:timer to display while a question is active", () => {
    startGameWithOnePlayer(room, hostSocket, playerSocket);
    (displaySocket as any)._sent.length = 0;

    vi.advanceTimersByTime(500);

    const timerPayload = getSentPayload(displaySocket, EVENTS.QUESTION_TIMER);
    expect(timerPayload).toBeDefined();
    expect(timerPayload.roomId).toBe(room.id);
    expect(timerPayload.remainingMs).toBeGreaterThanOrEqual(0);
  });

  it("sends answer:progress to display when player submits answer", () => {
    const { playerSession, question } = startGameWithOnePlayer(room, hostSocket, playerSocket);

    (displaySocket as any)._sent.length = 0;
    submitAnswer(room, playerSocket, playerSession, question);

    const payload = getSentPayload(displaySocket, EVENTS.ANSWER_PROGRESS);
    expect(payload.answeredCount).toBe(1);
    expect(payload.totalEligiblePlayers).toBe(1);
  });

  it("sends question:reveal to display after all answers are in", () => {
    const { playerSession, question } = startGameWithOnePlayer(room, hostSocket, playerSocket);

    (displaySocket as any)._sent.length = 0;
    submitAnswer(room, playerSocket, playerSession, question);

    const revealPayload = getSentPayload(displaySocket, EVENTS.QUESTION_REVEAL);
    expect(revealPayload).toBeDefined();
    expect(revealPayload.questionId).toBe(question.id);
    expect(revealPayload.correctAnswer).toBeDefined();
  });

  it("sends score:update to display after reveal", () => {
    const { playerSession, question } = startGameWithOnePlayer(room, hostSocket, playerSocket);
    submitAnswer(room, playerSocket, playerSession, question);

    (displaySocket as any)._sent.length = 0;
    vi.advanceTimersByTime(REVEAL_DURATION_MS);

    const scorePayload = getSentPayload(displaySocket, EVENTS.SCORE_UPDATE);
    expect(scorePayload).toBeDefined();
    expect(scorePayload.questionId).toBe(question.id);
    expect(scorePayload.scoreboard).toHaveLength(1);
  });

  it("sends game:finished to display after the final scoreboard ready state", () => {
    const { playerSession, question } = startGameWithOnePlayer(room, hostSocket, playerSocket);
    submitAnswer(room, playerSocket, playerSession, question);
    vi.advanceTimersByTime(REVEAL_DURATION_MS);

    (displaySocket as any)._sent.length = 0;
    playerSocket.sessionId = playerSession.sessionId;
    handleNextQuestionReady(playerSocket, {
      roomId: room.id,
      questionId: question.id,
      playerId: playerSession.playerId!,
    });

    const finishedPayload = getSentPayload(displaySocket, EVENTS.GAME_FINISHED);
    expect(finishedPayload).toBeDefined();
    expect(finishedPayload.roomState).toBe(RoomState.Completed);
    expect(finishedPayload.finalScoreboard).toHaveLength(1);
  });

  it("includes explanation in reveal snapshot during reconnect", () => {
    const question: Question = {
      id: "q1",
      type: QuestionType.MultipleChoice,
      text: "Test?",
      options: [{ id: "A", label: "A" }],
      correctOptionId: "A",
      durationMs: 10000,
      points: 1,
      explanation: "This is the explanation",
    };
    room.quiz = { id: "quiz1", title: "Quiz", questions: [question] };
    room.currentQuestionIndex = 0;
    room.state = RoomState.InGame;
    room.gameState = GameState.Revealing;
    room.lastRoundResult = {
      questionId: "q1",
      correctAnswer: { type: "option", value: "A" },
      playerResults: [],
    };

    const newDisplaySocket = makeMockSocket();
    const displaySession = sessionsById.get(room.displaySessionId!)!;
    displaySession.socket = newDisplaySocket;

    syncSessionToRoomState(displaySession, room);

    const revealPayload = getSentPayload(newDisplaySocket, EVENTS.QUESTION_REVEAL);
    expect(revealPayload).toBeDefined();
    expect(revealPayload.explanation).toBe("This is the explanation");
  });

  it("includes explanation in scoreboard snapshot during reconnect", () => {
    const question: Question = {
      id: "q1",
      type: QuestionType.MultipleChoice,
      text: "Test?",
      options: [{ id: "A", label: "A" }],
      correctOptionId: "A",
      durationMs: 10000,
      points: 1,
      explanation: "Scoreboard explanation",
    };
    room.quiz = { id: "quiz1", title: "Quiz", questions: [question] };
    room.currentQuestionIndex = 0;
    room.state = RoomState.InGame;
    room.gameState = GameState.Scoreboard;
    room.lastRoundResult = {
      questionId: "q1",
      correctAnswer: { type: "option", value: "A" },
      playerResults: [],
    };

    const newDisplaySocket = makeMockSocket();
    const displaySession = sessionsById.get(room.displaySessionId!)!;
    displaySession.socket = newDisplaySocket;

    syncSessionToRoomState(displaySession, room);

    const revealPayload = getSentPayload(newDisplaySocket, EVENTS.QUESTION_REVEAL);
    expect(revealPayload).toBeDefined();
    expect(revealPayload.explanation).toBe("Scoreboard explanation");
    expect(getSentPayload(newDisplaySocket, EVENTS.SCORE_UPDATE)).toBeDefined();
    expect(getSentPayload(newDisplaySocket, EVENTS.NEXT_QUESTION_READY_PROGRESS)).toBeDefined();
  });

  it("rejects answer submission after question:close timeout", () => {
    const { playerSession, question } = startGameWithOnePlayer(room, hostSocket, playerSocket);

    vi.advanceTimersByTime(QUESTION_DURATION_MS);

    (playerSocket as any)._sent.length = 0;
    playerSocket.sessionId = playerSession.sessionId;

    handleAnswerSubmit(playerSocket, {
      roomId: room.id,
      questionId: question.id,
      playerId: playerSession.playerId!,
      answer: makeAnswerForQuestion(question),
      requestId: "req-late",
    });

    const events = getSentEvents(playerSocket);
    expect(events).toContain(EVENTS.ANSWER_REJECTED);
    expect(events).not.toContain(EVENTS.ANSWER_ACCEPTED);
  });
});

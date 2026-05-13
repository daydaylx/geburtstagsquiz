import { EVENTS } from "@quiz/shared-protocol";
import type { Answer, Question } from "@quiz/shared-types";
import { GameState, QuestionType, RoomState } from "@quiz/shared-types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { QUESTION_DURATION_MS } from "./config.js";
import { syncSessionToRoomState } from "./connection.js";
import { handleAnswerSubmit, handleGameStart, handleNextQuestionReady } from "./game.js";
import { buildCatalogSummary, buildDefaultGamePlan, MANUAL_REVEAL_FALLBACK_MS } from "./game-plan.js";
import { handleHostConnect, handleRoomJoin } from "./lobby.js";
import { getDefaultQuiz } from "./quiz-data.js";
import { handleDisplayCreateRoom } from "./room.js";
import type { RoomRecord, SessionRecord, TrackedWebSocket } from "./server-types.js";
import { roomIdByHostToken, roomIdByJoinCode, roomsById, sessionsById } from "./state.js";

type SentPayload = Record<string, unknown> & {
  answeredCount?: number;
  correctAnswer?: unknown;
  displayConnected?: boolean;
  estimateContext?: string;
  explanation?: string;
  finalScoreboard?: unknown[];
  gameState?: GameState;
  hostConnected?: boolean;
  playerCount?: number;
  players?: Array<{ name?: string }>;
  questionId?: string;
  readyCount?: number;
  remainingMs?: number;
  roomId?: string;
  roomState?: RoomState;
  scoreboard?: unknown[];
  text?: string;
  totalEligiblePlayers?: number;
  type?: QuestionType;
  unit?: string;
};

interface SentEnvelope {
  event: string;
  payload: SentPayload;
}

interface TestTrackedWebSocket extends TrackedWebSocket {
  _sent: SentEnvelope[];
}

function makeMockSocket(): TestTrackedWebSocket {
  const sent: SentEnvelope[] = [];
  const socket = {
    connectionId: `conn-${Math.random().toString(36).slice(2)}`,
    isAlive: true,
    sessionId: null,
    readyState: WebSocket.OPEN,
    send: (data: string) => {
      sent.push(JSON.parse(data) as SentEnvelope);
    },
    close: vi.fn(),
    ping: vi.fn(),
    _sent: sent,
  };
  return socket as unknown as TestTrackedWebSocket;
}

function getSentEvents(socket: TestTrackedWebSocket): string[] {
  return socket._sent.map((msg) => msg.event);
}

function getSentPayload(socket: TestTrackedWebSocket, event: string): SentPayload | undefined {
  const matches = socket._sent.filter((msg) => msg.event === event);
  return matches.length > 0 ? matches[matches.length - 1].payload : undefined;
}

function expectSentPayload(socket: TestTrackedWebSocket, event: string): SentPayload {
  const payload = getSentPayload(socket, event);
  expect(payload).toBeDefined();
  return payload!;
}

function getPlayerSession(): SessionRecord {
  const playerSession = [...sessionsById.values()].find((session) => session.role === "player");
  if (!playerSession) throw new Error("Expected player session");
  return playerSession;
}

function makeAnswerForQuestion(question: Question): Answer {
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

function makeEstimateQuestion(): Question {
  return {
    id: "q-est-context",
    type: QuestionType.Estimate,
    text: "Wie viele Zeichen hatte eine SMS?",
    correctValue: 160,
    unit: "Zeichen",
    context: "Standard-SMS-Limit",
    durationMs: 10000,
    points: 1,
    explanation: "Eine klassische SMS hatte 160 Zeichen.",
  };
}

function makeTestGamePlan(overrides: Partial<ReturnType<typeof buildDefaultGamePlan>> = {}) {
  const catalog = buildCatalogSummary(getDefaultQuiz());

  return {
    ...buildDefaultGamePlan(catalog),
    questionCount: 1,
    enableDemoQuestion: false,
    displayShowLevel: "minimal" as const,
    ...overrides,
  };
}

function startGameWithOnePlayer(
  room: RoomRecord,
  hostSocket: TrackedWebSocket,
  playerSocket: TrackedWebSocket,
  gamePlan = makeTestGamePlan(),
): { playerSession: SessionRecord; question: Question } {
  handleRoomJoin(playerSocket, { joinCode: room.joinCode, playerName: "Player 1" });
  const playerSession = getPlayerSession();

  hostSocket.sessionId = room.hostSessionId;
  handleGameStart(hostSocket, { roomId: room.id, gamePlan });

  const question = room.quiz!.questions[0];

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
  let displaySocket: TestTrackedWebSocket;
  let hostSocket: TestTrackedWebSocket;
  let playerSocket: TestTrackedWebSocket;
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
    displaySocket._sent.length = 0;

    handleRoomJoin(playerSocket, { joinCode: room.joinCode, playerName: "Player 1" });

    const events = getSentEvents(displaySocket);
    expect(events).toContain(EVENTS.LOBBY_UPDATE);

    const payload = expectSentPayload(displaySocket, EVENTS.LOBBY_UPDATE);
    expect(payload.playerCount).toBe(1);
    expect(payload.players?.[0]?.name).toBe("Player 1");
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

    const questionPayload = expectSentPayload(displaySocket, EVENTS.QUESTION_SHOW);
    expect(questionPayload.text).toBeTruthy();
  });

  it("does not include estimate context in question:show snapshots", () => {
    const question = makeEstimateQuestion();
    room.quiz = { id: "quiz1", title: "Quiz", categories: [], questions: [question] };
    room.currentQuestionIndex = 0;
    room.state = RoomState.InGame;
    room.gameState = GameState.QuestionActive;

    const newDisplaySocket = makeMockSocket();
    const displaySession = sessionsById.get(room.displaySessionId!)!;
    displaySession.socket = newDisplaySocket;

    syncSessionToRoomState(displaySession, room);

    const questionPayload = expectSentPayload(newDisplaySocket, EVENTS.QUESTION_SHOW);
    expect(questionPayload.type).toBe(QuestionType.Estimate);
    expect(questionPayload.unit).toBe("Zeichen");
    expect(questionPayload).not.toHaveProperty("context");
  });

  it("sends question:timer to display while a question is active", () => {
    startGameWithOnePlayer(room, hostSocket, playerSocket);
    displaySocket._sent.length = 0;

    vi.advanceTimersByTime(500);

    const timerPayload = expectSentPayload(displaySocket, EVENTS.QUESTION_TIMER);
    expect(timerPayload.roomId).toBe(room.id);
    expect(timerPayload.remainingMs).toBeGreaterThanOrEqual(0);
  });

  it("sends answer:progress to display when player submits answer", () => {
    const { playerSession, question } = startGameWithOnePlayer(room, hostSocket, playerSocket);

    displaySocket._sent.length = 0;
    submitAnswer(room, playerSocket, playerSession, question);

    const payload = expectSentPayload(displaySocket, EVENTS.ANSWER_PROGRESS);
    expect(payload.answeredCount).toBe(1);
    expect(payload.totalEligiblePlayers).toBe(1);
  });

  it("sends question:reveal to display after all answers are in", () => {
    const { playerSession, question } = startGameWithOnePlayer(room, hostSocket, playerSocket);

    displaySocket._sent.length = 0;
    submitAnswer(room, playerSocket, playerSession, question);

    const revealPayload = expectSentPayload(displaySocket, EVENTS.QUESTION_REVEAL);
    expect(revealPayload.questionId).toBe(question.id);
    expect(revealPayload.correctAnswer).toBeDefined();

    const readyPayload = expectSentPayload(displaySocket, EVENTS.NEXT_QUESTION_READY_PROGRESS);
    expect(readyPayload).toMatchObject({
      questionId: question.id,
      readyCount: 0,
      totalEligiblePlayers: 1,
      gameState: GameState.Revealing,
    });
  });

  it("includes estimate context in question:reveal after evaluation", () => {
    const { playerSession } = startGameWithOnePlayer(room, hostSocket, playerSocket);
    const question = makeEstimateQuestion();
    room.quiz!.questions[0] = question;

    displaySocket._sent.length = 0;
    submitAnswer(room, playerSocket, playerSession, question);

    const revealPayload = expectSentPayload(displaySocket, EVENTS.QUESTION_REVEAL);
    expect(revealPayload.correctAnswer).toEqual({ type: "number", value: 160 });
    expect(revealPayload.estimateContext).toBe("Standard-SMS-Limit");
  });

  it("keeps reveal visible until fallback timer fires (manual_with_fallback mode)", () => {
    const { playerSession, question } = startGameWithOnePlayer(room, hostSocket, playerSocket);
    submitAnswer(room, playerSocket, playerSession, question);

    displaySocket._sent.length = 0;
    vi.advanceTimersByTime(MANUAL_REVEAL_FALLBACK_MS - 1);

    const scorePayloadBefore = getSentPayload(displaySocket, EVENTS.SCORE_UPDATE);
    expect(scorePayloadBefore).toBeUndefined();
    expect(room.gameState).toBe(GameState.Revealing);

    vi.advanceTimersByTime(1);

    expect(room.gameState).toBe(GameState.Completed);
  });

  it("sends game:finished to display after the final reveal ready state", () => {
    const { playerSession, question } = startGameWithOnePlayer(room, hostSocket, playerSocket);
    submitAnswer(room, playerSocket, playerSession, question);

    displaySocket._sent.length = 0;
    playerSocket.sessionId = playerSession.sessionId;
    handleNextQuestionReady(playerSocket, {
      roomId: room.id,
      questionId: question.id,
      playerId: playerSession.playerId!,
    });

    const finishedPayload = expectSentPayload(displaySocket, EVENTS.GAME_FINISHED);
    expect(finishedPayload.roomState).toBe(RoomState.Completed);
    expect(finishedPayload.finalScoreboard).toHaveLength(1);
  });

  it("skips scoreboard after non-interval questions and shows it after the fifth real question", () => {
    const { playerSession } = startGameWithOnePlayer(
      room,
      hostSocket,
      playerSocket,
      makeTestGamePlan({ questionCount: 6 }),
    );

    for (let index = 0; index < 4; index++) {
      const question = room.quiz!.questions[room.currentQuestionIndex!];
      submitAnswer(room, playerSocket, playerSession, question);

      displaySocket._sent.length = 0;
      playerSocket.sessionId = playerSession.sessionId;
      handleNextQuestionReady(playerSocket, {
        roomId: room.id,
        questionId: question.id,
        playerId: playerSession.playerId!,
      });

      expect(getSentPayload(displaySocket, EVENTS.SCORE_UPDATE)).toBeUndefined();
      expect(room.gameState).toBe(GameState.QuestionActive);
      expect(room.currentQuestionIndex).toBe(index + 1);
    }

    const fifthQuestion = room.quiz!.questions[room.currentQuestionIndex!];
    submitAnswer(room, playerSocket, playerSession, fifthQuestion);

    displaySocket._sent.length = 0;
    playerSocket.sessionId = playerSession.sessionId;
    handleNextQuestionReady(playerSocket, {
      roomId: room.id,
      questionId: fifthQuestion.id,
      playerId: playerSession.playerId!,
    });

    const scorePayload = expectSentPayload(displaySocket, EVENTS.SCORE_UPDATE);
    expect(scorePayload.questionId).toBe(fifthQuestion.id);
    expect(scorePayload.scoreboard).toHaveLength(1);
    expect(room.gameState).toBe(GameState.Scoreboard);
  });

  it("does not count the demo question for the scoreboard interval", () => {
    const { playerSession } = startGameWithOnePlayer(
      room,
      hostSocket,
      playerSocket,
      makeTestGamePlan({ questionCount: 6, enableDemoQuestion: true }),
    );

    const demoQuestion = room.quiz!.questions[room.currentQuestionIndex!];
    expect(demoQuestion.isDemoQuestion).toBe(true);
    submitAnswer(room, playerSocket, playerSession, demoQuestion);

    displaySocket._sent.length = 0;
    playerSocket.sessionId = playerSession.sessionId;
    handleNextQuestionReady(playerSocket, {
      roomId: room.id,
      questionId: demoQuestion.id,
      playerId: playerSession.playerId!,
    });

    expect(getSentPayload(displaySocket, EVENTS.SCORE_UPDATE)).toBeUndefined();
    expect(room.gameState).toBe(GameState.QuestionActive);
    expect(room.currentQuestionIndex).toBe(1);

    for (let answeredRealQuestions = 0; answeredRealQuestions < 4; answeredRealQuestions++) {
      const question = room.quiz!.questions[room.currentQuestionIndex!];
      submitAnswer(room, playerSocket, playerSession, question);
      playerSocket.sessionId = playerSession.sessionId;
      handleNextQuestionReady(playerSocket, {
        roomId: room.id,
        questionId: question.id,
        playerId: playerSession.playerId!,
      });
    }

    const fifthRealQuestion = room.quiz!.questions[room.currentQuestionIndex!];
    submitAnswer(room, playerSocket, playerSession, fifthRealQuestion);

    displaySocket._sent.length = 0;
    playerSocket.sessionId = playerSession.sessionId;
    handleNextQuestionReady(playerSocket, {
      roomId: room.id,
      questionId: fifthRealQuestion.id,
      playerId: playerSession.playerId!,
    });

    const scorePayload = expectSentPayload(displaySocket, EVENTS.SCORE_UPDATE);
    expect(scorePayload.questionId).toBe(fifthRealQuestion.id);
    expect(room.gameState).toBe(GameState.Scoreboard);
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
    room.quiz = { id: "quiz1", title: "Quiz", categories: [], questions: [question] };
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

    const revealPayload = expectSentPayload(newDisplaySocket, EVENTS.QUESTION_REVEAL);
    expect(revealPayload.explanation).toBe("This is the explanation");
  });

  it("includes estimate context in reveal snapshot during reconnect", () => {
    const question = makeEstimateQuestion();
    room.quiz = { id: "quiz1", title: "Quiz", categories: [], questions: [question] };
    room.currentQuestionIndex = 0;
    room.state = RoomState.InGame;
    room.gameState = GameState.Revealing;
    room.lastRoundResult = {
      questionId: question.id,
      correctAnswer: { type: "number", value: 160 },
      playerResults: [],
    };

    const newDisplaySocket = makeMockSocket();
    const displaySession = sessionsById.get(room.displaySessionId!)!;
    displaySession.socket = newDisplaySocket;

    syncSessionToRoomState(displaySession, room);

    const revealPayload = expectSentPayload(newDisplaySocket, EVENTS.QUESTION_REVEAL);
    expect(revealPayload.estimateContext).toBe("Standard-SMS-Limit");
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
    room.quiz = { id: "quiz1", title: "Quiz", categories: [], questions: [question] };
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

    const revealPayload = expectSentPayload(newDisplaySocket, EVENTS.QUESTION_REVEAL);
    expect(revealPayload.explanation).toBe("Scoreboard explanation");
    expect(getSentPayload(newDisplaySocket, EVENTS.SCORE_UPDATE)).toBeDefined();
    expect(getSentPayload(newDisplaySocket, EVENTS.NEXT_QUESTION_READY_PROGRESS)).toBeDefined();
  });

  it("rejects answer submission after question:close timeout", () => {
    const { playerSession, question } = startGameWithOnePlayer(room, hostSocket, playerSocket);

    vi.advanceTimersByTime(QUESTION_DURATION_MS);

    playerSocket._sent.length = 0;
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

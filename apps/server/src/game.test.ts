import {
  type GamePlan,
  GameState,
  type Player,
  PlayerState,
  type Question,
  QuestionType,
  type Quiz,
} from "@quiz/shared-types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { QUESTION_DURATION_MS } from "./config.js";
import { getAnswerProgress, handleAnswerSubmit, handleGameNextQuestion, handleGameStart } from "./game.js";
import {
  buildCatalogSummary,
  buildDefaultGamePlan,
  createDemoQuestion,
  GamePlanValidationError,
  resolveGamePlan,
  selectQuestionsForGamePlan,
} from "./game-plan.js";
import { handleHostConnect, handleRoomJoin } from "./lobby.js";
import { getDefaultQuiz } from "./quiz-data.js";
import { handleDisplayCreateRoom } from "./room.js";
import type { RoomRecord, TrackedWebSocket } from "./server-types.js";
import { roomIdByHostToken, roomIdByJoinCode, roomsById, sessionsById } from "./state.js";

function makePlayer(id: string, state: PlayerState): Player {
  return {
    id,
    name: id,
    sessionId: `session-${id}`,
    state,
    score: 0,
  };
}

function makeQuestion(id: string, type: QuestionType): Question {
  if (type === QuestionType.Estimate) {
    return {
      id,
      type,
      text: id,
      correctValue: 1,
      unit: "x",
      context: "test",
      durationMs: 10_000,
      points: 1,
    };
  }

  if (type === QuestionType.MajorityGuess) {
    return {
      id,
      type,
      text: id,
      options: [
        { id: "A", label: "A" },
        { id: "B", label: "B" },
      ],
      durationMs: 10_000,
      points: 1,
    };
  }

  if (type === QuestionType.Ranking) {
    return {
      id,
      type,
      text: id,
      items: [
        { id: "A", label: "A" },
        { id: "B", label: "B" },
      ],
      correctOrder: ["A", "B"],
      durationMs: 10_000,
      points: 1,
    };
  }

  if (type === QuestionType.OpenText) {
    return {
      id,
      type,
      text: id,
      correctText: "Antwort",
      aliases: ["Alias"],
      durationMs: 10_000,
      points: 1,
    };
  }

  return {
    id,
    type,
    text: id,
    options: [
      { id: "A", label: "A" },
      { id: "B", label: "B" },
    ],
    correctOptionId: "A",
    durationMs: 10_000,
    points: 1,
  };
}

function withCategory(question: Question, categoryId: string): Question {
  return {
    ...question,
    categoryId,
    categoryName: categoryId === "cat-a" ? "Kategorie A" : "Kategorie B",
    categorySlug: categoryId,
  };
}

function makeTestQuiz(questions: Question[]): Quiz {
  return {
    id: "test-quiz",
    title: "Test Quiz",
    categories: [
      {
        id: "cat-a",
        slug: "cat-a",
        name: "Kategorie A",
        tags: [],
        questionCount: questions.filter((question) => question.categoryId === "cat-a").length,
      },
      {
        id: "cat-b",
        slug: "cat-b",
        name: "Kategorie B",
        tags: [],
        questionCount: questions.filter((question) => question.categoryId === "cat-b").length,
      },
    ],
    questions,
  };
}

function makeCustomPlan(overrides: Partial<GamePlan> = {}): GamePlan {
  return {
    mode: "custom",
    questionCount: 5,
    categoryIds: ["cat-a", "cat-b"],
    questionTypes: [
      QuestionType.MultipleChoice,
      QuestionType.Estimate,
      QuestionType.MajorityGuess,
      QuestionType.Ranking,
    ],
    timerMs: 30_000,
    revealDurationMs: 5_000,
    revealMode: "auto",
    revealDelayMs: 0,
    playerReadingPhaseMs: 0,
    showAnswerTextOnPlayerDevices: false,
    enableDemoQuestion: false,
    displayShowLevel: "minimal",
    rankingScoringMode: "partial_with_bonus",
    ...overrides,
  };
}

describe("getAnswerProgress", () => {
  it("counts answers only from currently connected players", () => {
    const currentAnswers = new Map([
      [
        "p1",
        {
          playerId: "p1",
          questionId: "q1",
          answer: { type: "option" as const, value: "A" },
          submittedAtMs: 1,
        },
      ],
      [
        "p2",
        {
          playerId: "p2",
          questionId: "q1",
          answer: { type: "option" as const, value: "A" },
          submittedAtMs: 1,
        },
      ],
    ]);

    expect(
      getAnswerProgress({
        players: [
          makePlayer("p1", PlayerState.Answered),
          makePlayer("p2", PlayerState.Disconnected),
          makePlayer("p3", PlayerState.Answering),
        ],
        currentAnswers,
      }),
    ).toEqual({
      answeredCount: 1,
      totalEligiblePlayers: 2,
    });
  });

  it("returns zeros when no players are eligible", () => {
    expect(
      getAnswerProgress({
        players: [makePlayer("p1", PlayerState.Disconnected)],
        currentAnswers: new Map(),
      }),
    ).toEqual({
      answeredCount: 0,
      totalEligiblePlayers: 0,
    });
  });

  it("returns zeros when there are no players", () => {
    expect(
      getAnswerProgress({
        players: [],
        currentAnswers: new Map(),
      }),
    ).toEqual({
      answeredCount: 0,
      totalEligiblePlayers: 0,
    });
  });
});
describe("getDefaultQuiz", () => {
  it("loads the JSON question bank", () => {
    const quiz = getDefaultQuiz();

    expect(quiz.id).toBe("geburtstagsquiz-millennials-v2-engine-v2");
    expect(quiz.questions).toHaveLength(516);
    expect(new Set(quiz.questions.map((q) => q.id)).size).toBe(516);
    expect(quiz.questions.every((q) => q.durationMs === QUESTION_DURATION_MS)).toBe(true);
  });
});

describe("game plan selection", () => {
  it("builds a catalog summary from real source categories", () => {
    const quiz = getDefaultQuiz();
    const catalog = buildCatalogSummary(quiz);

    expect(catalog.totalQuestions).toBe(516);
    expect(catalog.maxQuestionCount).toBe(516);
    expect(catalog.categories.length).toBeGreaterThan(0);
    expect(catalog.categories.some((category) => category.id === "cat-01")).toBe(true);
    expect(catalog.questionTypes.some((entry) => entry.type === QuestionType.MultipleChoice)).toBe(true);
  });

  it("uses 90 seconds as the default question timer", () => {
    const quiz = getDefaultQuiz();
    const catalog = buildCatalogSummary(quiz);
    const defaultPlan = buildDefaultGamePlan(catalog);

    expect(defaultPlan.timerMs).toBe(90_000);

    const resolvedPlan = resolveGamePlan(defaultPlan, catalog, quiz);
    const demoQuestion = createDemoQuestion(resolvedPlan);

    expect(resolvedPlan.timerMs).toBe(90_000);
    expect(demoQuestion.durationMs).toBe(90_000);
  });

  it("rejects game plans when the filtered pool is too small", () => {
    const questions = [
      withCategory(makeQuestion("rank-1", QuestionType.Ranking), "cat-a"),
      withCategory(makeQuestion("rank-2", QuestionType.Ranking), "cat-a"),
      withCategory(makeQuestion("mc-1", QuestionType.MultipleChoice), "cat-b"),
      withCategory(makeQuestion("mc-2", QuestionType.MultipleChoice), "cat-b"),
      withCategory(makeQuestion("mc-3", QuestionType.MultipleChoice), "cat-b"),
    ];
    const quiz = makeTestQuiz(questions);
    const catalog = buildCatalogSummary(quiz);
    const plan = makeCustomPlan({
      questionCount: 5,
      categoryIds: ["cat-a"],
      questionTypes: [QuestionType.Ranking],
    });

    expect(() => resolveGamePlan(plan, catalog, quiz)).toThrow(GamePlanValidationError);
    expect(() => resolveGamePlan(plan, catalog, quiz)).toThrow(
      "Nicht genug Fragen für diese Auswahl. Verfügbar: 2. Benötigt: 5.",
    );
  });

  it("filters by category and question type and applies the configured timer", () => {
    const questions = [
      withCategory(makeQuestion("a-mc-1", QuestionType.MultipleChoice), "cat-a"),
      withCategory(makeQuestion("a-mc-2", QuestionType.MultipleChoice), "cat-a"),
      withCategory(makeQuestion("a-mc-3", QuestionType.MultipleChoice), "cat-a"),
      withCategory(makeQuestion("a-est-1", QuestionType.Estimate), "cat-a"),
      withCategory(makeQuestion("a-est-2", QuestionType.Estimate), "cat-a"),
      withCategory(makeQuestion("a-rank-1", QuestionType.Ranking), "cat-a"),
      withCategory(makeQuestion("b-mc-1", QuestionType.MultipleChoice), "cat-b"),
      withCategory(makeQuestion("b-est-1", QuestionType.Estimate), "cat-b"),
    ];
    const quiz = makeTestQuiz(questions);
    const catalog = buildCatalogSummary(quiz);
    const resolvedPlan = resolveGamePlan(
      makeCustomPlan({
        questionCount: 5,
        categoryIds: ["cat-a"],
        questionTypes: [QuestionType.MultipleChoice, QuestionType.Estimate],
        timerMs: 45_000,
      }),
      catalog,
      quiz,
    );

    const selected = selectQuestionsForGamePlan(questions, resolvedPlan, () => 0.3);
    const selectedIds = selected.map((question) => question.id);

    expect(selected).toHaveLength(5);
    expect(new Set(selectedIds).size).toBe(selectedIds.length);
    expect(selected.every((question) => question.categoryId === "cat-a")).toBe(true);
    expect(
      selected.every((question) => [QuestionType.MultipleChoice, QuestionType.Estimate].includes(question.type)),
    ).toBe(true);
    expect(selected.every((question) => question.durationMs === 45_000)).toBe(true);
  });
});

interface TestSentEnvelope {
  event: string;
  payload: Record<string, unknown>;
}

interface TestTrackedWebSocket extends TrackedWebSocket {
  _sent: TestSentEnvelope[];
}

function makeMockSocket(): TestTrackedWebSocket {
  const sent: TestSentEnvelope[] = [];
  const socket = {
    connectionId: `conn-${Math.random().toString(36).slice(2)}`,
    isAlive: true,
    sessionId: null,
    readyState: WebSocket.OPEN,
    send: (data: string) => {
      sent.push(JSON.parse(data) as TestSentEnvelope);
    },
    close: vi.fn(),
    ping: vi.fn(),
    _sent: sent,
  };
  return socket as unknown as TestTrackedWebSocket;
}

function getPlayerSession(playerIndex: number) {
  const playerSessions = [...sessionsById.values()].filter((s) => s.role === "player");
  const session = playerSessions[playerIndex];
  if (!session) throw new Error(`Expected player session at index ${playerIndex}`);
  return session;
}

function makeAnswerForQuestion(question: Question) {
  if (question.type === "multiple_choice" || question.type === "logic" || question.type === "majority_guess") {
    return { type: "option" as const, value: question.options[0].id };
  }
  if (question.type === "estimate") {
    return { type: "number" as const, value: 42 };
  }
  if (question.type === "ranking") {
    return {
      type: "ranking" as const,
      value: question.items.map((item) => item.id),
    };
  }
  return { type: "text" as const, value: "test answer" };
}

function makeTestGamePlan(overrides: Record<string, unknown> = {}) {
  const catalog = buildCatalogSummary(getDefaultQuiz());
  return {
    ...buildDefaultGamePlan(catalog),
    questionCount: 5,
    enableDemoQuestion: false,
    displayShowLevel: "minimal" as const,
    ...overrides,
  };
}

describe("revealDelayMs", () => {
  let displaySocket: TestTrackedWebSocket;
  let hostSocket: TestTrackedWebSocket;
  let player1Socket: TestTrackedWebSocket;
  let player2Socket: TestTrackedWebSocket;
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

    player1Socket = makeMockSocket();
    handleRoomJoin(player1Socket, {
      joinCode: room.joinCode,
      playerName: "Player 1",
    });

    player2Socket = makeMockSocket();
    handleRoomJoin(player2Socket, {
      joinCode: room.joinCode,
      playerName: "Player 2",
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("delays question:reveal by revealDelayMs after question:close", () => {
    const player1Session = getPlayerSession(0);
    const player2Session = getPlayerSession(1);

    hostSocket.sessionId = room.hostSessionId;
    handleGameStart(hostSocket, {
      roomId: room.id,
      gamePlan: makeTestGamePlan({
        revealDelayMs: 3_000,
        revealMode: "auto",
        revealDurationMs: 5_000,
      }),
    });

    expect(room.gameState).toBe(GameState.QuestionActive);

    const question = room.quiz!.questions[room.currentQuestionIndex!];

    player1Socket.sessionId = player1Session.sessionId;
    handleAnswerSubmit(player1Socket, {
      roomId: room.id,
      questionId: question.id,
      playerId: player1Session.playerId!,
      answer: makeAnswerForQuestion(question),
      requestId: "req-p1",
    });

    player2Socket.sessionId = player2Session.sessionId;
    handleAnswerSubmit(player2Socket, {
      roomId: room.id,
      questionId: question.id,
      playerId: player2Session.playerId!,
      answer: makeAnswerForQuestion(question),
      requestId: "req-p2",
    });

    expect(room.gameState).toBe(GameState.AnswerLocked);

    displaySocket._sent.length = 0;
    hostSocket._sent.length = 0;

    vi.advanceTimersByTime(1_000);

    const revealBeforeDelay = hostSocket._sent.find((m) => m.event === "question:reveal");
    expect(revealBeforeDelay).toBeUndefined();
    expect(room.gameState).toBe(GameState.AnswerLocked);

    vi.advanceTimersByTime(2_500);

    const revealAfterDelay = hostSocket._sent.find((m) => m.event === "question:reveal");
    expect(revealAfterDelay).toBeDefined();
    expect(room.gameState).toBe(GameState.Revealing);
  });

  it("reveals immediately when revealDelayMs is 0", () => {
    const player1Session = getPlayerSession(0);
    const player2Session = getPlayerSession(1);

    hostSocket.sessionId = room.hostSessionId;
    handleGameStart(hostSocket, {
      roomId: room.id,
      gamePlan: makeTestGamePlan({
        revealDelayMs: 0,
        revealMode: "auto",
        revealDurationMs: 5_000,
      }),
    });

    const question = room.quiz!.questions[room.currentQuestionIndex!];

    player1Socket.sessionId = player1Session.sessionId;
    handleAnswerSubmit(player1Socket, {
      roomId: room.id,
      questionId: question.id,
      playerId: player1Session.playerId!,
      answer: makeAnswerForQuestion(question),
      requestId: "req-p1",
    });

    player2Socket.sessionId = player2Session.sessionId;
    handleAnswerSubmit(player2Socket, {
      roomId: room.id,
      questionId: question.id,
      playerId: player2Session.playerId!,
      answer: makeAnswerForQuestion(question),
      requestId: "req-p2",
    });

    const reveal = hostSocket._sent.find((m) => m.event === "question:reveal");
    expect(reveal).toBeDefined();
    expect(room.gameState).toBe(GameState.Revealing);
  });

  it("allows host to skip delay via game:next-question during AnswerLocked", () => {
    const player1Session = getPlayerSession(0);
    const player2Session = getPlayerSession(1);

    hostSocket.sessionId = room.hostSessionId;
    handleGameStart(hostSocket, {
      roomId: room.id,
      gamePlan: makeTestGamePlan({
        revealDelayMs: 5_000,
        revealMode: "auto",
        revealDurationMs: 5_000,
      }),
    });

    const question = room.quiz!.questions[room.currentQuestionIndex!];

    player1Socket.sessionId = player1Session.sessionId;
    handleAnswerSubmit(player1Socket, {
      roomId: room.id,
      questionId: question.id,
      playerId: player1Session.playerId!,
      answer: makeAnswerForQuestion(question),
      requestId: "req-p1",
    });

    player2Socket.sessionId = player2Session.sessionId;
    handleAnswerSubmit(player2Socket, {
      roomId: room.id,
      questionId: question.id,
      playerId: player2Session.playerId!,
      answer: makeAnswerForQuestion(question),
      requestId: "req-p2",
    });

    expect(room.gameState).toBe(GameState.AnswerLocked);
    expect(room.revealDelayTimer).not.toBeNull();

    hostSocket._sent.length = 0;
    hostSocket.sessionId = room.hostSessionId;
    handleGameNextQuestion(hostSocket, room.id);

    const reveal = hostSocket._sent.find((m) => m.event === "question:reveal");
    expect(reveal).toBeDefined();
    expect(room.gameState).toBe(GameState.Revealing);
    expect(room.revealDelayTimer).toBeNull();
  });

  it("includes text and playerReadingPhaseMs in question:controller when reading phase is active", () => {
    hostSocket.sessionId = room.hostSessionId;
    handleGameStart(hostSocket, {
      roomId: room.id,
      gamePlan: makeTestGamePlan({ playerReadingPhaseMs: 5_000 }),
    });

    const player1Sent = player1Socket._sent.filter((m: { event: string }) => m.event === "question:controller");
    expect(player1Sent.length).toBeGreaterThanOrEqual(1);
    const controllerPayload = player1Sent[0].payload as Record<string, unknown>;
    expect(controllerPayload.text).toBeDefined();
    expect(typeof controllerPayload.text).toBe("string");
    expect(controllerPayload.playerReadingPhaseMs).toBe(5_000);
  });

  it("omits text and playerReadingPhaseMs from question:controller when reading phase is 0", () => {
    hostSocket.sessionId = room.hostSessionId;
    handleGameStart(hostSocket, {
      roomId: room.id,
      gamePlan: makeTestGamePlan({ playerReadingPhaseMs: 0 }),
    });

    const player1Sent = player1Socket._sent.filter((m: { event: string }) => m.event === "question:controller");
    expect(player1Sent.length).toBeGreaterThanOrEqual(1);
    const controllerPayload = player1Sent[0].payload as Record<string, unknown>;
    expect(controllerPayload.text).toBeUndefined();
    expect(controllerPayload.playerReadingPhaseMs).toBeUndefined();
  });
});

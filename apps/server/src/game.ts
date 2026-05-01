import { EVENTS, type GameStartPayload, type QuestionShowPayload } from "@quiz/shared-protocol";
import {
  evaluateEstimate,
  evaluateMajorityGuess,
  evaluateMultipleChoice,
  evaluateOpenText,
  evaluateRanking,
} from "@quiz/quiz-engine";
import { GameState, PlayerState, QuestionType, RoomState } from "@quiz/shared-types";
import type {
  GameFinalStats,
  Question,
  ResolvedGamePlan,
  ScoreChange,
  SubmittedAnswer,
} from "@quiz/shared-types";

import { PROTOCOL_ERROR_CODES, sendEvent, sendProtocolError } from "./protocol.js";
import type { RoomRecord, TrackedWebSocket } from "./server-types.js";
import { roomsById, sessionsById, logRoomEvent } from "./state.js";
import { broadcastToAllRoomClients, broadcastToHostAndDisplay } from "./connection.js";
import { getDefaultQuiz } from "./quiz-data.js";
import { QUESTION_DURATION_MS } from "./config.js";
import { isAnswerValidForQuestion } from "./answer-validation.js";
import { removePlayerFromRoom } from "./room.js";
import {
  getTotalQuestionCount,
  getVisibleQuestionIndex,
  toQuestionControllerPayload,
  toQuestionShowPayload,
} from "./question-payloads.js";
import {
  GamePlanValidationError,
  buildCatalogSummary,
  buildDefaultGamePlan,
  createDemoQuestion,
  resolveGamePlan,
  selectQuestionsForGamePlan,
} from "./game-plan.js";

const SCOREBOARD_INTERVAL = 5;
function shuffleArray<T>(array: T[], random: () => number = Math.random): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function sendQuestionForCurrentRole(
  sessionSocket: TrackedWebSocket | null | undefined,
  role: "host" | "player" | "display",
  room: RoomRecord,
  question: Question,
  gameState: QuestionShowPayload["gameState"],
): void {
  if (role === "host" || role === "display") {
    sendEvent(
      sessionSocket,
      EVENTS.QUESTION_SHOW,
      toQuestionShowPayload(room, question, gameState),
    );
    return;
  }

  sendEvent(
    sessionSocket,
    EVENTS.QUESTION_CONTROLLER,
    toQuestionControllerPayload(room, question, gameState),
  );
}

function sendQuestionToRoom(
  room: RoomRecord,
  question: Question,
  gameState: QuestionShowPayload["gameState"],
): void {
  const displaySession = room.displaySessionId ? sessionsById.get(room.displaySessionId) : null;
  sendQuestionForCurrentRole(displaySession?.socket, "display", room, question, gameState);

  const hostSession = sessionsById.get(room.hostSessionId);
  sendQuestionForCurrentRole(hostSession?.socket, "host", room, question, gameState);

  for (const player of room.players) {
    const session = sessionsById.get(player.sessionId);
    sendQuestionForCurrentRole(session?.socket, "player", room, question, gameState);
  }
}

export function handleGameStart(socket: TrackedWebSocket, payload: GameStartPayload): void {
  const { roomId } = payload;
  const session = socket.sessionId ? sessionsById.get(socket.sessionId) : null;

  if (!session || session.role !== "host") {
    sendProtocolError(
      socket,
      PROTOCOL_ERROR_CODES.NOT_AUTHORIZED,
      "Only the host can start the game",
      {
        event: EVENTS.GAME_START,
        roomId,
        questionId: null,
      },
    );
    return;
  }

  const room = roomsById.get(roomId);

  if (!room) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.ROOM_NOT_FOUND, "Room not found", {
      event: EVENTS.GAME_START,
      roomId,
      questionId: null,
    });
    return;
  }

  if (room.state !== RoomState.Waiting) {
    sendProtocolError(
      socket,
      PROTOCOL_ERROR_CODES.INVALID_STATE,
      "Game can only be started from waiting state",
      {
        event: EVENTS.GAME_START,
        roomId: room.id,
        questionId: null,
      },
    );
    return;
  }

  const connectedPlayers = room.players.filter((p) => p.state !== PlayerState.Disconnected);

  if (connectedPlayers.length === 0) {
    sendProtocolError(
      socket,
      PROTOCOL_ERROR_CODES.INVALID_STATE,
      "Need at least 1 connected player to start",
      {
        event: EVENTS.GAME_START,
        roomId: room.id,
        questionId: null,
      },
    );
    return;
  }

  const defaultQuiz = getDefaultQuiz();
  const catalog = buildCatalogSummary(defaultQuiz);
  const requestedGamePlan = payload.gamePlan ?? buildDefaultGamePlan(catalog);
  let resolvedGamePlan: ResolvedGamePlan;
  let selectedQuestions: Question[];

  try {
    resolvedGamePlan = resolveGamePlan(requestedGamePlan, catalog, defaultQuiz);
    selectedQuestions = selectQuestionsForGamePlan(defaultQuiz.questions, resolvedGamePlan);
  } catch (error) {
    const message =
      error instanceof GamePlanValidationError
        ? error.message
        : "Spielplan konnte nicht validiert werden.";
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.GAME_PLAN_INVALID, message, {
      event: EVENTS.GAME_START,
      roomId: room.id,
      questionId: null,
    });
    return;
  }

  const questions = resolvedGamePlan.enableDemoQuestion
    ? [createDemoQuestion(resolvedGamePlan), ...selectedQuestions]
    : selectedQuestions;

  room.quiz = {
    ...defaultQuiz,
    questions,
  };
  room.resolvedGamePlan = resolvedGamePlan;
  room.settings = {
    showAnswerTextOnPlayerDevices: resolvedGamePlan.showAnswerTextOnPlayerDevices,
    gamePlanDraft: requestedGamePlan,
  };
  room.currentQuestionIndex = 0;
  room.state = RoomState.InGame;
  room.gameState = GameState.Idle;
  room.lastRoundResult = null;
  room.lastScoreChanges = [];
  room.completedRoundResults = [];
  room.completedAnswers = [];

  logRoomEvent("game:started", room, {});

  broadcastToAllRoomClients(room, EVENTS.GAME_STARTED, {
    roomId: room.id,
    roomState: RoomState.InGame,
    gameState: GameState.Idle,
    questionIndex: 0,
    totalQuestionCount: getTotalQuestionCount(room),
    resolvedGamePlan,
  });

  startQuestion(room);
}

export function handleGameNextQuestion(socket: TrackedWebSocket, roomId: string): void {
  const session = socket.sessionId ? sessionsById.get(socket.sessionId) : null;

  if (!session || session.role !== "host") {
    sendProtocolError(
      socket,
      PROTOCOL_ERROR_CODES.NOT_AUTHORIZED,
      "Only the host can advance questions",
      {
        event: EVENTS.GAME_NEXT_QUESTION,
        roomId,
        questionId: null,
      },
    );
    return;
  }

  const room = roomsById.get(roomId);

  if (!room) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.ROOM_NOT_FOUND, "Room not found", {
      event: EVENTS.GAME_NEXT_QUESTION,
      roomId,
      questionId: null,
    });
    return;
  }

  if (room.state !== RoomState.InGame) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.INVALID_STATE, "No game in progress", {
      event: EVENTS.GAME_NEXT_QUESTION,
      roomId: room.id,
      questionId: null,
    });
    return;
  }

  if (room.gameState !== GameState.Scoreboard && room.gameState !== GameState.Revealing) {
    sendProtocolError(
      socket,
      PROTOCOL_ERROR_CODES.INVALID_STATE,
      "Cannot advance from current state",
      {
        event: EVENTS.GAME_NEXT_QUESTION,
        roomId: room.id,
        questionId: null,
      },
    );
    return;
  }

  if (!room.quiz || room.currentQuestionIndex === null) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.INVALID_STATE, "No quiz loaded", {
      event: EVENTS.GAME_NEXT_QUESTION,
      roomId: room.id,
      questionId: null,
    });
    return;
  }

  if (room.gameState === GameState.Revealing) {
    advanceAfterReveal(room);
    return;
  }

  advanceFromScoreboard(room);
}

function getAuthorizedHostRoom(
  socket: TrackedWebSocket,
  roomId: string,
  event: typeof EVENTS[keyof typeof EVENTS],
): RoomRecord | null {
  const session = socket.sessionId ? sessionsById.get(socket.sessionId) : null;

  if (!session || session.role !== "host") {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.NOT_AUTHORIZED, "Only the host can do this", {
      event,
      roomId,
      questionId: null,
    });
    return null;
  }

  const room = roomsById.get(roomId);
  if (!room) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.ROOM_NOT_FOUND, "Room not found", {
      event,
      roomId,
      questionId: null,
    });
    return null;
  }

  if (session.roomId !== room.id) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.NOT_AUTHORIZED, "Host is not in this room", {
      event,
      roomId: room.id,
      questionId: null,
    });
    return null;
  }

  return room;
}

export function handleQuestionForceClose(socket: TrackedWebSocket, roomId: string): void {
  const room = getAuthorizedHostRoom(socket, roomId, EVENTS.QUESTION_FORCE_CLOSE);
  if (!room) return;

  if (room.state !== RoomState.InGame || room.gameState !== GameState.QuestionActive) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.INVALID_STATE, "No active question to close", {
      event: EVENTS.QUESTION_FORCE_CLOSE,
      roomId: room.id,
      questionId: null,
    });
    return;
  }

  closeQuestion(room);
}

export function handleGameShowScoreboard(socket: TrackedWebSocket, roomId: string): void {
  const room = getAuthorizedHostRoom(socket, roomId, EVENTS.GAME_SHOW_SCOREBOARD);
  if (!room) return;

  if (
    room.state !== RoomState.InGame ||
    room.gameState !== GameState.Revealing ||
    !room.quiz ||
    room.currentQuestionIndex === null
  ) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.INVALID_STATE, "Cannot show scoreboard now", {
      event: EVENTS.GAME_SHOW_SCOREBOARD,
      roomId: room.id,
      questionId: null,
    });
    return;
  }

  if (room.revealTimer) {
    clearTimeout(room.revealTimer);
    room.revealTimer = null;
  }

  const question = room.quiz.questions[room.currentQuestionIndex];
  if (!question || question.isDemoQuestion || isLastQuestion(room)) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.INVALID_STATE, "Cannot show scoreboard now", {
      event: EVENTS.GAME_SHOW_SCOREBOARD,
      roomId: room.id,
      questionId: question?.id ?? null,
    });
    return;
  }

  showScoreboard(room, question.id);
}

export function handleGameFinishNow(socket: TrackedWebSocket, roomId: string): void {
  const room = getAuthorizedHostRoom(socket, roomId, EVENTS.GAME_FINISH_NOW);
  if (!room) return;

  if (room.state !== RoomState.InGame) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.INVALID_STATE, "No game in progress", {
      event: EVENTS.GAME_FINISH_NOW,
      roomId: room.id,
      questionId: null,
    });
    return;
  }

  finishGame(room);
}

export function handlePlayerRemove(
  socket: TrackedWebSocket,
  payload: import("@quiz/shared-protocol").PlayerRemovePayload,
): void {
  const room = getAuthorizedHostRoom(socket, payload.roomId, EVENTS.PLAYER_REMOVE);
  if (!room) return;

  const player = room.players.find((entry) => entry.id === payload.playerId);
  if (!player) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.PLAYER_NOT_FOUND, "Player not found", {
      event: EVENTS.PLAYER_REMOVE,
      roomId: room.id,
      questionId: null,
    });
    return;
  }

  removePlayerFromRoom(room, payload.playerId);
  broadcastToAllRoomClients(room, EVENTS.LOBBY_UPDATE, {
    roomId: room.id,
    roomState: room.state,
    hostConnected: room.hostConnected,
    displayConnected: room.displayConnected,
    settings: room.settings,
    players: room.players.map((entry) => ({
      playerId: entry.id,
      name: entry.name,
      connected: entry.state !== PlayerState.Disconnected,
      score: entry.score,
    })),
    playerCount: room.players.length,
  });
  handleAnswerEligibilityChanged(room);
  handleScoreboardReadinessChanged(room);
}

export function handleAnswerSubmit(
  socket: TrackedWebSocket,
  payload: import("@quiz/shared-protocol").AnswerSubmitPayload,
): void {
  const room = roomsById.get(payload.roomId);

  if (!room) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.ROOM_NOT_FOUND, "Room not found", {
      event: EVENTS.ANSWER_SUBMIT,
      roomId: payload.roomId,
      questionId: payload.questionId,
    });
    return;
  }

  if (
    !room.quiz ||
    room.currentQuestionIndex === null ||
    room.currentQuestionIndex >= room.quiz.questions.length
  ) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.INVALID_STATE, "No active question", {
      event: EVENTS.ANSWER_SUBMIT,
      roomId: room.id,
      questionId: payload.questionId,
    });
    return;
  }

  const currentQuestion = room.quiz.questions[room.currentQuestionIndex];

  if (payload.questionId !== currentQuestion.id) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.INVALID_STATE, "Wrong question id", {
      event: EVENTS.ANSWER_SUBMIT,
      roomId: room.id,
      questionId: payload.questionId,
    });
    return;
  }

  const session = socket.sessionId ? sessionsById.get(socket.sessionId) : null;

  if (!session || session.role !== "player" || session.roomId !== room.id) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.NOT_AUTHORIZED, "Not a player in this room", {
      event: EVENTS.ANSWER_SUBMIT,
      roomId: room.id,
      questionId: payload.questionId,
    });
    return;
  }

  if (session.playerId !== payload.playerId) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.NOT_AUTHORIZED, "Player ID mismatch", {
      event: EVENTS.ANSWER_SUBMIT,
      roomId: room.id,
      questionId: payload.questionId,
    });
    return;
  }

  const player = room.players.find((p) => p.id === session.playerId);

  if (!player || player.state === PlayerState.Disconnected) {
    sendProtocolError(
      socket,
      PROTOCOL_ERROR_CODES.PLAYER_NOT_FOUND,
      "Player not found or disconnected",
      {
        event: EVENTS.ANSWER_SUBMIT,
        roomId: room.id,
        questionId: payload.questionId,
      },
    );
    return;
  }

  if (room.gameState !== GameState.QuestionActive) {
    sendEvent(socket, EVENTS.ANSWER_REJECTED, {
      roomId: room.id,
      questionId: payload.questionId,
      playerId: player.id,
      status: "rejected",
      reason:
        room.gameState === GameState.AnswerLocked ||
        room.gameState === GameState.Revealing ||
        room.gameState === GameState.Scoreboard ||
        room.gameState === GameState.Completed
          ? "late"
          : "invalid_state",
    });
    return;
  }

  if (room.currentAnswers.has(player.id)) {
    sendEvent(socket, EVENTS.ANSWER_REJECTED, {
      roomId: room.id,
      questionId: payload.questionId,
      playerId: player.id,
      status: "rejected",
      reason: "duplicate",
    });
    return;
  }

  if (!isAnswerValidForQuestion(currentQuestion, payload.answer)) {
    sendEvent(socket, EVENTS.ANSWER_REJECTED, {
      roomId: room.id,
      questionId: payload.questionId,
      playerId: player.id,
      status: "rejected",
      reason: "invalid_payload",
    });
    return;
  }

  const now = Date.now();
  const submittedAnswer: SubmittedAnswer = {
    playerId: player.id,
    questionId: payload.questionId,
    answer: payload.answer,
    submittedAtMs: Math.max(0, now - (room.questionStartedAt ?? now)),
    requestId: payload.requestId,
  };

  room.currentAnswers.set(player.id, submittedAnswer);
  player.state = PlayerState.Answered;

  logRoomEvent("answer:submit", room, {
    playerId: player.id,
    questionId: payload.questionId,
  });

  sendEvent(socket, EVENTS.ANSWER_ACCEPTED, {
    roomId: room.id,
    questionId: payload.questionId,
    playerId: player.id,
    status: "accepted",
  });

  handleAnswerEligibilityChanged(room);
}

export function handleNextQuestionReady(
  socket: TrackedWebSocket,
  payload: import("@quiz/shared-protocol").NextQuestionReadyPayload,
): void {
  const room = roomsById.get(payload.roomId);

  if (!room) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.ROOM_NOT_FOUND, "Room not found", {
      event: EVENTS.NEXT_QUESTION_READY,
      roomId: payload.roomId,
      questionId: payload.questionId,
    });
    return;
  }

  if (
    room.state !== RoomState.InGame ||
    (room.gameState !== GameState.Revealing && room.gameState !== GameState.Scoreboard)
  ) {
    sendProtocolError(
      socket,
      PROTOCOL_ERROR_CODES.INVALID_STATE,
      "Next question readiness is only accepted during reveal or scoreboard",
      {
        event: EVENTS.NEXT_QUESTION_READY,
        roomId: room.id,
        questionId: payload.questionId,
      },
    );
    return;
  }

  if (
    !room.quiz ||
    room.currentQuestionIndex === null ||
    room.currentQuestionIndex >= room.quiz.questions.length
  ) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.INVALID_STATE, "No active question", {
      event: EVENTS.NEXT_QUESTION_READY,
      roomId: room.id,
      questionId: payload.questionId,
    });
    return;
  }

  const currentQuestion = room.quiz.questions[room.currentQuestionIndex];

  if (payload.questionId !== currentQuestion.id) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.INVALID_STATE, "Wrong question id", {
      event: EVENTS.NEXT_QUESTION_READY,
      roomId: room.id,
      questionId: payload.questionId,
    });
    return;
  }

  const session = socket.sessionId ? sessionsById.get(socket.sessionId) : null;

  if (!session || session.role !== "player" || session.roomId !== room.id) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.NOT_AUTHORIZED, "Not a player in this room", {
      event: EVENTS.NEXT_QUESTION_READY,
      roomId: room.id,
      questionId: payload.questionId,
    });
    return;
  }

  if (session.playerId !== payload.playerId) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.NOT_AUTHORIZED, "Player ID mismatch", {
      event: EVENTS.NEXT_QUESTION_READY,
      roomId: room.id,
      questionId: payload.questionId,
    });
    return;
  }

  const player = room.players.find((entry) => entry.id === session.playerId);

  if (!player || player.state === PlayerState.Disconnected) {
    sendProtocolError(
      socket,
      PROTOCOL_ERROR_CODES.PLAYER_NOT_FOUND,
      "Player not found or disconnected",
      {
        event: EVENTS.NEXT_QUESTION_READY,
        roomId: room.id,
        questionId: payload.questionId,
      },
    );
    return;
  }

  room.nextQuestionReadyPlayerIds.add(player.id);
  room.lastActivityAt = Date.now();

  logRoomEvent("next-question:ready", room, {
    playerId: player.id,
    questionId: payload.questionId,
  });

  handleScoreboardReadinessChanged(room);
}

function clearActiveQuestionTimers(room: RoomRecord): void {
  if (room.countdownTimer) {
    clearTimeout(room.countdownTimer);
    room.countdownTimer = null;
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
}

function startQuestion(room: RoomRecord): void {
  if (
    !room.quiz ||
    room.currentQuestionIndex === null ||
    room.currentQuestionIndex >= room.quiz.questions.length
  )
    return;

  clearActiveQuestionTimers(room);
  const question = room.quiz.questions[room.currentQuestionIndex];

  if (room.resolvedGamePlan?.displayShowLevel === "high") {
    const countdownMs = 2_500;
    room.gameState = GameState.Idle;
    room.questionStartedAt = null;
    broadcastToAllRoomClients(room, EVENTS.QUESTION_COUNTDOWN, {
      roomId: room.id,
      questionIndex: getVisibleQuestionIndex(room),
      totalQuestionCount: getTotalQuestionCount(room),
      countdownMs,
      displayShowLevel: room.resolvedGamePlan.displayShowLevel,
      ...(question.isDemoQuestion ? { isDemoQuestion: true } : {}),
    });

    room.countdownTimer = setTimeout(() => {
      room.countdownTimer = null;
      if (
        room.state !== RoomState.InGame ||
        !room.quiz ||
        room.currentQuestionIndex === null ||
        room.quiz.questions[room.currentQuestionIndex]?.id !== question.id
      ) {
        return;
      }

      activateQuestion(room, question);
    }, countdownMs);
    return;
  }

  activateQuestion(room, question);
}

function activateQuestion(room: RoomRecord, question: Question): void {
  const now = Date.now();

  room.gameState = GameState.QuestionActive;
  room.currentAnswers.clear();
  room.nextQuestionReadyPlayerIds.clear();
  room.questionStartedAt = now;
  room.lastRoundResult = null;

  for (const player of room.players) {
    if (player.state !== PlayerState.Disconnected) {
      player.state = PlayerState.Answering;
    }
  }

  logRoomEvent("question:show", room, {
    questionIndex: room.currentQuestionIndex ?? 0,
    questionId: question.id,
  });

  sendQuestionToRoom(room, question, GameState.QuestionActive);
  handleAnswerEligibilityChanged(room);

  const remainingMs = () => {
    const elapsed = Date.now() - now;
    return Math.max(0, question.durationMs - elapsed);
  };

  room.timerTickInterval = setInterval(() => {
    const ms = remainingMs();
    broadcastToAllRoomClients(room, EVENTS.QUESTION_TIMER, {
      roomId: room.id,
      questionId: question.id,
      remainingMs: ms,
    });

    if (ms <= 0) {
      if (room.timerTickInterval) {
        clearInterval(room.timerTickInterval);
        room.timerTickInterval = null;
      }
    }
  }, 500);

  room.questionTimer = setTimeout(() => {
    if (room.timerTickInterval) {
      clearInterval(room.timerTickInterval);
      room.timerTickInterval = null;
    }
    closeQuestion(room);
  }, question.durationMs);
}

export function handleAnswerEligibilityChanged(room: RoomRecord): void {
  if (room.gameState !== GameState.QuestionActive) {
    return;
  }

  if (
    !room.quiz ||
    room.currentQuestionIndex === null ||
    room.currentQuestionIndex >= room.quiz.questions.length
  ) {
    return;
  }

  const question = room.quiz.questions[room.currentQuestionIndex];
  const progress = getAnswerProgress(room);

  broadcastToHostAndDisplay(room, EVENTS.ANSWER_PROGRESS, {
    roomId: room.id,
    questionId: question.id,
    answeredCount: progress.answeredCount,
    totalEligiblePlayers: progress.totalEligiblePlayers,
  });

  if (
    progress.totalEligiblePlayers > 0 &&
    progress.answeredCount >= progress.totalEligiblePlayers
  ) {
    closeQuestion(room);
  }
}

export function getAnswerProgress(room: Pick<RoomRecord, "players" | "currentAnswers">): {
  answeredCount: number;
  totalEligiblePlayers: number;
} {
  const connectedPlayers = room.players.filter(
    (player) => player.state !== PlayerState.Disconnected,
  );

  return {
    answeredCount: connectedPlayers.filter((player) => room.currentAnswers.has(player.id)).length,
    totalEligiblePlayers: connectedPlayers.length,
  };
}

function closeQuestion(room: RoomRecord): void {
  if (room.gameState !== GameState.QuestionActive) return;

  if (room.questionTimer) {
    clearTimeout(room.questionTimer);
    room.questionTimer = null;
  }
  if (room.timerTickInterval) {
    clearInterval(room.timerTickInterval);
    room.timerTickInterval = null;
  }

  room.gameState = GameState.AnswerLocked;

  if (
    !room.quiz ||
    room.currentQuestionIndex === null ||
    room.currentQuestionIndex >= room.quiz.questions.length
  )
    return;

  const question = room.quiz.questions[room.currentQuestionIndex];

  logRoomEvent("question:close", room, {
    questionId: question.id,
    answerCount: room.currentAnswers.size,
  });

  broadcastToAllRoomClients(room, EVENTS.QUESTION_CLOSE, {
    roomId: room.id,
    questionId: question.id,
    gameState: GameState.AnswerLocked,
  });

  evaluateQuestion(room, question);
}

function evaluateQuestion(room: RoomRecord, question: Question): void {
  const answers = [...room.currentAnswers.values()];
  const previousScoreboard = getSortedScoreboard(room);
  const roundResult = (() => {
    switch (question.type) {
      case QuestionType.MultipleChoice:
      case QuestionType.Logic:
        return evaluateMultipleChoice(question, answers);
      case QuestionType.MajorityGuess:
        return evaluateMajorityGuess(question, answers);
      case QuestionType.Estimate:
        return evaluateEstimate(question, answers);
      case QuestionType.Ranking:
        return evaluateRanking(
          question,
          answers,
          room.resolvedGamePlan?.rankingScoringMode ?? "exact",
        );
      case QuestionType.OpenText:
        return evaluateOpenText(question, answers);
    }
  })();

  const connectedPlayers = room.players.filter((p) => p.state !== PlayerState.Disconnected);
  const answeringPlayerIds = new Set(answers.map((a) => a.playerId));

  for (const player of connectedPlayers) {
    if (!answeringPlayerIds.has(player.id)) {
      roundResult.playerResults.push({
        playerId: player.id,
        answer: null,
        isCorrect: false,
        pointsEarned: 0,
      });
    }
  }

  for (const result of roundResult.playerResults) {
    const player = room.players.find((p) => p.id === result.playerId);
    if (player) {
      player.score += result.pointsEarned;
    }
  }

  const nextScoreboard = getSortedScoreboard(room);
  room.lastScoreChanges = buildScoreChanges(previousScoreboard, nextScoreboard);
  room.lastRoundResult = roundResult;
  if (!question.isDemoQuestion) {
    room.completedRoundResults.push(roundResult);
    room.completedAnswers.push(...answers);
  }
  room.gameState = GameState.Revealing;

  logRoomEvent("question:reveal", room, {
    questionId: question.id,
    correctAnswer: JSON.stringify(roundResult.correctAnswer.value),
    right: roundResult.playerResults.filter((result) => result.isCorrect).length,
    wrong: roundResult.playerResults.filter((result) => !result.isCorrect && result.answer).length,
    missing: roundResult.playerResults.filter((result) => !result.answer).length,
  });

  broadcastToAllRoomClients(room, EVENTS.QUESTION_REVEAL, {
    roomId: room.id,
    questionId: question.id,
    correctAnswer: roundResult.correctAnswer,
    playerResults: roundResult.playerResults,
    gameState: GameState.Revealing,
    explanation: question.explanation,
  });

  broadcastNextQuestionReadyProgress(room, question.id, GameState.Revealing);
}

function getSortedScoreboard(room: RoomRecord) {
  return room.players
    .filter((p) => p.state !== PlayerState.Disconnected)
    .map((p) => ({
      playerId: p.id,
      name: p.name,
      score: p.score,
    }))
    .sort((a, b) => b.score - a.score);
}

function getAnsweredVisibleQuestionNumber(room: RoomRecord): number {
  if (!room.quiz || room.currentQuestionIndex === null) {
    return 0;
  }

  const currentQuestion = room.quiz.questions[room.currentQuestionIndex];
  if (!currentQuestion || currentQuestion.isDemoQuestion) {
    return 0;
  }

  return room.quiz.questions
    .slice(0, room.currentQuestionIndex + 1)
    .filter((question) => !question.isDemoQuestion).length;
}

function isLastQuestion(room: RoomRecord): boolean {
  return (
    !!room.quiz &&
    room.currentQuestionIndex !== null &&
    room.currentQuestionIndex + 1 >= room.quiz.questions.length
  );
}

function shouldShowScoreboardAfterCurrentQuestion(room: RoomRecord): boolean {
  if (!room.quiz || room.currentQuestionIndex === null) {
    return false;
  }

  const currentQuestion = room.quiz.questions[room.currentQuestionIndex];
  if (!currentQuestion || currentQuestion.isDemoQuestion || isLastQuestion(room)) {
    return false;
  }

  const answeredQuestionNumber = getAnsweredVisibleQuestionNumber(room);
  return answeredQuestionNumber > 0 && answeredQuestionNumber % SCOREBOARD_INTERVAL === 0;
}

function buildScoreChanges(
  previousScoreboard: ReturnType<typeof getSortedScoreboard>,
  nextScoreboard: ReturnType<typeof getSortedScoreboard>,
): ScoreChange[] {
  const previousByPlayerId = new Map(
    previousScoreboard.map((entry, index) => [
      entry.playerId,
      { score: entry.score, rank: index + 1 },
    ]),
  );

  return nextScoreboard
    .map((entry, index) => {
      const previous = previousByPlayerId.get(entry.playerId) ?? {
        score: 0,
        rank: nextScoreboard.length,
      };

      return {
        playerId: entry.playerId,
        name: entry.name,
        previousScore: previous.score,
        score: entry.score,
        delta: Math.max(0, entry.score - previous.score),
        previousRank: previous.rank,
        rank: index + 1,
      };
    })
    .filter((change) => change.delta > 0 || change.previousRank !== change.rank);
}

function showScoreboard(room: RoomRecord, questionId: string): void {
  room.gameState = GameState.Scoreboard;
  room.nextQuestionReadyPlayerIds.clear();

  const scoreboard = getSortedScoreboard(room);

  broadcastToAllRoomClients(room, EVENTS.SCORE_UPDATE, {
    roomId: room.id,
    questionId,
    scoreboard,
    scoreChanges: room.lastScoreChanges,
    gameState: GameState.Scoreboard,
  });

  broadcastNextQuestionReadyProgress(room, questionId, GameState.Scoreboard);
}

export function handleScoreboardReadinessChanged(room: RoomRecord): void {
  if (
    room.state !== RoomState.InGame ||
    (room.gameState !== GameState.Revealing && room.gameState !== GameState.Scoreboard)
  ) {
    return;
  }

  if (
    !room.quiz ||
    room.currentQuestionIndex === null ||
    room.currentQuestionIndex >= room.quiz.questions.length
  ) {
    return;
  }

  const question = room.quiz.questions[room.currentQuestionIndex];
  const connectedPlayers = room.players.filter(
    (player) => player.state !== PlayerState.Disconnected,
  );

  broadcastNextQuestionReadyProgress(room, question.id, room.gameState);

  if (
    connectedPlayers.length > 0 &&
    connectedPlayers.every((player) => room.nextQuestionReadyPlayerIds.has(player.id))
  ) {
    if (room.gameState === GameState.Revealing) {
      advanceAfterReveal(room);
      return;
    }

    advanceFromScoreboard(room);
  }
}

function broadcastNextQuestionReadyProgress(
  room: RoomRecord,
  questionId: string,
  gameState: GameState.Revealing | GameState.Scoreboard,
): void {
  const connectedPlayers = room.players.filter(
    (player) => player.state !== PlayerState.Disconnected,
  );
  const readyPlayerIds = connectedPlayers
    .filter((player) => room.nextQuestionReadyPlayerIds.has(player.id))
    .map((player) => player.id);

  broadcastToAllRoomClients(room, EVENTS.NEXT_QUESTION_READY_PROGRESS, {
    roomId: room.id,
    questionId,
    readyCount: readyPlayerIds.length,
    totalEligiblePlayers: connectedPlayers.length,
    readyPlayerIds,
    gameState,
  });
}

function advanceAfterReveal(room: RoomRecord): void {
  if (!room.quiz || room.currentQuestionIndex === null) {
    return;
  }

  if (shouldShowScoreboardAfterCurrentQuestion(room)) {
    const question = room.quiz.questions[room.currentQuestionIndex];
    if (question) {
      showScoreboard(room, question.id);
    }
    return;
  }

  advanceToNextQuestionOrFinish(room);
}

function advanceFromScoreboard(room: RoomRecord): void {
  advanceToNextQuestionOrFinish(room);
}

function advanceToNextQuestionOrFinish(room: RoomRecord): void {
  if (!room.quiz || room.currentQuestionIndex === null) {
    return;
  }

  const nextIndex = room.currentQuestionIndex + 1;

  if (nextIndex >= room.quiz.questions.length) {
    finishGame(room);
    return;
  }

  room.currentQuestionIndex = nextIndex;
  startQuestion(room);
}

function finishGame(room: RoomRecord): void {
  clearActiveQuestionTimers(room);

  room.state = RoomState.Completed;
  room.gameState = GameState.Completed;
  room.nextQuestionReadyPlayerIds.clear();

  const finalScoreboard = getSortedScoreboard(room);

  logRoomEvent("game:finished", room, {});

  broadcastToAllRoomClients(room, EVENTS.GAME_FINISHED, {
    roomId: room.id,
    roomState: RoomState.Completed,
    gameState: GameState.Completed,
    totalQuestionCount: getTotalQuestionCount(room),
    finalScoreboard,
    finalStats: buildFinalStats(room),
  });
}

function buildFinalStats(room: RoomRecord): GameFinalStats | undefined {
  const completedResults = room.completedRoundResults;
  if (!completedResults.length) {
    return undefined;
  }

  const playerById = new Map(room.players.map((player) => [player.id, player]));
  const correctCounts = new Map<string, number>();
  let fastest: { playerId: string; submittedAtMs: number } | null = null;

  for (const result of completedResults) {
    for (const playerResult of result.playerResults) {
      if (playerResult.isCorrect) {
        correctCounts.set(
          playerResult.playerId,
          (correctCounts.get(playerResult.playerId) ?? 0) + 1,
        );
      }
    }
  }

  for (const submittedAnswer of room.completedAnswers) {
    if (!fastest || submittedAnswer.submittedAtMs < fastest.submittedAtMs) {
      fastest = {
        playerId: submittedAnswer.playerId,
        submittedAtMs: submittedAnswer.submittedAtMs,
      };
    }
  }

  const mostCorrectEntry = [...correctCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const scoreboard = getSortedScoreboard(room);
  const gaps = scoreboard
    .slice(1)
    .map((entry, index) => Math.abs(scoreboard[index].score - entry.score));
  const closestGap = gaps.length ? Math.min(...gaps) : undefined;

  return {
    ...(mostCorrectEntry && playerById.get(mostCorrectEntry[0])
      ? {
          mostCorrect: {
            playerId: mostCorrectEntry[0],
            name: playerById.get(mostCorrectEntry[0])!.name,
            count: mostCorrectEntry[1],
          },
        }
      : {}),
    ...(fastest && playerById.get(fastest.playerId)
      ? {
          fastestAnswer: {
            playerId: fastest.playerId,
            name: playerById.get(fastest.playerId)!.name,
            submittedAtMs: fastest.submittedAtMs,
          },
        }
      : {}),
    ...(closestGap !== undefined ? { closestGap: { points: closestGap } } : {}),
  };
}

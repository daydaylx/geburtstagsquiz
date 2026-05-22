import {
  evaluateEstimate,
  evaluateMajorityGuess,
  evaluateMultipleChoice,
  evaluateOpenText,
  evaluateRanking,
} from "@quiz/quiz-engine";
import { EVENTS, type GameStartPayload, type QuestionShowPayload } from "@quiz/shared-protocol";
import type { Question, ResolvedGamePlan, SubmittedAnswer } from "@quiz/shared-types";
import { GameState, PlayerState, QuestionType, RoomState } from "@quiz/shared-types";
import { assertUnreachable } from "@quiz/shared-utils";
import { isAnswerValidForQuestion } from "./answer-validation.js";
import { COMPLETED_ROOM_TTL_MS } from "./config.js";
import {
  broadcastLobbyUpdate,
  broadcastToAllRoomClients,
  broadcastToHostAndDisplay,
  sendToHost,
} from "./connection.js";
import {
  buildCatalogSummary,
  buildDefaultGamePlan,
  createDemoQuestion,
  GamePlanValidationError,
  resolveGamePlan,
  selectQuestionsForGamePlan,
} from "./game-plan.js";
import {
  buildFinalStats,
  buildScoreChanges,
  isLastQuestion,
  shouldShowScoreboardAfterCurrentQuestion,
} from "./game-scoreboard.js";
import { PROTOCOL_ERROR_CODES, sendEvent, sendProtocolError } from "./protocol.js";
import {
  getTotalQuestionCount,
  getVisibleQuestionIndex,
  toQuestionControllerPayload,
  toQuestionShowPayload,
} from "./question-payloads.js";
import { getDefaultQuiz } from "./quiz-data.js";
import { closeRoom, removePlayerFromRoom } from "./room.js";
import { getConnectedPlayers, getSortedScoreboard } from "./room-selectors.js";
import { clearActiveRoomTimers } from "./room-timers.js";
import type { RoomRecord, TrackedWebSocket } from "./server-types.js";
import { logRoomEvent, roomsById, sessionsById } from "./state.js";

function sendQuestionForCurrentRole(
  sessionSocket: TrackedWebSocket | null | undefined,
  role: "host" | "player" | "display",
  room: RoomRecord,
  question: Question,
  gameState: QuestionShowPayload["gameState"],
): void {
  if (role === "host" || role === "display") {
    sendEvent(sessionSocket, EVENTS.QUESTION_SHOW, toQuestionShowPayload(room, question, gameState));
    return;
  }

  sendEvent(sessionSocket, EVENTS.QUESTION_CONTROLLER, toQuestionControllerPayload(room, question, gameState));
}

function sendQuestionToRoom(room: RoomRecord, question: Question, gameState: QuestionShowPayload["gameState"]): void {
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
  const room = getAuthorizedHostRoom(socket, roomId, EVENTS.GAME_START);
  if (!room) return;

  if (room.state !== RoomState.Waiting) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.INVALID_STATE, "Game can only be started from waiting state", {
      event: EVENTS.GAME_START,
      roomId: room.id,
      questionId: null,
    });
    return;
  }

  const connectedPlayers = getConnectedPlayers(room);

  if (connectedPlayers.length === 0) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.INVALID_STATE, "Need at least 1 connected player to start", {
      event: EVENTS.GAME_START,
      roomId: room.id,
      questionId: null,
    });
    return;
  }

  const defaultQuiz = getDefaultQuiz();
  const catalog = buildCatalogSummary(defaultQuiz);
  const basePlan = payload.gamePlan ?? buildDefaultGamePlan(catalog);
  const requestedGamePlan = basePlan;
  let resolvedGamePlan: ResolvedGamePlan;
  let selectedQuestions: Question[];

  try {
    resolvedGamePlan = resolveGamePlan(requestedGamePlan, catalog, defaultQuiz);
    selectedQuestions = selectQuestionsForGamePlan(defaultQuiz.questions, resolvedGamePlan);
  } catch (error) {
    const message =
      error instanceof GamePlanValidationError ? error.message : "Spielplan konnte nicht validiert werden.";
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
    ...room.settings,
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
  const room = getAuthorizedHostRoom(socket, roomId, EVENTS.GAME_NEXT_QUESTION);
  if (!room) return;

  if (room.state !== RoomState.InGame) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.INVALID_STATE, "No game in progress", {
      event: EVENTS.GAME_NEXT_QUESTION,
      roomId: room.id,
      questionId: null,
    });
    return;
  }

  if (
    room.gameState !== GameState.Scoreboard &&
    room.gameState !== GameState.Revealing &&
    room.gameState !== GameState.AnswerLocked
  ) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.INVALID_STATE, "Cannot advance from current state", {
      event: EVENTS.GAME_NEXT_QUESTION,
      roomId: room.id,
      questionId: null,
    });
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

  if (room.gameState === GameState.AnswerLocked && room.revealDelayTimer) {
    clearTimeout(room.revealDelayTimer);
    room.revealDelayTimer = null;
    const question = room.quiz!.questions[room.currentQuestionIndex!];
    evaluateQuestion(room, question);
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
  event: (typeof EVENTS)[keyof typeof EVENTS],
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
  broadcastLobbyUpdate(room);
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

  if (!room.quiz || room.currentQuestionIndex === null || room.currentQuestionIndex >= room.quiz.questions.length) {
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
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.PLAYER_NOT_FOUND, "Player not found or disconnected", {
      event: EVENTS.ANSWER_SUBMIT,
      roomId: room.id,
      questionId: payload.questionId,
    });
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

  const isAnswerChange = room.currentAnswers.has(player.id);

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

  logRoomEvent(isAnswerChange ? "answer:change" : "answer:submit", room, {
    playerId: player.id,
    questionId: payload.questionId,
  });

  sendEvent(socket, EVENTS.ANSWER_ACCEPTED, {
    roomId: room.id,
    questionId: payload.questionId,
    playerId: player.id,
    status: "accepted",
  });

  if (!isAnswerChange) {
    handleAnswerEligibilityChanged(room);
  }
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

  if (!room.quiz || room.currentQuestionIndex === null || room.currentQuestionIndex >= room.quiz.questions.length) {
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
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.PLAYER_NOT_FOUND, "Player not found or disconnected", {
      event: EVENTS.NEXT_QUESTION_READY,
      roomId: room.id,
      questionId: payload.questionId,
    });
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

function startQuestion(room: RoomRecord): void {
  if (!room.quiz || room.currentQuestionIndex === null || room.currentQuestionIndex >= room.quiz.questions.length)
    return;

  clearActiveRoomTimers(room);
  const question = room.quiz.questions[room.currentQuestionIndex];

  if (room.resolvedGamePlan?.displayShowLevel === "high") {
    const countdownMs = 2_500;
    room.gameState = GameState.Idle;
    room.questionStartedAt = null;
    room.countdownStartedAt = Date.now();
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
      room.countdownStartedAt = null;
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
    if (room.gameState !== GameState.QuestionActive) {
      if (room.timerTickInterval) {
        clearInterval(room.timerTickInterval);
        room.timerTickInterval = null;
      }
      return;
    }

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
    room.questionTimer = null;
    if (room.gameState !== GameState.QuestionActive) {
      return;
    }

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

  if (!room.quiz || room.currentQuestionIndex === null || room.currentQuestionIndex >= room.quiz.questions.length) {
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

  if (progress.totalEligiblePlayers > 0 && progress.answeredCount >= progress.totalEligiblePlayers) {
    closeQuestion(room);
  }
}

export function getAnswerProgress(room: Pick<RoomRecord, "players" | "currentAnswers">): {
  answeredCount: number;
  totalEligiblePlayers: number;
} {
  const connectedPlayers = getConnectedPlayers(room);

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

  if (!room.quiz || room.currentQuestionIndex === null || room.currentQuestionIndex >= room.quiz.questions.length)
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

  const revealDelayMs = room.resolvedGamePlan?.revealDelayMs ?? 0;
  if (revealDelayMs > 0) {
    room.revealDelayTimer = setTimeout(() => {
      room.revealDelayTimer = null;
      if (
        room.state !== RoomState.InGame ||
        !room.quiz ||
        room.currentQuestionIndex === null ||
        room.quiz.questions[room.currentQuestionIndex]?.id !== question.id
      ) {
        return;
      }
      evaluateQuestion(room, question);
    }, revealDelayMs);
  } else {
    evaluateQuestion(room, question);
  }
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
        return evaluateRanking(question, answers, room.resolvedGamePlan?.rankingScoringMode ?? "exact");
      case QuestionType.OpenText:
        return evaluateOpenText(question, answers);
      default:
        return assertUnreachable(question, "Unhandled question type");
    }
  })();

  const connectedPlayers = getConnectedPlayers(room);
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
    ...(question.type === QuestionType.Estimate ? { estimateContext: question.context } : {}),
  });

  broadcastNextQuestionReadyProgress(room, question.id, GameState.Revealing);

  const revealDurationMs = room.resolvedGamePlan?.revealDurationMs;
  if (revealDurationMs) {
    room.revealTimer = setTimeout(() => {
      room.revealTimer = null;
      advanceAfterReveal(room);
    }, revealDurationMs);
  }
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

  if (!room.quiz || room.currentQuestionIndex === null || room.currentQuestionIndex >= room.quiz.questions.length) {
    return;
  }

  const question = room.quiz.questions[room.currentQuestionIndex];
  const connectedPlayers = getConnectedPlayers(room);

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
  const connectedPlayers = getConnectedPlayers(room);
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
  if (room.revealTimer) {
    clearTimeout(room.revealTimer);
    room.revealTimer = null;
  }

  if (room.state !== RoomState.InGame || room.gameState !== GameState.Revealing) {
    return;
  }

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
  clearActiveRoomTimers(room);

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

  room.completedRoomTtlTimer = setTimeout(() => {
    if (room.state === RoomState.Completed) {
      closeRoom(room, "Completed room auto-cleanup");
    }
  }, COMPLETED_ROOM_TTL_MS);
}

export function handleGameRestart(socket: TrackedWebSocket, roomId: string): void {
  const room = roomsById.get(roomId);

  if (!room) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.ROOM_NOT_FOUND, "Room not found", {
      event: EVENTS.GAME_RESTART,
      roomId,
      questionId: null,
    });
    return;
  }

  const session = socket.sessionId ? sessionsById.get(socket.sessionId) : null;
  if (!session || session.role !== "host" || session.roomId !== room.id) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.NOT_AUTHORIZED, "Only the host can restart", {
      event: EVENTS.GAME_RESTART,
      roomId: room.id,
      questionId: null,
    });
    return;
  }

  if (room.state !== RoomState.Completed) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.INVALID_STATE, "Room is not in completed state", {
      event: EVENTS.GAME_RESTART,
      roomId: room.id,
      questionId: null,
    });
    return;
  }

  clearActiveRoomTimers(room);

  if (room.displayDisconnectTimer) {
    clearTimeout(room.displayDisconnectTimer);
    room.displayDisconnectTimer = null;
  }

  if (room.hostDisconnectTimer) {
    clearTimeout(room.hostDisconnectTimer);
    room.hostDisconnectTimer = null;
  }

  for (const timer of room.playerDisconnectTimers.values()) {
    clearTimeout(timer);
  }
  room.playerDisconnectTimers.clear();

  room.state = RoomState.Waiting;
  room.gameState = null;
  room.quiz = null;
  room.currentQuestionIndex = null;
  room.currentAnswers.clear();
  room.nextQuestionReadyPlayerIds.clear();
  room.questionStartedAt = null;
  room.lastRoundResult = null;
  room.lastScoreChanges = [];
  room.completedRoundResults = [];
  room.completedAnswers = [];
  room.categoryVotes.clear();

  for (const player of room.players) {
    player.state = PlayerState.Ready;
    player.score = 0;
  }

  logRoomEvent("game:restart", room, {});

  broadcastToAllRoomClients(room, EVENTS.ROOM_RESET, {
    roomId: room.id,
    roomState: RoomState.Waiting,
    joinCode: room.joinCode,
  });

  broadcastLobbyUpdate(room);
  sendToHost(room, EVENTS.CATALOG_SUMMARY, buildCatalogSummary(getDefaultQuiz()));
}

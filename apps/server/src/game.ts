import { EVENTS, type QuestionShowPayload } from "@quiz/shared-protocol";
import { evaluateEstimate, evaluateMultipleChoice, evaluateRanking } from "@quiz/quiz-engine";
import { GameState, PlayerState, QuestionType, RoomState } from "@quiz/shared-types";
import type { Question, SubmittedAnswer } from "@quiz/shared-types";

import { PROTOCOL_ERROR_CODES, sendEvent, sendProtocolError } from "./protocol.js";
import type { RoomRecord, TrackedWebSocket } from "./server-types.js";
import { roomsById, sessionsById, logRoomEvent } from "./state.js";
import { broadcastToRoom } from "./connection.js";
import { getDefaultQuiz } from "./quiz-data.js";
import { QUESTION_DURATION_MS, REVEAL_DURATION_MS } from "./config.js";
import { isAnswerValidForQuestion } from "./answer-validation.js";
import { toQuestionControllerPayload, toQuestionShowPayload } from "./question-payloads.js";

const EVENING_QUESTION_COUNT_PER_TYPE = 6;
const EVENING_QUESTION_TYPE_ORDER = [
  QuestionType.MultipleChoice,
  QuestionType.Logic,
  QuestionType.Estimate,
  QuestionType.MajorityGuess,
  QuestionType.Ranking,
] as const;

export function getEveningQuestions(questions: Question[]): Question[] {
  return EVENING_QUESTION_TYPE_ORDER.flatMap((questionType) =>
    questions
      .filter((question) => question.type === questionType)
      .slice(0, EVENING_QUESTION_COUNT_PER_TYPE)
      .map((question) => ({ ...question, durationMs: QUESTION_DURATION_MS })),
  );
}

function sendQuestionForCurrentRole(
  sessionSocket: TrackedWebSocket | null | undefined,
  role: "host" | "player",
  room: RoomRecord,
  question: Question,
  gameState: QuestionShowPayload["gameState"],
): void {
  if (role === "host") {
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
  const hostSession = sessionsById.get(room.hostSessionId);
  sendQuestionForCurrentRole(hostSession?.socket, "host", room, question, gameState);

  for (const player of room.players) {
    const session = sessionsById.get(player.sessionId);
    sendQuestionForCurrentRole(session?.socket, "player", room, question, gameState);
  }
}

export function handleGameStart(socket: TrackedWebSocket, roomId: string): void {
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
  room.quiz = {
    ...defaultQuiz,
    questions: getEveningQuestions(defaultQuiz.questions),
  };
  room.currentQuestionIndex = 0;
  room.state = RoomState.InGame;
  room.gameState = GameState.Idle;

  logRoomEvent("game:started", room, {});

  broadcastToRoom(room, EVENTS.GAME_STARTED, {
    roomId: room.id,
    roomState: RoomState.InGame,
    gameState: GameState.Idle,
    questionIndex: 0,
    totalQuestionCount: room.quiz.questions.length,
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

  const nextIndex = room.currentQuestionIndex + 1;

  if (nextIndex >= room.quiz.questions.length) {
    finishGame(room);
    return;
  }

  room.currentQuestionIndex = nextIndex;
  startQuestion(room);
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

  if (room.state !== RoomState.InGame || room.gameState !== GameState.Scoreboard) {
    sendProtocolError(
      socket,
      PROTOCOL_ERROR_CODES.INVALID_STATE,
      "Next question readiness is only accepted on scoreboard",
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

function startQuestion(room: RoomRecord): void {
  if (
    !room.quiz ||
    room.currentQuestionIndex === null ||
    room.currentQuestionIndex >= room.quiz.questions.length
  )
    return;

  if (room.revealTimer) {
    clearTimeout(room.revealTimer);
    room.revealTimer = null;
  }

  const question = room.quiz.questions[room.currentQuestionIndex];
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
    questionIndex: room.currentQuestionIndex,
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
    broadcastToRoom(room, EVENTS.QUESTION_TIMER, {
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
  const hostSession = sessionsById.get(room.hostSessionId);

  sendEvent(hostSession?.socket, EVENTS.ANSWER_PROGRESS, {
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

  broadcastToRoom(room, EVENTS.QUESTION_CLOSE, {
    roomId: room.id,
    questionId: question.id,
    gameState: GameState.AnswerLocked,
  });

  evaluateQuestion(room, question);
}

function evaluateQuestion(room: RoomRecord, question: Question): void {
  const answers = [...room.currentAnswers.values()];
  const roundResult = (() => {
    switch (question.type) {
      case QuestionType.MultipleChoice:
      case QuestionType.Logic:
        return evaluateMultipleChoice(question, answers);
      case QuestionType.Estimate:
      case QuestionType.MajorityGuess:
        return evaluateEstimate(question, answers);
      case QuestionType.Ranking:
        return evaluateRanking(question, answers);
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

  room.lastRoundResult = roundResult;
  room.gameState = GameState.Revealing;

  logRoomEvent("question:reveal", room, {
    questionId: question.id,
    correctAnswer: JSON.stringify(roundResult.correctAnswer.value),
    right: roundResult.playerResults.filter((result) => result.isCorrect).length,
    wrong: roundResult.playerResults.filter((result) => !result.isCorrect && result.answer).length,
    missing: roundResult.playerResults.filter((result) => !result.answer).length,
  });

  broadcastToRoom(room, EVENTS.QUESTION_REVEAL, {
    roomId: room.id,
    questionId: question.id,
    correctAnswer: roundResult.correctAnswer,
    playerResults: roundResult.playerResults,
    gameState: GameState.Revealing,
  });

  room.revealTimer = setTimeout(() => {
    room.revealTimer = null;

    if (room.state !== RoomState.InGame || room.gameState !== GameState.Revealing) {
      return;
    }

    if (
      !room.quiz ||
      room.currentQuestionIndex === null ||
      room.currentQuestionIndex >= room.quiz.questions.length
    ) {
      return;
    }

    const activeQuestion = room.quiz.questions[room.currentQuestionIndex];

    if (activeQuestion.id !== question.id) {
      return;
    }

    showScoreboard(room, question.id);
  }, REVEAL_DURATION_MS);
}

function showScoreboard(room: RoomRecord, questionId: string): void {
  room.gameState = GameState.Scoreboard;
  room.nextQuestionReadyPlayerIds.clear();

  const scoreboard = room.players
    .filter((p) => p.state !== PlayerState.Disconnected)
    .map((p) => ({
      playerId: p.id,
      name: p.name,
      score: p.score,
    }))
    .sort((a, b) => b.score - a.score);

  broadcastToRoom(room, EVENTS.SCORE_UPDATE, {
    roomId: room.id,
    questionId,
    scoreboard,
    gameState: GameState.Scoreboard,
  });

  broadcastNextQuestionReadyProgress(room, questionId);
}

export function handleScoreboardReadinessChanged(room: RoomRecord): void {
  if (room.state !== RoomState.InGame || room.gameState !== GameState.Scoreboard) {
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

  broadcastNextQuestionReadyProgress(room, question.id);

  if (
    connectedPlayers.length > 0 &&
    connectedPlayers.every((player) => room.nextQuestionReadyPlayerIds.has(player.id))
  ) {
    advanceFromScoreboard(room);
  }
}

function broadcastNextQuestionReadyProgress(room: RoomRecord, questionId: string): void {
  const connectedPlayers = room.players.filter(
    (player) => player.state !== PlayerState.Disconnected,
  );
  const readyPlayerIds = connectedPlayers
    .filter((player) => room.nextQuestionReadyPlayerIds.has(player.id))
    .map((player) => player.id);

  broadcastToRoom(room, EVENTS.NEXT_QUESTION_READY_PROGRESS, {
    roomId: room.id,
    questionId,
    readyCount: readyPlayerIds.length,
    totalEligiblePlayers: connectedPlayers.length,
    readyPlayerIds,
    gameState: GameState.Scoreboard,
  });
}

function advanceFromScoreboard(room: RoomRecord): void {
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

  room.state = RoomState.Completed;
  room.gameState = GameState.Completed;
  room.nextQuestionReadyPlayerIds.clear();

  const finalScoreboard = room.players
    .filter((p) => p.state !== PlayerState.Disconnected)
    .map((p) => ({
      playerId: p.id,
      name: p.name,
      score: p.score,
    }))
    .sort((a, b) => b.score - a.score);

  logRoomEvent("game:finished", room, {});

  broadcastToRoom(room, EVENTS.GAME_FINISHED, {
    roomId: room.id,
    roomState: RoomState.Completed,
    gameState: GameState.Completed,
    totalQuestionCount: room.quiz?.questions.length ?? 0,
    finalScoreboard,
  });
}

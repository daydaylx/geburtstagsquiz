import { EVENTS } from "@quiz/shared-protocol";
import { evaluateMultipleChoice } from "@quiz/quiz-engine";
import { GameState, PlayerState, RoomState } from "@quiz/shared-types";
import type { SubmittedAnswer } from "@quiz/shared-types";

import { PROTOCOL_ERROR_CODES, sendEvent, sendProtocolError } from "./protocol.js";
import type { RoomRecord, TrackedWebSocket } from "./server-types.js";
import { roomsById, sessionsById, logRoomEvent } from "./state.js";
import { broadcastToRoom } from "./connection.js";
import { broadcastLobbyUpdate } from "./lobby.js";
import { getDefaultQuiz } from "./quiz-data.js";

export function handleGameStart(socket: TrackedWebSocket, roomId: string): void {
  const session = socket.sessionId ? sessionsById.get(socket.sessionId) : null;

  if (!session || session.role !== "host") {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.NOT_AUTHORIZED, "Only the host can start the game", {
      event: EVENTS.GAME_START,
      roomId,
      questionId: null,
    });
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
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.INVALID_STATE, "Game can only be started from waiting state", {
      event: EVENTS.GAME_START,
      roomId: room.id,
      questionId: null,
    });
    return;
  }

  const connectedPlayers = room.players.filter((p) => p.state !== PlayerState.Disconnected);

  if (connectedPlayers.length === 0) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.INVALID_STATE, "Need at least 1 connected player to start", {
      event: EVENTS.GAME_START,
      roomId: room.id,
      questionId: null,
    });
    return;
  }

  room.quiz = getDefaultQuiz();
  room.currentQuestionIndex = 0;
  room.state = RoomState.InGame;
  room.gameState = GameState.Idle;

  logRoomEvent("game:started", room, {});

  broadcastToRoom(room, EVENTS.GAME_STARTED, {
    roomId: room.id,
    roomState: RoomState.InGame,
    gameState: GameState.Idle,
    questionIndex: 0,
  });

  startQuestion(room);
}

export function handleGameNextQuestion(socket: TrackedWebSocket, roomId: string): void {
  const session = socket.sessionId ? sessionsById.get(socket.sessionId) : null;

  if (!session || session.role !== "host") {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.NOT_AUTHORIZED, "Only the host can advance questions", {
      event: EVENTS.GAME_NEXT_QUESTION,
      roomId,
      questionId: null,
    });
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

  if (room.gameState !== GameState.QuestionActive) {
    sendProtocolError(socket, PROTOCOL_ERROR_CODES.INVALID_STATE, "Question is not active", {
      event: EVENTS.ANSWER_SUBMIT,
      roomId: room.id,
      questionId: payload.questionId,
    });
    return;
  }

  if (!room.quiz || room.currentQuestionIndex === null) {
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

  const now = Date.now();
  const submittedAnswer: SubmittedAnswer = {
    playerId: player.id,
    questionId: payload.questionId,
    answer: payload.answer,
    submittedAtMs: now - (room.questionStartedAt ?? now),
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

  const connectedCount = room.players.filter((p) => p.state !== PlayerState.Disconnected).length;
  const answeredCount = room.currentAnswers.size;

  const hostSession = sessionsById.get(room.hostSessionId);
  sendEvent(hostSession?.socket, EVENTS.ANSWER_PROGRESS, {
    roomId: room.id,
    questionId: payload.questionId,
    answeredCount,
    totalEligiblePlayers: connectedCount,
  });

  if (answeredCount >= connectedCount) {
    closeQuestion(room);
  }
}

function startQuestion(room: RoomRecord): void {
  if (!room.quiz || room.currentQuestionIndex === null) return;

  const question = room.quiz.questions[room.currentQuestionIndex];
  const now = Date.now();

  room.gameState = GameState.QuestionActive;
  room.currentAnswers.clear();
  room.questionStartedAt = now;

  for (const player of room.players) {
    if (player.state !== PlayerState.Disconnected) {
      player.state = PlayerState.Answering;
    }
  }

  logRoomEvent("question:show", room, {
    questionIndex: room.currentQuestionIndex,
    questionId: question.id,
  });

  broadcastToRoom(room, EVENTS.QUESTION_SHOW, {
    roomId: room.id,
    questionId: question.id,
    questionIndex: room.currentQuestionIndex,
    type: question.type,
    text: question.text,
    options: question.options,
    durationMs: question.durationMs,
    gameState: GameState.QuestionActive,
  });

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

  if (!room.quiz || room.currentQuestionIndex === null) return;

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

function evaluateQuestion(room: RoomRecord, question: import("@quiz/shared-types").MultipleChoiceQuestion): void {
  const answers = [...room.currentAnswers.values()];
  const roundResult = evaluateMultipleChoice(question, answers);

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

  room.gameState = GameState.Revealing;

  logRoomEvent("question:reveal", room, {
    questionId: question.id,
    correctAnswer: roundResult.correctAnswer.value,
  });

  broadcastToRoom(room, EVENTS.QUESTION_REVEAL, {
    roomId: room.id,
    questionId: question.id,
    correctAnswer: roundResult.correctAnswer,
    gameState: GameState.Revealing,
  });

  room.gameState = GameState.Scoreboard;

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
    questionId: question.id,
    scoreboard,
    gameState: GameState.Scoreboard,
  });
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

  room.state = RoomState.Completed;
  room.gameState = GameState.Completed;

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
    finalScoreboard,
  });
}

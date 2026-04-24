import { WebSocket } from "ws";

import { EVENTS } from "@quiz/shared-protocol";
import {
  GameState,
  PlayerState,
  QuestionType,
  RoomState,
  type CorrectAnswer,
  type Question,
} from "@quiz/shared-types";
import type { ServerToClientEventName, ServerToClientEventPayloadMap } from "@quiz/shared-protocol";

import type { RoomRecord, SessionRecord, TrackedWebSocket } from "./server-types.js";
import { sendEvent, toLobbyUpdatePayload } from "./protocol.js";
import { sessionsById } from "./state.js";

export function broadcastToRoom<TEvent extends ServerToClientEventName>(
  room: RoomRecord,
  event: TEvent,
  payload: ServerToClientEventPayloadMap[TEvent],
  options?: {
    excludeSessionIds?: Set<string>;
  },
): void {
  const excludedSessions = options?.excludeSessionIds ?? new Set<string>();

  if (!excludedSessions.has(room.hostSessionId)) {
    const hostSession = sessionsById.get(room.hostSessionId);
    sendEvent(hostSession?.socket, event, payload);
  }

  for (const player of room.players) {
    if (excludedSessions.has(player.sessionId)) {
      continue;
    }

    const session = sessionsById.get(player.sessionId);
    sendEvent(session?.socket, event, payload);
  }
}

function getCurrentQuestion(room: RoomRecord): Question | null {
  if (!room.quiz || room.currentQuestionIndex === null) {
    return null;
  }

  return room.quiz.questions[room.currentQuestionIndex] ?? null;
}

function getConnectedPlayers(room: RoomRecord) {
  return room.players.filter((player) => player.state !== PlayerState.Disconnected);
}

function getSortedScoreboard(room: RoomRecord) {
  return getConnectedPlayers(room)
    .map((player) => ({
      playerId: player.id,
      name: player.name,
      score: player.score,
    }))
    .sort((a, b) => b.score - a.score);
}

function getRevealResultPayload(room: RoomRecord, question: Question) {
  if (room.lastRoundResult) {
    return room.lastRoundResult;
  }

  const correctAnswer: CorrectAnswer = (() => {
    if (question.type === QuestionType.MultipleChoice || question.type === QuestionType.Logic) {
      return { type: "option" as const, value: question.correctOptionId };
    }
    if (question.type === QuestionType.Estimate || question.type === QuestionType.MajorityGuess) {
      return { type: "number" as const, value: question.correctValue };
    }
    return { type: "ranking" as const, value: question.correctOrder };
  })();

  return {
    questionId: question.id,
    correctAnswer,
    playerResults: getConnectedPlayers(room).map((player) => {
      const submittedAnswer = room.currentAnswers.get(player.id);
      const isCorrect =
        submittedAnswer?.answer.type === "option" &&
        correctAnswer.type === "option" &&
        submittedAnswer.answer.value === correctAnswer.value;
      return {
        playerId: player.id,
        answer: submittedAnswer?.answer ?? null,
        isCorrect,
        pointsEarned: isCorrect ? question.points : 0,
      };
    }),
  };
}

function sendQuestionShow(
  socket: TrackedWebSocket,
  room: RoomRecord,
  question: Question,
  questionIndex: number,
  totalQuestionCount: number,
  gameState:
    | GameState.QuestionActive
    | GameState.AnswerLocked
    | GameState.Revealing
    | GameState.Scoreboard,
): void {
  const base = {
    roomId: room.id,
    questionId: question.id,
    questionIndex,
    totalQuestionCount,
    text: question.text,
    durationMs: question.durationMs,
    gameState,
  };
  if (question.type === QuestionType.MultipleChoice || question.type === QuestionType.Logic) {
    sendEvent(socket, EVENTS.QUESTION_SHOW, {
      ...base,
      type: question.type,
      options: question.options,
    });
  } else if (
    question.type === QuestionType.Estimate ||
    question.type === QuestionType.MajorityGuess
  ) {
    sendEvent(socket, EVENTS.QUESTION_SHOW, {
      ...base,
      type: question.type,
      unit: question.unit,
      context: question.context,
    });
  } else if (question.type === QuestionType.Ranking) {
    sendEvent(socket, EVENTS.QUESTION_SHOW, {
      ...base,
      type: question.type,
      items: question.items,
    });
  }
}

function sendNextQuestionReadyProgress(
  socket: TrackedWebSocket,
  room: RoomRecord,
  questionId: string,
): void {
  const connectedPlayers = getConnectedPlayers(room);
  const readyPlayerIds = connectedPlayers
    .filter((player) => room.nextQuestionReadyPlayerIds.has(player.id))
    .map((player) => player.id);

  sendEvent(socket, EVENTS.NEXT_QUESTION_READY_PROGRESS, {
    roomId: room.id,
    questionId,
    readyCount: readyPlayerIds.length,
    totalEligiblePlayers: connectedPlayers.length,
    readyPlayerIds,
    gameState: GameState.Scoreboard,
  });
}

export function syncSessionToRoomState(session: SessionRecord, room: RoomRecord): void {
  const socket = session.socket;

  if (!socket) {
    return;
  }

  sendEvent(socket, EVENTS.LOBBY_UPDATE, toLobbyUpdatePayload(room));

  if (room.state === RoomState.Waiting) {
    return;
  }

  if (room.state === RoomState.Completed) {
    sendEvent(socket, EVENTS.GAME_FINISHED, {
      roomId: room.id,
      roomState: RoomState.Completed,
      gameState: GameState.Completed,
      totalQuestionCount: room.quiz?.questions.length ?? 0,
      finalScoreboard: getSortedScoreboard(room),
    });
    return;
  }

  if (room.state !== RoomState.InGame || room.gameState === null) {
    return;
  }

  if (!room.quiz) {
    return;
  }

  const question = getCurrentQuestion(room);

  if (!question || room.currentQuestionIndex === null) {
    return;
  }

  const connectedPlayers = getConnectedPlayers(room);
  const scoreboard = getSortedScoreboard(room);
  const totalQuestionCount = room.quiz.questions.length;
  const playerAnswer = session.playerId
    ? (room.currentAnswers.get(session.playerId) ?? null)
    : null;

  if (playerAnswer) {
    sendEvent(socket, EVENTS.ANSWER_ACCEPTED, {
      roomId: room.id,
      questionId: question.id,
      playerId: playerAnswer.playerId,
      status: "accepted",
    });
  }

  switch (room.gameState) {
    case GameState.Idle:
      sendEvent(socket, EVENTS.GAME_STARTED, {
        roomId: room.id,
        roomState: RoomState.InGame,
        gameState: GameState.Idle,
        questionIndex: room.currentQuestionIndex,
        totalQuestionCount,
      });
      return;

    case GameState.QuestionActive: {
      sendQuestionShow(
        socket,
        room,
        question,
        room.currentQuestionIndex,
        totalQuestionCount,
        GameState.QuestionActive,
      );

      const elapsedMs = room.questionStartedAt ? Date.now() - room.questionStartedAt : 0;
      const remainingMs = Math.max(0, question.durationMs - elapsedMs);

      sendEvent(socket, EVENTS.QUESTION_TIMER, {
        roomId: room.id,
        questionId: question.id,
        remainingMs,
      });

      if (session.role === "host") {
        sendEvent(socket, EVENTS.ANSWER_PROGRESS, {
          roomId: room.id,
          questionId: question.id,
          answeredCount: room.currentAnswers.size,
          totalEligiblePlayers: connectedPlayers.length,
        });
      }
      return;
    }

    case GameState.AnswerLocked:
      sendQuestionShow(
        socket,
        room,
        question,
        room.currentQuestionIndex,
        totalQuestionCount,
        GameState.AnswerLocked,
      );
      sendEvent(socket, EVENTS.QUESTION_CLOSE, {
        roomId: room.id,
        questionId: question.id,
        gameState: GameState.AnswerLocked,
      });
      return;

    case GameState.Revealing:
      {
        const roundResult = getRevealResultPayload(room, question);

        sendQuestionShow(
          socket,
          room,
          question,
          room.currentQuestionIndex,
          totalQuestionCount,
          GameState.Revealing,
        );
        sendEvent(socket, EVENTS.QUESTION_CLOSE, {
          roomId: room.id,
          questionId: question.id,
          gameState: GameState.AnswerLocked,
        });
        sendEvent(socket, EVENTS.QUESTION_REVEAL, {
          roomId: room.id,
          questionId: question.id,
          correctAnswer: roundResult.correctAnswer,
          playerResults: roundResult.playerResults,
          gameState: GameState.Revealing,
        });
      }
      return;

    case GameState.Scoreboard:
      {
        const roundResult = getRevealResultPayload(room, question);

        sendQuestionShow(
          socket,
          room,
          question,
          room.currentQuestionIndex,
          totalQuestionCount,
          GameState.Scoreboard,
        );
        sendEvent(socket, EVENTS.QUESTION_CLOSE, {
          roomId: room.id,
          questionId: question.id,
          gameState: GameState.AnswerLocked,
        });
        sendEvent(socket, EVENTS.QUESTION_REVEAL, {
          roomId: room.id,
          questionId: question.id,
          correctAnswer: roundResult.correctAnswer,
          playerResults: roundResult.playerResults,
          gameState: GameState.Revealing,
        });
        sendEvent(socket, EVENTS.SCORE_UPDATE, {
          roomId: room.id,
          questionId: question.id,
          scoreboard,
          gameState: GameState.Scoreboard,
        });
        sendNextQuestionReadyProgress(socket, room, question.id);
      }
      return;

    case GameState.Completed:
      sendEvent(socket, EVENTS.GAME_FINISHED, {
        roomId: room.id,
        roomState: RoomState.Completed,
        gameState: GameState.Completed,
        totalQuestionCount: room.quiz?.questions.length ?? 0,
        finalScoreboard: scoreboard,
      });
      return;
  }
}

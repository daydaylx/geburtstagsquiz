import { WebSocket } from "ws";

import { EVENTS } from "@quiz/shared-protocol";
import { GameState, PlayerState, RoomState, type MultipleChoiceQuestion } from "@quiz/shared-types";
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

function getCurrentQuestion(room: RoomRecord): MultipleChoiceQuestion | null {
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
      finalScoreboard: getSortedScoreboard(room),
    });
    return;
  }

  if (room.state !== RoomState.InGame || room.gameState === null) {
    return;
  }

  const question = getCurrentQuestion(room);

  if (!question || room.currentQuestionIndex === null) {
    return;
  }

  const connectedPlayers = getConnectedPlayers(room);
  const scoreboard = getSortedScoreboard(room);
  const playerAnswer = session.playerId ? room.currentAnswers.get(session.playerId) ?? null : null;

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
      });
      return;

    case GameState.QuestionActive: {
      sendEvent(socket, EVENTS.QUESTION_SHOW, {
        roomId: room.id,
        questionId: question.id,
        questionIndex: room.currentQuestionIndex,
        type: question.type,
        text: question.text,
        options: question.options,
        durationMs: question.durationMs,
        gameState: GameState.QuestionActive,
      });

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
      sendEvent(socket, EVENTS.QUESTION_SHOW, {
        roomId: room.id,
        questionId: question.id,
        questionIndex: room.currentQuestionIndex,
        type: question.type,
        text: question.text,
        options: question.options,
        durationMs: question.durationMs,
        gameState: GameState.AnswerLocked,
      });
      sendEvent(socket, EVENTS.QUESTION_CLOSE, {
        roomId: room.id,
        questionId: question.id,
        gameState: GameState.AnswerLocked,
      });
      return;

    case GameState.Revealing:
      sendEvent(socket, EVENTS.QUESTION_SHOW, {
        roomId: room.id,
        questionId: question.id,
        questionIndex: room.currentQuestionIndex,
        type: question.type,
        text: question.text,
        options: question.options,
        durationMs: question.durationMs,
        gameState: GameState.Revealing,
      });
      sendEvent(socket, EVENTS.QUESTION_CLOSE, {
        roomId: room.id,
        questionId: question.id,
        gameState: GameState.AnswerLocked,
      });
      sendEvent(socket, EVENTS.QUESTION_REVEAL, {
        roomId: room.id,
        questionId: question.id,
        correctAnswer: { type: "option", value: question.correctOptionId },
        gameState: GameState.Revealing,
      });
      return;

    case GameState.Scoreboard:
      sendEvent(socket, EVENTS.QUESTION_SHOW, {
        roomId: room.id,
        questionId: question.id,
        questionIndex: room.currentQuestionIndex,
        type: question.type,
        text: question.text,
        options: question.options,
        durationMs: question.durationMs,
        gameState: GameState.Scoreboard,
      });
      sendEvent(socket, EVENTS.QUESTION_CLOSE, {
        roomId: room.id,
        questionId: question.id,
        gameState: GameState.AnswerLocked,
      });
      sendEvent(socket, EVENTS.QUESTION_REVEAL, {
        roomId: room.id,
        questionId: question.id,
        correctAnswer: { type: "option", value: question.correctOptionId },
        gameState: GameState.Revealing,
      });
      sendEvent(socket, EVENTS.SCORE_UPDATE, {
        roomId: room.id,
        questionId: question.id,
        scoreboard,
        gameState: GameState.Scoreboard,
      });
      return;

    case GameState.Completed:
      sendEvent(socket, EVENTS.GAME_FINISHED, {
        roomId: room.id,
        roomState: RoomState.Completed,
        gameState: GameState.Completed,
        finalScoreboard: scoreboard,
      });
      return;
  }
}

import { EVENTS, type QuestionShowPayload } from "@quiz/shared-protocol";
import { GameState, PlayerState, RoomState, type Question } from "@quiz/shared-types";
import type { ServerToClientEventName, ServerToClientEventPayloadMap } from "@quiz/shared-protocol";

import type { RoomRecord, SessionRecord, TrackedWebSocket } from "./server-types.js";
import { sendEvent, toLobbyUpdatePayload } from "./protocol.js";
import { sessionsById } from "./state.js";
import {
  getTotalQuestionCount,
  getVisibleQuestionIndex,
  toQuestionControllerPayload,
  toQuestionShowPayload,
} from "./question-payloads.js";

type BroadcastOptions = {
  excludeSessionIds?: Set<string>;
};

export function sendToDisplay<TEvent extends ServerToClientEventName>(
  room: RoomRecord,
  event: TEvent,
  payload: ServerToClientEventPayloadMap[TEvent],
): void {
  if (room.displaySessionId) {
    const displaySession = sessionsById.get(room.displaySessionId);
    if (displaySession?.socket) {
      sendEvent(displaySession.socket, event, payload);
    }
  }
}

export function sendToHost<TEvent extends ServerToClientEventName>(
  room: RoomRecord,
  event: TEvent,
  payload: ServerToClientEventPayloadMap[TEvent],
): void {
  if (room.hostSessionId) {
    const hostSession = sessionsById.get(room.hostSessionId);
    if (hostSession?.socket) {
      sendEvent(hostSession.socket, event, payload);
    }
  }
}

export function sendToPlayers<TEvent extends ServerToClientEventName>(
  room: RoomRecord,
  event: TEvent,
  payload: ServerToClientEventPayloadMap[TEvent],
  options?: BroadcastOptions,
): void {
  const excludedSessions = options?.excludeSessionIds ?? new Set<string>();
  for (const player of room.players) {
    if (excludedSessions.has(player.sessionId)) continue;
    const session = sessionsById.get(player.sessionId);
    if (session?.socket) {
      sendEvent(session.socket, event, payload);
    }
  }
}

export function broadcastToHostAndDisplay<TEvent extends ServerToClientEventName>(
  room: RoomRecord,
  event: TEvent,
  payload: ServerToClientEventPayloadMap[TEvent],
): void {
  sendToHost(room, event, payload);
  sendToDisplay(room, event, payload);
}

export function broadcastToAllRoomClients<TEvent extends ServerToClientEventName>(
  room: RoomRecord,
  event: TEvent,
  payload: ServerToClientEventPayloadMap[TEvent],
  options?: BroadcastOptions,
): void {
  const excludedSessions = options?.excludeSessionIds ?? new Set<string>();

  if (room.hostSessionId && !excludedSessions.has(room.hostSessionId)) {
    sendToHost(room, event, payload);
  }

  if (room.displaySessionId && !excludedSessions.has(room.displaySessionId)) {
    sendToDisplay(room, event, payload);
  }

  sendToPlayers(room, event, payload, options);
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

function getRevealResultPayload(room: RoomRecord) {
  return room.lastRoundResult;
}

function getAnswerProgressPayload(room: RoomRecord, questionId: string) {
  const connectedPlayers = getConnectedPlayers(room);

  return {
    roomId: room.id,
    questionId,
    answeredCount: connectedPlayers.filter((player) => room.currentAnswers.has(player.id)).length,
    totalEligiblePlayers: connectedPlayers.length,
  };
}

function sendQuestionForSession(
  socket: TrackedWebSocket,
  session: SessionRecord,
  room: RoomRecord,
  question: Question,
  gameState: QuestionShowPayload["gameState"],
): void {
  if (session.role === "host" || session.role === "display") {
    sendEvent(socket, EVENTS.QUESTION_SHOW, toQuestionShowPayload(room, question, gameState));
    return;
  }

  sendEvent(
    socket,
    EVENTS.QUESTION_CONTROLLER,
    toQuestionControllerPayload(room, question, gameState),
  );
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
      totalQuestionCount: getTotalQuestionCount(room),
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

  const scoreboard = getSortedScoreboard(room);
  const totalQuestionCount = getTotalQuestionCount(room);
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
        questionIndex: getVisibleQuestionIndex(room),
        totalQuestionCount,
        resolvedGamePlan: room.resolvedGamePlan!,
      });
      return;

    case GameState.QuestionActive: {
      sendQuestionForSession(socket, session, room, question, GameState.QuestionActive);

      const elapsedMs = room.questionStartedAt ? Date.now() - room.questionStartedAt : 0;
      const remainingMs = Math.max(0, question.durationMs - elapsedMs);

      sendEvent(socket, EVENTS.QUESTION_TIMER, {
        roomId: room.id,
        questionId: question.id,
        remainingMs,
      });

      if (session.role === "host" || session.role === "display") {
        sendEvent(socket, EVENTS.ANSWER_PROGRESS, getAnswerProgressPayload(room, question.id));
      }
      return;
    }

    case GameState.AnswerLocked:
      sendQuestionForSession(socket, session, room, question, GameState.AnswerLocked);
      sendEvent(socket, EVENTS.QUESTION_CLOSE, {
        roomId: room.id,
        questionId: question.id,
        gameState: GameState.AnswerLocked,
      });
      return;

    case GameState.Revealing:
      {
        const roundResult = getRevealResultPayload(room);
        if (!roundResult) return;

        sendQuestionForSession(socket, session, room, question, GameState.Revealing);
        // AnswerLocked is correct here: the schema constrains QUESTION_CLOSE to AnswerLocked,
        // and clients need this transition before receiving QUESTION_REVEAL.
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
          explanation: question.explanation,
        });
      }
      return;

    case GameState.Scoreboard:
      {
        const roundResult = getRevealResultPayload(room);
        if (!roundResult) return;

        sendQuestionForSession(socket, session, room, question, GameState.Scoreboard);
        // AnswerLocked is correct here: the schema constrains QUESTION_CLOSE to AnswerLocked,
        // and clients need this transition before QUESTION_REVEAL and SCORE_UPDATE.
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
          explanation: question.explanation,
        });
        sendEvent(socket, EVENTS.SCORE_UPDATE, {
          roomId: room.id,
          questionId: question.id,
          scoreboard,
          scoreChanges: room.lastScoreChanges,
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
        totalQuestionCount: getTotalQuestionCount(room),
        finalScoreboard: scoreboard,
      });
      return;
  }
}

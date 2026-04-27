import { WebSocket } from "ws";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import { EVENTS } from "@quiz/shared-protocol";
import { GameState, PlayerState, RoomState, QuestionType } from "@quiz/shared-types";
import type { Question } from "@quiz/shared-types";

import { roomsById, roomIdByJoinCode, roomIdByHostToken, sessionsById } from "./state.js";
import { handleDisplayCreateRoom } from "./room.js";
import { handleHostConnect, handleRoomJoin } from "./lobby.js";
import { handleGameStart, handleAnswerSubmit } from "./game.js";
import { syncSessionToRoomState } from "./connection.js";
import type { RoomRecord, TrackedWebSocket, SessionRecord } from "./server-types.js";

function makeMockSocket(): TrackedWebSocket {
  const sent: any[] = [];
  const socket = {
    connectionId: "conn-" + Math.random().toString(36).slice(2),
    isAlive: true,
    sessionId: null,
    readyState: WebSocket.OPEN,
    send: (data: string) => { sent.push(JSON.parse(data)) },
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
  });

  it("sends game:started and question:show to display when game starts", () => {
    handleRoomJoin(playerSocket, { joinCode: room.joinCode, playerName: "Player 1" });
    
    // Clear initial events
    (displaySocket as any)._sent.length = 0;
    
    // Host starts game
    hostSocket.sessionId = room.hostSessionId;
    handleGameStart(hostSocket, room.id);

    const events = getSentEvents(displaySocket);
    expect(events).toContain(EVENTS.GAME_STARTED);
    expect(events).toContain(EVENTS.QUESTION_SHOW);
    
    // Advance timers for the question:timer event
    vi.advanceTimersByTime(1000);
    
    const eventsAfterTimer = getSentEvents(displaySocket);
    expect(eventsAfterTimer).toContain(EVENTS.QUESTION_TIMER);
    expect(eventsAfterTimer).toContain(EVENTS.ANSWER_PROGRESS);
  });

  it("sends answer:progress to display when player submits answer", () => {
    handleRoomJoin(playerSocket, { joinCode: room.joinCode, playerName: "Player 1" });
    const playerSession = [...sessionsById.values()].find(s => s.role === 'player')!;

    // Host starts game
    hostSocket.sessionId = room.hostSessionId;
    handleGameStart(hostSocket, room.id);

    // Clear events
    (displaySocket as any)._sent.length = 0;

    const question = room.quiz!.questions[0];
    let answer: any = { type: "option", value: "invalid" };
    if (question.type === QuestionType.MultipleChoice || question.type === QuestionType.Logic || question.type === QuestionType.MajorityGuess) {
      answer = { type: "option", value: question.options[0].id };
    } else if (question.type === QuestionType.Estimate) {
      answer = { type: "number", value: 42 };
    } else if (question.type === QuestionType.Ranking) {
      answer = { type: "ranking", value: question.items.map(i => i.id) };
    } else if (question.type === QuestionType.OpenText) {
      answer = { type: "text", value: "some text" };
    }

    // Player submits answer
    playerSocket.sessionId = playerSession.sessionId;
    handleAnswerSubmit(playerSocket, {
      roomId: room.id,
      questionId: question.id,
      playerId: playerSession.playerId!,
      answer,
      requestId: "req-1"
    });

    const events = getSentEvents(displaySocket);
    expect(events).toContain(EVENTS.ANSWER_PROGRESS);
    const payload = getSentPayload(displaySocket, EVENTS.ANSWER_PROGRESS);
    expect(payload.answeredCount).toBe(1);
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
      explanation: "This is the explanation"
    };
    room.quiz = { id: "quiz1", title: "Quiz", questions: [question] };
    room.currentQuestionIndex = 0;
    room.state = RoomState.InGame;
    room.gameState = GameState.Revealing;
    room.lastRoundResult = {
      questionId: "q1",
      correctAnswer: { type: "option", value: "A" },
      playerResults: []
    };

    const newDisplaySocket = makeMockSocket();
    const displaySession = sessionsById.get(room.displaySessionId!)!;
    displaySession.socket = newDisplaySocket;

    syncSessionToRoomState(displaySession, room);

    const revealPayload = getSentPayload(newDisplaySocket, EVENTS.QUESTION_REVEAL);
    expect(revealPayload).toBeDefined();
    expect(revealPayload.explanation).toBe("This is the explanation");
  });
});

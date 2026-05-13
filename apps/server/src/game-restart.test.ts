import { EVENTS, PROTOCOL_ERROR_CODES } from "@quiz/shared-protocol";
import type { Question } from "@quiz/shared-types";
import { GameState, PlayerState, RoomState } from "@quiz/shared-types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { handleAnswerSubmit, handleGameRestart, handleGameStart, handleNextQuestionReady } from "./game.js";
import { buildCatalogSummary, buildDefaultGamePlan } from "./game-plan.js";
import { handleHostConnect, handleRoomJoin } from "./lobby.js";
import { getDefaultQuiz } from "./quiz-data.js";
import { handleDisplayCreateRoom } from "./room.js";
import type { RoomRecord, TrackedWebSocket } from "./server-types.js";
import { roomIdByHostToken, roomIdByJoinCode, roomsById, sessionsById } from "./state.js";

type SentPayload = Record<string, unknown> & {
  displayConnected?: boolean;
  finalScoreboard?: unknown[];
  gameState?: GameState;
  hostConnected?: boolean;
  joinCode?: string;
  playerCount?: number;
  players?: Array<{ name?: string; score?: number; state?: string }>;
  questionId?: string;
  readyCount?: number;
  roomId?: string;
  roomState?: RoomState;
  totalEligiblePlayers?: number;
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

function getSentPayload(socket: TestTrackedWebSocket, event: string): SentPayload | undefined {
  const matches = socket._sent.filter((msg) => msg.event === event);
  return matches.length > 0 ? matches[matches.length - 1].payload : undefined;
}

function expectSentPayload(socket: TestTrackedWebSocket, event: string): SentPayload {
  const payload = getSentPayload(socket, event);
  expect(payload).toBeDefined();
  return payload!;
}

function getPlayerSession(playerIndex: number): import("./server-types.js").SessionRecord {
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
    return { type: "ranking" as const, value: question.items.map((item) => item.id) };
  }
  return { type: "text" as const, value: "test answer" };
}

function makeTestGamePlan(overrides: Record<string, unknown> = {}) {
  const catalog = buildCatalogSummary(getDefaultQuiz());
  return {
    ...buildDefaultGamePlan(catalog),
    questionCount: 1,
    enableDemoQuestion: false,
    displayShowLevel: "minimal" as const,
    ...overrides,
  };
}

function playOneQuestionToEnd(
  room: RoomRecord,
  _hostSocket: TestTrackedWebSocket,
  player1Socket: TestTrackedWebSocket,
  player2Socket: TestTrackedWebSocket,
  player1Session: import("./server-types.js").SessionRecord,
  player2Session: import("./server-types.js").SessionRecord,
): void {
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

  player1Socket.sessionId = player1Session.sessionId;
  handleNextQuestionReady(player1Socket, {
    roomId: room.id,
    questionId: question.id,
    playerId: player1Session.playerId!,
  });

  player2Socket.sessionId = player2Session.sessionId;
  handleNextQuestionReady(player2Socket, {
    roomId: room.id,
    questionId: question.id,
    playerId: player2Session.playerId!,
  });
}

describe("Game Restart Flow", () => {
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
    handleRoomJoin(player1Socket, { joinCode: room.joinCode, playerName: "Player 1" });

    player2Socket = makeMockSocket();
    handleRoomJoin(player2Socket, { joinCode: room.joinCode, playerName: "Player 2" });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("plays a complete game, restarts, and plays a second game", () => {
    const player1Session = getPlayerSession(0);
    const player2Session = getPlayerSession(1);

    hostSocket.sessionId = room.hostSessionId;
    handleGameStart(hostSocket, { roomId: room.id, gamePlan: makeTestGamePlan() });

    expect(room.state).toBe(RoomState.InGame);
    expect(room.gameState).toBe(GameState.QuestionActive);

    playOneQuestionToEnd(room, hostSocket, player1Socket, player2Socket, player1Session, player2Session);

    expect(room.state).toBe(RoomState.Completed);
    expect(room.gameState).toBe(GameState.Completed);

    const displayFinished = getSentPayload(displaySocket, EVENTS.GAME_FINISHED);
    expect(displayFinished).toBeDefined();
    expect(displayFinished!.finalScoreboard).toHaveLength(2);

    displaySocket._sent.length = 0;
    hostSocket._sent.length = 0;
    player1Socket._sent.length = 0;
    player2Socket._sent.length = 0;

    hostSocket.sessionId = room.hostSessionId;
    handleGameRestart(hostSocket, room.id);

    expect(room.state).toBe(RoomState.Waiting);
    expect(room.gameState).toBeNull();
    expect(room.quiz).toBeNull();
    expect(room.currentQuestionIndex).toBeNull();

    const displayReset = expectSentPayload(displaySocket, EVENTS.ROOM_RESET);
    expect(displayReset.roomId).toBe(room.id);
    expect(displayReset.roomState).toBe(RoomState.Waiting);
    expect(displayReset.joinCode).toBe(room.joinCode);

    const hostReset = expectSentPayload(hostSocket, EVENTS.ROOM_RESET);
    expect(hostReset.roomId).toBe(room.id);

    const p1Reset = expectSentPayload(player1Socket, EVENTS.ROOM_RESET);
    expect(p1Reset.roomId).toBe(room.id);

    const p2Reset = expectSentPayload(player2Socket, EVENTS.ROOM_RESET);
    expect(p2Reset.roomId).toBe(room.id);

    const displayLobby = expectSentPayload(displaySocket, EVENTS.LOBBY_UPDATE);
    expect(displayLobby.playerCount).toBe(2);
    expect(displayLobby.hostConnected).toBe(true);
    expect(displayLobby.displayConnected).toBe(true);

    const hostCatalog = expectSentPayload(hostSocket, EVENTS.CATALOG_SUMMARY);
    expect(hostCatalog.categories).toBeDefined();

    expect(room.players).toHaveLength(2);
    for (const player of room.players) {
      expect(player.score).toBe(0);
      expect(player.state).toBe(PlayerState.Ready);
    }

    hostSocket._sent.length = 0;
    displaySocket._sent.length = 0;
    player1Socket._sent.length = 0;
    player2Socket._sent.length = 0;

    hostSocket.sessionId = room.hostSessionId;
    handleGameStart(hostSocket, { roomId: room.id, gamePlan: makeTestGamePlan() });

    expect(room.state).toBe(RoomState.InGame);
    expect(room.gameState).toBe(GameState.QuestionActive);

    expect(getSentPayload(hostSocket, EVENTS.GAME_STARTED)).toBeDefined();
    expect(getSentPayload(displaySocket, EVENTS.GAME_STARTED)).toBeDefined();
    expect(getSentPayload(player1Socket, EVENTS.GAME_STARTED)).toBeDefined();
    expect(getSentPayload(player2Socket, EVENTS.GAME_STARTED)).toBeDefined();

    playOneQuestionToEnd(room, hostSocket, player1Socket, player2Socket, player1Session, player2Session);

    expect(room.state).toBe(RoomState.Completed);
    expect(getSentPayload(displaySocket, EVENTS.GAME_FINISHED)).toBeDefined();
    expect(getSentPayload(hostSocket, EVENTS.GAME_FINISHED)).toBeDefined();
    expect(getSentPayload(player1Socket, EVENTS.GAME_FINISHED)).toBeDefined();
    expect(getSentPayload(player2Socket, EVENTS.GAME_FINISHED)).toBeDefined();
  });

  it("broadcasts room:reset to all roles including players", () => {
    const player1Session = getPlayerSession(0);
    const player2Session = getPlayerSession(1);

    hostSocket.sessionId = room.hostSessionId;
    handleGameStart(hostSocket, { roomId: room.id, gamePlan: makeTestGamePlan() });

    playOneQuestionToEnd(room, hostSocket, player1Socket, player2Socket, player1Session, player2Session);

    expect(room.state).toBe(RoomState.Completed);

    displaySocket._sent.length = 0;
    hostSocket._sent.length = 0;
    player1Socket._sent.length = 0;
    player2Socket._sent.length = 0;

    hostSocket.sessionId = room.hostSessionId;
    handleGameRestart(hostSocket, room.id);

    const displayResetEvents = displaySocket._sent.filter((m) => m.event === EVENTS.ROOM_RESET);
    const hostResetEvents = hostSocket._sent.filter((m) => m.event === EVENTS.ROOM_RESET);
    const player1ResetEvents = player1Socket._sent.filter((m) => m.event === EVENTS.ROOM_RESET);
    const player2ResetEvents = player2Socket._sent.filter((m) => m.event === EVENTS.ROOM_RESET);

    expect(displayResetEvents).toHaveLength(1);
    expect(hostResetEvents).toHaveLength(1);
    expect(player1ResetEvents).toHaveLength(1);
    expect(player2ResetEvents).toHaveLength(1);

    expect(displayResetEvents[0].payload.roomState).toBe(RoomState.Waiting);
    expect(hostResetEvents[0].payload.roomState).toBe(RoomState.Waiting);
    expect(player1ResetEvents[0].payload.roomState).toBe(RoomState.Waiting);
    expect(player2ResetEvents[0].payload.roomState).toBe(RoomState.Waiting);
  });

  it("resets all player scores to 0 and state to Ready after restart", () => {
    const player1Session = getPlayerSession(0);
    const player2Session = getPlayerSession(1);

    hostSocket.sessionId = room.hostSessionId;
    handleGameStart(hostSocket, { roomId: room.id, gamePlan: makeTestGamePlan() });

    playOneQuestionToEnd(room, hostSocket, player1Socket, player2Socket, player1Session, player2Session);

    expect(room.state).toBe(RoomState.Completed);
    const hasAnyNonZeroScore = room.players.some((p) => p.score !== 0);

    hostSocket.sessionId = room.hostSessionId;
    handleGameRestart(hostSocket, room.id);

    expect(room.players).toHaveLength(2);
    for (const player of room.players) {
      expect(player.score).toBe(0);
      expect(player.state).toBe(PlayerState.Ready);
    }

    if (hasAnyNonZeroScore) {
      const lobbyPayload = expectSentPayload(displaySocket, EVENTS.LOBBY_UPDATE);
      for (const p of lobbyPayload.players ?? []) {
        expect(p.score).toBe(0);
      }
    }
  });

  it("preserves player membership and joinCode after restart", () => {
    const player1Session = getPlayerSession(0);
    const player2Session = getPlayerSession(1);

    hostSocket.sessionId = room.hostSessionId;
    handleGameStart(hostSocket, { roomId: room.id, gamePlan: makeTestGamePlan() });

    playOneQuestionToEnd(room, hostSocket, player1Socket, player2Socket, player1Session, player2Session);

    const originalJoinCode = room.joinCode;
    const originalPlayerCount = room.players.length;

    hostSocket.sessionId = room.hostSessionId;
    handleGameRestart(hostSocket, room.id);

    expect(room.joinCode).toBe(originalJoinCode);
    expect(room.players).toHaveLength(originalPlayerCount);

    const resetPayload = expectSentPayload(displaySocket, EVENTS.ROOM_RESET);
    expect(resetPayload.joinCode).toBe(originalJoinCode);

    const lobbyPayload = expectSentPayload(displaySocket, EVENTS.LOBBY_UPDATE);
    expect(lobbyPayload.playerCount).toBe(2);
  });

  it("rejects restart when room is not in completed state", () => {
    hostSocket.sessionId = room.hostSessionId;

    hostSocket._sent.length = 0;
    handleGameRestart(hostSocket, room.id);

    const errorPayload = getSentPayload(hostSocket, EVENTS.ERROR_PROTOCOL);
    expect(errorPayload).toBeDefined();
    expect(errorPayload!.code).toBe(PROTOCOL_ERROR_CODES.INVALID_STATE);
  });

  it("rejects restart from non-host roles", () => {
    const player1Session = getPlayerSession(0);
    const player2Session = getPlayerSession(1);

    hostSocket.sessionId = room.hostSessionId;
    handleGameStart(hostSocket, { roomId: room.id, gamePlan: makeTestGamePlan() });

    playOneQuestionToEnd(room, hostSocket, player1Socket, player2Socket, player1Session, player2Session);

    expect(room.state).toBe(RoomState.Completed);

    player1Socket._sent.length = 0;
    player1Socket.sessionId = player1Session.sessionId;
    handleGameRestart(player1Socket, room.id);

    const playerError = getSentPayload(player1Socket, EVENTS.ERROR_PROTOCOL);
    expect(playerError).toBeDefined();
    expect(playerError!.code).toBe(PROTOCOL_ERROR_CODES.NOT_AUTHORIZED);

    displaySocket._sent.length = 0;
    handleGameRestart(displaySocket, room.id);

    const displayError = getSentPayload(displaySocket, EVENTS.ERROR_PROTOCOL);
    expect(displayError).toBeDefined();
    expect(displayError!.code).toBe(PROTOCOL_ERROR_CODES.NOT_AUTHORIZED);

    expect(room.state).toBe(RoomState.Completed);
  });
});

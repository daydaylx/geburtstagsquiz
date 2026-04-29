import { describe, expect, it, beforeEach } from "vitest";

import { EVENTS } from "@quiz/shared-protocol";
import { RoomState } from "@quiz/shared-types";

import { isEventAllowedForRole } from "./index.js";
import { roomsById, roomIdByJoinCode, roomIdByHostToken, sessionsById } from "./state.js";
import { handleDisplayCreateRoom, closeRoom } from "./room.js";
import { handleHostConnect } from "./lobby.js";
import type { RoomRecord, SessionRecord, TrackedWebSocket } from "./server-types.js";

function makeMockSocket(sessionId: string | null = null): TrackedWebSocket {
  const sent: string[] = [];
  return {
    connectionId: "conn-test",
    isAlive: true,
    sessionId,
    readyState: 1, // WebSocket.OPEN
    send: (data: string) => sent.push(data),
    close: () => {},
    ping: () => {},
    _sent: sent,
  } as unknown as TrackedWebSocket;
}

function makeRoom(overrides: Partial<RoomRecord> = {}): RoomRecord {
  const roomId = "room-test-" + Math.random().toString(36).slice(2);
  const room: RoomRecord = {
    id: roomId,
    joinCode: "TEST1",
    state: RoomState.Waiting,
    hostName: "",
    hostSessionId: "",
    hostConnected: false,
    displayConnected: false,
    hostToken: "valid-host-token",
    hostTokenUsed: false,
    displayToken: "display-tok",
    displaySessionId: "display-sess-id",
    settings: { showAnswerTextOnPlayerDevices: false },
    players: [],
    quiz: null,
    currentQuestionIndex: null,
    gameState: null,
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    displayDisconnectTimer: null,
    hostDisconnectTimer: null,
    playerDisconnectTimers: new Map(),
    countdownTimer: null,
    questionTimer: null,
    timerTickInterval: null,
    revealTimer: null,
    currentAnswers: new Map(),
    nextQuestionReadyPlayerIds: new Set(),
    questionStartedAt: null,
    lastRoundResult: null,
    lastScoreChanges: [],
    completedRoundResults: [],
    completedAnswers: [],
    ...overrides,
  };
  return room;
}

describe("isEventAllowedForRole – authorization guards", () => {
  it("display cannot send game:start", () => {
    expect(isEventAllowedForRole(EVENTS.GAME_START, "display")).toBe(false);
  });

  it("display cannot send game:next-question", () => {
    expect(isEventAllowedForRole(EVENTS.GAME_NEXT_QUESTION, "display")).toBe(false);
  });

  it("display cannot send room:settings:update", () => {
    expect(isEventAllowedForRole(EVENTS.ROOM_SETTINGS_UPDATE, "display")).toBe(false);
  });

  it("display cannot send room:close", () => {
    expect(isEventAllowedForRole(EVENTS.ROOM_CLOSE, "display")).toBe(false);
  });

  it.each([
    EVENTS.QUESTION_FORCE_CLOSE,
    EVENTS.GAME_SHOW_SCOREBOARD,
    EVENTS.GAME_FINISH_NOW,
    EVENTS.PLAYER_REMOVE,
  ])("display cannot send host fallback event %s", (event) => {
    expect(isEventAllowedForRole(event, "display")).toBe(false);
  });

  it("display cannot send answer:submit", () => {
    expect(isEventAllowedForRole(EVENTS.ANSWER_SUBMIT, "display")).toBe(false);
  });

  it("display cannot send next-question:ready", () => {
    expect(isEventAllowedForRole(EVENTS.NEXT_QUESTION_READY, "display")).toBe(false);
  });

  it("display can send connection:resume", () => {
    expect(isEventAllowedForRole(EVENTS.CONNECTION_RESUME, "display")).toBe(true);
  });

  it("host cannot send display:create-room", () => {
    expect(isEventAllowedForRole(EVENTS.DISPLAY_CREATE_ROOM, "host")).toBe(false);
  });

  it("host cannot send answer:submit", () => {
    expect(isEventAllowedForRole(EVENTS.ANSWER_SUBMIT, "host")).toBe(false);
  });

  it("host cannot send next-question:ready", () => {
    expect(isEventAllowedForRole(EVENTS.NEXT_QUESTION_READY, "host")).toBe(false);
  });

  it("host can send game:start", () => {
    expect(isEventAllowedForRole(EVENTS.GAME_START, "host")).toBe(true);
  });

  it.each([
    EVENTS.QUESTION_FORCE_CLOSE,
    EVENTS.GAME_SHOW_SCOREBOARD,
    EVENTS.GAME_FINISH_NOW,
    EVENTS.PLAYER_REMOVE,
  ])("host can send fallback event %s", (event) => {
    expect(isEventAllowedForRole(event, "host")).toBe(true);
  });

  it("host can send host:connect", () => {
    expect(isEventAllowedForRole(EVENTS.HOST_CONNECT, "host")).toBe(true);
  });

  it("player cannot send display:create-room", () => {
    expect(isEventAllowedForRole(EVENTS.DISPLAY_CREATE_ROOM, "player")).toBe(false);
  });

  it("player cannot send host:connect", () => {
    expect(isEventAllowedForRole(EVENTS.HOST_CONNECT, "player")).toBe(false);
  });

  it("player cannot send game:start", () => {
    expect(isEventAllowedForRole(EVENTS.GAME_START, "player")).toBe(false);
  });

  it("player cannot send room:settings:update", () => {
    expect(isEventAllowedForRole(EVENTS.ROOM_SETTINGS_UPDATE, "player")).toBe(false);
  });

  it.each([
    EVENTS.QUESTION_FORCE_CLOSE,
    EVENTS.GAME_SHOW_SCOREBOARD,
    EVENTS.GAME_FINISH_NOW,
    EVENTS.PLAYER_REMOVE,
  ])("player cannot send host fallback event %s", (event) => {
    expect(isEventAllowedForRole(event, "player")).toBe(false);
  });

  it("player can send answer:submit", () => {
    expect(isEventAllowedForRole(EVENTS.ANSWER_SUBMIT, "player")).toBe(true);
  });

  it("unbound socket (null role) can send display:create-room", () => {
    expect(isEventAllowedForRole(EVENTS.DISPLAY_CREATE_ROOM, null)).toBe(true);
  });

  it("unbound socket (null role) can send host:connect", () => {
    expect(isEventAllowedForRole(EVENTS.HOST_CONNECT, null)).toBe(true);
  });
});

describe("handleDisplayCreateRoom", () => {
  beforeEach(() => {
    roomsById.clear();
    roomIdByJoinCode.clear();
    roomIdByHostToken.clear();
    sessionsById.clear();
  });

  it("creates room and registers in state maps", () => {
    const socket = makeMockSocket();
    handleDisplayCreateRoom(socket, {});

    expect(roomsById.size).toBe(1);
    expect(roomIdByJoinCode.size).toBe(1);
    expect(roomIdByHostToken.size).toBe(1);
    expect(sessionsById.size).toBe(1);
  });

  it("assigns display role to session", () => {
    const socket = makeMockSocket();
    handleDisplayCreateRoom(socket, {});

    const session = sessionsById.values().next().value as SessionRecord;
    expect(session.role).toBe("display");
  });

  it("sets displayConnected=true on room", () => {
    const socket = makeMockSocket();
    handleDisplayCreateRoom(socket, {});

    const room = roomsById.values().next().value as RoomRecord;
    expect(room.displayConnected).toBe(true);
  });

  it("sets hostConnected=false initially (no host paired yet)", () => {
    const socket = makeMockSocket();
    handleDisplayCreateRoom(socket, {});

    const room = roomsById.values().next().value as RoomRecord;
    expect(room.hostConnected).toBe(false);
  });

  it("rejects if socket already has a session", () => {
    const socket = makeMockSocket("existing-session");
    handleDisplayCreateRoom(socket, {});

    expect(roomsById.size).toBe(0);
  });
});

describe("handleHostConnect", () => {
  beforeEach(() => {
    roomsById.clear();
    roomIdByJoinCode.clear();
    roomIdByHostToken.clear();
    sessionsById.clear();
  });

  it("rejects invalid hostToken", () => {
    const socket = makeMockSocket();
    handleHostConnect(socket, { hostToken: "nonexistent-token" });

    expect(sessionsById.size).toBe(0);
  });

  it("rejects already-used hostToken", () => {
    const displaySocket = makeMockSocket();
    handleDisplayCreateRoom(displaySocket, {});

    const room = roomsById.values().next().value as RoomRecord;
    room.hostTokenUsed = true;

    const hostSocket = makeMockSocket();
    handleHostConnect(hostSocket, { hostToken: room.hostToken });

    const sessions = [...sessionsById.values()];
    const hostSession = sessions.find((s) => s.role === "host");
    expect(hostSession).toBeUndefined();
  });

  it("pairs host with valid token, creates host session", () => {
    const displaySocket = makeMockSocket();
    handleDisplayCreateRoom(displaySocket, {});

    const room = roomsById.values().next().value as RoomRecord;
    const hostToken = room.hostToken;

    const hostSocket = makeMockSocket();
    handleHostConnect(hostSocket, { hostToken });

    const sessions = [...sessionsById.values()];
    const hostSession = sessions.find((s) => s.role === "host");
    expect(hostSession).toBeDefined();
    expect(hostSession?.roomId).toBe(room.id);
  });

  it("marks hostToken as used after pairing", () => {
    const displaySocket = makeMockSocket();
    handleDisplayCreateRoom(displaySocket, {});

    const room = roomsById.values().next().value as RoomRecord;
    const hostToken = room.hostToken;

    const hostSocket = makeMockSocket();
    handleHostConnect(hostSocket, { hostToken });

    expect(room.hostTokenUsed).toBe(true);
  });

  it("sets hostConnected=true after pairing", () => {
    const displaySocket = makeMockSocket();
    handleDisplayCreateRoom(displaySocket, {});

    const room = roomsById.values().next().value as RoomRecord;
    const hostSocket = makeMockSocket();
    handleHostConnect(hostSocket, { hostToken: room.hostToken });

    expect(room.hostConnected).toBe(true);
  });

  it("second host:connect with same token is rejected", () => {
    const displaySocket = makeMockSocket();
    handleDisplayCreateRoom(displaySocket, {});

    const room = roomsById.values().next().value as RoomRecord;
    const hostToken = room.hostToken;

    const host1 = makeMockSocket();
    handleHostConnect(host1, { hostToken });

    const sessionCountAfterFirst = sessionsById.size;

    const host2 = makeMockSocket();
    handleHostConnect(host2, { hostToken });

    expect(sessionsById.size).toBe(sessionCountAfterFirst);
  });
});

describe("closeRoom – cleans up all sessions", () => {
  beforeEach(() => {
    roomsById.clear();
    roomIdByJoinCode.clear();
    roomIdByHostToken.clear();
    sessionsById.clear();
  });

  it("removes display session on closeRoom", () => {
    const displaySocket = makeMockSocket();
    handleDisplayCreateRoom(displaySocket, {});

    const room = roomsById.values().next().value as RoomRecord;
    expect(sessionsById.size).toBe(1);

    closeRoom(room, "test");

    expect(sessionsById.size).toBe(0);
  });

  it("removes host and display sessions on closeRoom after pairing", () => {
    const displaySocket = makeMockSocket();
    handleDisplayCreateRoom(displaySocket, {});

    const room = roomsById.values().next().value as RoomRecord;
    const hostSocket = makeMockSocket();
    handleHostConnect(hostSocket, { hostToken: room.hostToken });

    expect(sessionsById.size).toBe(2);

    closeRoom(room, "test");

    expect(sessionsById.size).toBe(0);
  });

  it("removes roomIdByHostToken entry on closeRoom", () => {
    const displaySocket = makeMockSocket();
    handleDisplayCreateRoom(displaySocket, {});

    const room = roomsById.values().next().value as RoomRecord;
    expect(roomIdByHostToken.size).toBe(1);

    closeRoom(room, "test");

    expect(roomIdByHostToken.size).toBe(0);
  });
});

describe("session non-displacement", () => {
  beforeEach(() => {
    roomsById.clear();
    roomIdByJoinCode.clear();
    roomIdByHostToken.clear();
    sessionsById.clear();
  });

  it("display reconnect does not remove host session", () => {
    const displaySocket = makeMockSocket();
    handleDisplayCreateRoom(displaySocket, {});

    const room = roomsById.values().next().value as RoomRecord;
    const hostSocket = makeMockSocket();
    handleHostConnect(hostSocket, { hostToken: room.hostToken });

    const hostSessionId = room.hostSessionId;
    expect(sessionsById.has(hostSessionId)).toBe(true);

    const hostSessionBefore = sessionsById.get(hostSessionId);
    expect(hostSessionBefore?.role).toBe("host");

    expect(sessionsById.has(room.displaySessionId!)).toBe(true);
  });

  it("host pairing does not remove display session", () => {
    const displaySocket = makeMockSocket();
    handleDisplayCreateRoom(displaySocket, {});

    const room = roomsById.values().next().value as RoomRecord;
    const displaySessionId = room.displaySessionId!;

    const hostSocket = makeMockSocket();
    handleHostConnect(hostSocket, { hostToken: room.hostToken });

    expect(sessionsById.has(displaySessionId)).toBe(true);
    const displaySession = sessionsById.get(displaySessionId);
    expect(displaySession?.role).toBe("display");
  });
});

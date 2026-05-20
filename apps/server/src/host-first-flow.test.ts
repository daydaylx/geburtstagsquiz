import { EVENTS } from "@quiz/shared-protocol";
import { QuestionType, RoomState } from "@quiz/shared-types";
import { beforeEach, describe, expect, it } from "vitest";
import {
  handleConnectionResume,
  handleDisplayConnectRoom,
  handleHostCreateRoom,
  handleRoomJoin,
  handleRoomSettingsUpdate,
} from "./lobby.js";
import { isEventAllowedForRole } from "./role-auth.js";
import type { RoomRecord, TrackedWebSocket } from "./server-types.js";
import { roomIdByHostToken, roomIdByJoinCode, roomsById, sessionsById } from "./state.js";

function makeMockSocket(sessionId: string | null = null): TrackedWebSocket {
  const sent: string[] = [];
  return {
    connectionId: `conn-${Math.random().toString(36).slice(2)}`,
    isAlive: true,
    sessionId,
    readyState: 1,
    send: (data: string) => sent.push(data),
    close: () => {},
    ping: () => {},
    _sent: sent,
  } as unknown as TrackedWebSocket;
}

function getSent(socket: TrackedWebSocket): Array<{ event: string; payload: unknown }> {
  return (socket as unknown as { _sent: string[] })._sent.map((raw) => JSON.parse(raw));
}

beforeEach(() => {
  roomsById.clear();
  roomIdByJoinCode.clear();
  roomIdByHostToken.clear();
  sessionsById.clear();
});

describe("handleHostCreateRoom", () => {
  it("creates a room and assigns host session", () => {
    const socket = makeMockSocket();
    handleHostCreateRoom(socket, {});

    expect(roomsById.size).toBe(1);
    const room = [...roomsById.values()][0] as RoomRecord;
    expect(room.state).toBe(RoomState.Waiting);
    expect(room.hostConnected).toBe(true);
    expect(room.displayConnected).toBe(false);
    expect(room.hostTokenUsed).toBe(true);
    expect(room.displayConnectToken).toBeTruthy();
    expect(room.displayConnectTokenUsed).toBe(false);
    expect(room.settings).toMatchObject({
      showAnswerTextOnPlayerDevices: false,
      moderatorEnabled: false,
      moderatorFrequency: "low",
    });
    expect(socket.sessionId).toBe(room.hostSessionId);
  });

  it("sends HOST_ROOM_CREATED with displayConnectToken", () => {
    const socket = makeMockSocket();
    handleHostCreateRoom(socket, {});

    const messages = getSent(socket);
    const created = messages.find((m) => m.event === EVENTS.HOST_ROOM_CREATED);
    expect(created).toBeDefined();
    const payload = created!.payload as {
      roomId: string;
      hostSessionId: string;
      joinCode: string;
      displayConnectToken: string;
    };
    expect(payload.roomId).toBeTruthy();
    expect(payload.hostSessionId).toBeTruthy();
    expect(payload.joinCode).toBeTruthy();
    expect(payload.displayConnectToken).toBeTruthy();
  });

  it("sends CATALOG_SUMMARY after room creation", () => {
    const socket = makeMockSocket();
    handleHostCreateRoom(socket, {});

    const messages = getSent(socket);
    const catalog = messages.find((m) => m.event === EVENTS.CATALOG_SUMMARY);
    expect(catalog).toBeDefined();
  });

  it("returns unused displayConnectToken to host on resume before display connects", () => {
    const socket = makeMockSocket();
    handleHostCreateRoom(socket, {});
    const room = [...roomsById.values()][0] as RoomRecord;
    const token = room.displayConnectToken;

    const resumedSocket = makeMockSocket();
    handleConnectionResume(resumedSocket, { roomId: room.id, sessionId: room.hostSessionId });

    const messages = getSent(resumedSocket);
    const resumed = messages.find((m) => m.event === EVENTS.CONNECTION_RESUMED);
    expect(resumed).toBeDefined();
    expect((resumed!.payload as { displayConnectToken: string | null }).displayConnectToken).toBe(token);
  });

  it("does not return displayConnectToken to host after display is paired", () => {
    const socket = makeMockSocket();
    handleHostCreateRoom(socket, {});
    const room = [...roomsById.values()][0] as RoomRecord;

    const displaySocket = makeMockSocket();
    handleDisplayConnectRoom(displaySocket, {
      roomId: room.id,
      displayConnectToken: room.displayConnectToken!,
    });

    const resumedSocket = makeMockSocket();
    handleConnectionResume(resumedSocket, { roomId: room.id, sessionId: room.hostSessionId });

    const messages = getSent(resumedSocket);
    const resumed = messages.find((m) => m.event === EVENTS.CONNECTION_RESUMED);
    expect(resumed).toBeDefined();
    expect((resumed!.payload as { displayConnectToken?: string | null }).displayConnectToken).toBe(null);
  });

  it("rejects if socket already has a session", () => {
    const socket = makeMockSocket("existing-session");
    handleHostCreateRoom(socket, {});

    expect(roomsById.size).toBe(0);
    const messages = getSent(socket);
    const error = messages.find((m) => m.event === EVENTS.ERROR_PROTOCOL);
    expect(error).toBeDefined();
  });
});

describe("handleDisplayConnectRoom", () => {
  function setupRoom() {
    const hostSocket = makeMockSocket();
    handleHostCreateRoom(hostSocket, {});
    const room = [...roomsById.values()][0] as RoomRecord;
    return { room, hostSocket };
  }

  it("connects display and marks token as used", () => {
    const { room } = setupRoom();
    const displaySocket = makeMockSocket();

    handleDisplayConnectRoom(displaySocket, {
      roomId: room.id,
      displayConnectToken: room.displayConnectToken!,
    });

    expect(room.displayConnected).toBe(true);
    expect(room.displayConnectTokenUsed).toBe(true);
    expect(room.displaySessionId).toBeTruthy();
    expect(displaySocket.sessionId).toBe(room.displaySessionId);
  });

  it("sends DISPLAY_ROOM_CONNECTED with hostConnected=true", () => {
    const { room } = setupRoom();
    const displaySocket = makeMockSocket();

    handleDisplayConnectRoom(displaySocket, {
      roomId: room.id,
      displayConnectToken: room.displayConnectToken!,
    });

    const messages = getSent(displaySocket);
    const connected = messages.find((m) => m.event === EVENTS.DISPLAY_ROOM_CONNECTED);
    expect(connected).toBeDefined();
    const payload = connected!.payload as {
      roomId: string;
      displaySessionId: string;
      displayToken: string;
      joinCode: string;
      hostConnected: boolean;
    };
    expect(payload.hostConnected).toBe(true);
    expect(payload.roomId).toBe(room.id);
    expect(payload.displaySessionId).toBeTruthy();
    expect(payload).not.toHaveProperty("hostToken");
    expect(payload).not.toHaveProperty("displayConnectToken");
  });

  it("sends HOST_DISPLAY_PAIRED to host", () => {
    const { room, hostSocket } = setupRoom();
    const sentBefore = getSent(hostSocket).length;
    const displaySocket = makeMockSocket();

    handleDisplayConnectRoom(displaySocket, {
      roomId: room.id,
      displayConnectToken: room.displayConnectToken!,
    });

    const messages = getSent(hostSocket);
    const paired = messages.slice(sentBefore).find((m) => m.event === EVENTS.HOST_DISPLAY_PAIRED);
    expect(paired).toBeDefined();
    expect((paired!.payload as { displayConnected: boolean }).displayConnected).toBe(true);
  });

  it("keeps gamePlanDraft out of display lobby updates", () => {
    const { room, hostSocket } = setupRoom();
    const displaySocket = makeMockSocket();
    handleDisplayConnectRoom(displaySocket, {
      roomId: room.id,
      displayConnectToken: room.displayConnectToken!,
    });

    handleRoomSettingsUpdate(hostSocket, {
      roomId: room.id,
      showAnswerTextOnPlayerDevices: false,
      gamePlanDraft: {
        mode: "custom",
        questionCount: 1,
        categoryIds: ["cat-01"],
        questionTypes: [QuestionType.MultipleChoice],
        timerMs: 90000,
        revealDurationMs: 30000,
        revealMode: "manual_with_fallback",
        revealDelayMs: 0,
        playerReadingPhaseMs: 0,
        showAnswerTextOnPlayerDevices: false,
        enableDemoQuestion: false,
        displayShowLevel: "minimal",
        rankingScoringMode: "partial_with_bonus",
      },
      moderatorEnabled: true,
      moderatorFrequency: "medium",
    });

    const displayLobby = getSent(displaySocket)
      .filter((m) => m.event === EVENTS.LOBBY_UPDATE)
      .at(-1);
    const hostLobby = getSent(hostSocket)
      .filter((m) => m.event === EVENTS.LOBBY_UPDATE)
      .at(-1);

    expect(displayLobby).toBeDefined();
    expect(hostLobby).toBeDefined();
    expect((displayLobby!.payload as { settings: Record<string, unknown> }).settings).not.toHaveProperty(
      "gamePlanDraft",
    );
    expect((displayLobby!.payload as { settings: Record<string, unknown> }).settings).toMatchObject({
      showAnswerTextOnPlayerDevices: false,
      moderatorEnabled: true,
      moderatorFrequency: "medium",
    });
    expect((hostLobby!.payload as { settings: Record<string, unknown> }).settings).toHaveProperty("gamePlanDraft");
  });

  it("preserves moderator settings when other room settings change", () => {
    const { room, hostSocket } = setupRoom();
    const displaySocket = makeMockSocket();
    handleDisplayConnectRoom(displaySocket, {
      roomId: room.id,
      displayConnectToken: room.displayConnectToken!,
    });

    handleRoomSettingsUpdate(hostSocket, {
      roomId: room.id,
      showAnswerTextOnPlayerDevices: false,
      moderatorEnabled: true,
      moderatorFrequency: "high",
    });
    handleRoomSettingsUpdate(hostSocket, {
      roomId: room.id,
      showAnswerTextOnPlayerDevices: true,
      gamePlanDraft: {
        mode: "custom",
        questionCount: 1,
        categoryIds: ["cat-01"],
        questionTypes: [QuestionType.MultipleChoice],
        timerMs: 90000,
        revealDurationMs: 30000,
        revealMode: "manual_with_fallback",
        revealDelayMs: 0,
        playerReadingPhaseMs: 0,
        showAnswerTextOnPlayerDevices: true,
        enableDemoQuestion: false,
        displayShowLevel: "minimal",
        rankingScoringMode: "partial_with_bonus",
      },
    });

    expect(room.settings).toMatchObject({
      showAnswerTextOnPlayerDevices: true,
      moderatorEnabled: true,
      moderatorFrequency: "high",
    });

    const displayLobby = getSent(displaySocket)
      .filter((m) => m.event === EVENTS.LOBBY_UPDATE)
      .at(-1);
    expect((displayLobby!.payload as { settings: Record<string, unknown> }).settings).toMatchObject({
      showAnswerTextOnPlayerDevices: true,
      moderatorEnabled: true,
      moderatorFrequency: "high",
    });
  });

  it("keeps moderator settings out of player lobby updates", () => {
    const { room, hostSocket } = setupRoom();
    const playerSocket = makeMockSocket();
    handleRoomJoin(playerSocket, {
      joinCode: room.joinCode,
      playerName: "Max",
    });

    handleRoomSettingsUpdate(hostSocket, {
      roomId: room.id,
      showAnswerTextOnPlayerDevices: false,
      moderatorEnabled: true,
      moderatorFrequency: "medium",
    });

    const playerLobby = getSent(playerSocket)
      .filter((m) => m.event === EVENTS.LOBBY_UPDATE)
      .at(-1);
    expect(playerLobby).toBeDefined();
    const playerSettings = (playerLobby!.payload as { settings: Record<string, unknown> }).settings;
    expect(playerSettings).toEqual({ showAnswerTextOnPlayerDevices: false });
  });

  it("rejects invalid displayConnectToken", () => {
    const { room } = setupRoom();
    const displaySocket = makeMockSocket();

    handleDisplayConnectRoom(displaySocket, {
      roomId: room.id,
      displayConnectToken: "wrong-token",
    });

    expect(room.displayConnected).toBe(false);
    const messages = getSent(displaySocket);
    const error = messages.find((m) => m.event === EVENTS.ERROR_PROTOCOL);
    expect(error).toBeDefined();
  });

  it("rejects reuse of an already-used displayConnectToken", () => {
    const { room } = setupRoom();
    const token = room.displayConnectToken!;

    const display1 = makeMockSocket();
    handleDisplayConnectRoom(display1, { roomId: room.id, displayConnectToken: token });
    expect(room.displayConnectTokenUsed).toBe(true);

    const display2 = makeMockSocket();
    handleDisplayConnectRoom(display2, { roomId: room.id, displayConnectToken: token });

    const messages2 = getSent(display2);
    const error = messages2.find((m) => m.event === EVENTS.ERROR_PROTOCOL);
    expect(error).toBeDefined();
  });

  it("rejects if room does not exist", () => {
    const displaySocket = makeMockSocket();
    handleDisplayConnectRoom(displaySocket, {
      roomId: "nonexistent",
      displayConnectToken: "any-token",
    });

    const messages = getSent(displaySocket);
    const error = messages.find((m) => m.event === EVENTS.ERROR_PROTOCOL);
    expect(error).toBeDefined();
  });
});

describe("role-auth: new host-first events", () => {
  it("HOST_CREATE_ROOM is blocked for player role", () => {
    expect(isEventAllowedForRole(EVENTS.HOST_CREATE_ROOM, "player")).toBe(false);
  });

  it("HOST_CREATE_ROOM is blocked for display role", () => {
    expect(isEventAllowedForRole(EVENTS.HOST_CREATE_ROOM, "display")).toBe(false);
  });

  it("HOST_CREATE_ROOM is allowed for null role (unauthenticated)", () => {
    expect(isEventAllowedForRole(EVENTS.HOST_CREATE_ROOM, null)).toBe(true);
  });

  it("DISPLAY_CONNECT_ROOM is blocked for host role", () => {
    expect(isEventAllowedForRole(EVENTS.DISPLAY_CONNECT_ROOM, "host")).toBe(false);
  });

  it("DISPLAY_CONNECT_ROOM is blocked for player role", () => {
    expect(isEventAllowedForRole(EVENTS.DISPLAY_CONNECT_ROOM, "player")).toBe(false);
  });

  it("DISPLAY_CONNECT_ROOM is allowed for null role (unauthenticated)", () => {
    expect(isEventAllowedForRole(EVENTS.DISPLAY_CONNECT_ROOM, null)).toBe(true);
  });
});

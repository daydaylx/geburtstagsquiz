import { beforeEach, describe, expect, it } from "vitest";

import { EVENTS } from "@quiz/shared-protocol";
import { RoomState } from "@quiz/shared-types";

import { isEventAllowedForRole } from "./role-auth.js";
import { roomsById, roomIdByJoinCode, sessionsById } from "./state.js";
import { handleHostCreateRoom, handleDisplayConnectRoom } from "./lobby.js";
import type { RoomRecord, TrackedWebSocket } from "./server-types.js";

function makeMockSocket(sessionId: string | null = null): TrackedWebSocket {
  const sent: string[] = [];
  return {
    connectionId: "conn-" + Math.random().toString(36).slice(2),
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

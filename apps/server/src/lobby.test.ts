import { beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";

import { roomsById, roomIdByHostToken, roomIdByJoinCode, sessionsById } from "./state.js";
import { createRoom } from "./room.js";
import type { RoomRecord, SessionRecord, TrackedWebSocket } from "./server-types.js";

function makeMockSocket(sessionId: string | null = null): TrackedWebSocket {
  const sent: string[] = [];
  return {
    connectionId: "conn-" + Math.random().toString(36).slice(2),
    isAlive: true,
    sessionId,
    readyState: WebSocket.OPEN,
    send: (data: string) => {
      sent.push(data);
    },
    close: () => {},
    ping: () => {},
    _sent: sent,
  } as unknown as TrackedWebSocket;
}

describe("createRoom (legacy host-first flow)", () => {
  beforeEach(() => {
    roomsById.clear();
    roomIdByJoinCode.clear();
    roomIdByHostToken.clear();
    sessionsById.clear();
  });

  it("creates room and registers in roomsById and roomIdByJoinCode", () => {
    const socket = makeMockSocket();
    createRoom(socket, {
      hostName: "TestHost",
      clientInfo: { deviceType: "desktop", appVersion: "test" },
    });

    expect(roomsById.size).toBe(1);
    expect(roomIdByJoinCode.size).toBe(1);
  });

  it("does NOT register in roomIdByHostToken", () => {
    const socket = makeMockSocket();
    createRoom(socket, {
      hostName: "TestHost",
      clientInfo: { deviceType: "desktop", appVersion: "test" },
    });

    expect(roomIdByHostToken.size).toBe(0);
  });

  it("assigns host role immediately and sets hostConnected=true", () => {
    const socket = makeMockSocket();
    createRoom(socket, {
      hostName: "TestHost",
      clientInfo: { deviceType: "desktop", appVersion: "test" },
    });

    const room = roomsById.values().next().value as RoomRecord;
    const session = sessionsById.values().next().value as SessionRecord;

    expect(room.hostConnected).toBe(true);
    expect(room.displayConnected).toBe(false);
    expect(session.role).toBe("host");
  });

  it("has empty hostToken and displayToken before display pairs", () => {
    const socket = makeMockSocket();
    createRoom(socket, {
      hostName: "TestHost",
      clientInfo: { deviceType: "desktop", appVersion: "test" },
    });

    const room = roomsById.values().next().value as RoomRecord;
    expect(room.hostToken).toBe("");
    expect(room.displayToken).toBe("");
  });

  it("uses the provided hostName on the room", () => {
    const socket = makeMockSocket();
    createRoom(socket, {
      hostName: "Alice",
      clientInfo: { deviceType: "desktop", appVersion: "test" },
    });

    const room = roomsById.values().next().value as RoomRecord;
    expect(room.hostName).toBe("Alice");
  });

  it("rejects if socket already has a session", () => {
    const socket = makeMockSocket("existing-session");
    createRoom(socket, {
      hostName: "TestHost",
      clientInfo: { deviceType: "desktop", appVersion: "test" },
    });

    expect(roomsById.size).toBe(0);
  });
});

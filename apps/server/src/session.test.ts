import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { RoomState } from "@quiz/shared-types";
import { HOST_DISCONNECT_GRACE_MS } from "./config.js";
import { handleConnectionResume, handleHostConnect } from "./lobby.js";
import { handleDisplayCreateRoom } from "./room.js";
import type { RoomRecord, TrackedWebSocket } from "./server-types.js";
import { handleSocketClose } from "./session.js";
import { roomIdByHostToken, roomIdByJoinCode, roomsById, sessionsById } from "./state.js";

function makeMockSocket(): TrackedWebSocket {
  const sent: string[] = [];
  return {
    connectionId: `conn-${Math.random().toString(36).slice(2)}`,
    isAlive: true,
    sessionId: null,
    readyState: WebSocket.OPEN,
    send: (data: string) => {
      sent.push(data);
    },
    close: vi.fn(),
    ping: vi.fn(),
    _sent: sent,
  } as unknown as TrackedWebSocket;
}

describe("Host disconnect & reconnect", () => {
  let room: RoomRecord;
  let hostSocket: TrackedWebSocket;

  beforeEach(() => {
    vi.useFakeTimers();
    roomsById.clear();
    roomIdByJoinCode.clear();
    roomIdByHostToken.clear();
    sessionsById.clear();

    const displaySocket = makeMockSocket();
    handleDisplayCreateRoom(displaySocket, {});
    room = roomsById.values().next().value as RoomRecord;

    hostSocket = makeMockSocket();
    handleHostConnect(hostSocket, { hostToken: room.hostToken });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("sets hostConnected=false and starts timer on host disconnect", () => {
    expect(room.hostConnected).toBe(true);

    handleSocketClose(hostSocket);

    expect(room.hostConnected).toBe(false);
    expect(room.hostDisconnectTimer).not.toBeNull();
  });

  it("clears host disconnect timer on reconnect", () => {
    const hostSessionId = room.hostSessionId;

    handleSocketClose(hostSocket);
    expect(room.hostDisconnectTimer).not.toBeNull();

    const newHostSocket = makeMockSocket();
    handleConnectionResume(newHostSocket, { sessionId: hostSessionId, roomId: room.id });

    expect(room.hostConnected).toBe(true);
    expect(room.hostDisconnectTimer).toBeNull();
  });

  it("closes room after HOST_DISCONNECT_GRACE_MS without reconnect", () => {
    const roomId = room.id;

    handleSocketClose(hostSocket);
    expect(roomsById.has(roomId)).toBe(true);

    vi.advanceTimersByTime(HOST_DISCONNECT_GRACE_MS);

    expect(roomsById.has(roomId)).toBe(false);
  });

  it("room remains open when host reconnects before timeout", () => {
    const roomId = room.id;
    const hostSessionId = room.hostSessionId;

    handleSocketClose(hostSocket);

    vi.advanceTimersByTime(HOST_DISCONNECT_GRACE_MS / 2);
    const newHostSocket = makeMockSocket();
    handleConnectionResume(newHostSocket, { sessionId: hostSessionId, roomId });

    vi.advanceTimersByTime(HOST_DISCONNECT_GRACE_MS);

    expect(roomsById.has(roomId)).toBe(true);
  });

  it("ignores close for a socket that no longer owns the session", () => {
    const roomId = room.id;
    const hostSessionId = room.hostSessionId;

    handleSocketClose(hostSocket);

    const newHostSocket = makeMockSocket();
    handleConnectionResume(newHostSocket, { sessionId: hostSessionId, roomId });

    handleSocketClose(hostSocket);

    expect(roomsById.has(roomId)).toBe(true);
    expect(room.hostConnected).toBe(true);
  });
});

describe("Host disconnect in completed room", () => {
  let room: RoomRecord;
  let hostSocket: TrackedWebSocket;

  beforeEach(() => {
    vi.useFakeTimers();
    roomsById.clear();
    roomIdByJoinCode.clear();
    roomIdByHostToken.clear();
    sessionsById.clear();

    const displaySocket = makeMockSocket();
    handleDisplayCreateRoom(displaySocket, {});
    room = roomsById.values().next().value as RoomRecord;

    hostSocket = makeMockSocket();
    handleHostConnect(hostSocket, { hostToken: room.hostToken });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("does NOT close completed room immediately on host disconnect", () => {
    room.state = RoomState.Completed;
    const roomId = room.id;

    handleSocketClose(hostSocket);

    expect(roomsById.has(roomId)).toBe(true);
    expect(room.hostDisconnectTimer).not.toBeNull();
  });

  it("closes completed room after grace period if host does not reconnect", () => {
    room.state = RoomState.Completed;
    const roomId = room.id;

    handleSocketClose(hostSocket);
    expect(roomsById.has(roomId)).toBe(true);

    vi.advanceTimersByTime(HOST_DISCONNECT_GRACE_MS);

    expect(roomsById.has(roomId)).toBe(false);
  });

  it("allows host to reconnect to completed room before grace expires", () => {
    room.state = RoomState.Completed;
    const roomId = room.id;
    const hostSessionId = room.hostSessionId;

    handleSocketClose(hostSocket);
    expect(room.hostConnected).toBe(false);

    vi.advanceTimersByTime(HOST_DISCONNECT_GRACE_MS / 2);

    const newHostSocket = makeMockSocket();
    handleConnectionResume(newHostSocket, { sessionId: hostSessionId, roomId });

    expect(room.hostConnected).toBe(true);
    expect(room.hostDisconnectTimer).toBeNull();

    vi.advanceTimersByTime(HOST_DISCONNECT_GRACE_MS);
    expect(roomsById.has(roomId)).toBe(true);
  });
});

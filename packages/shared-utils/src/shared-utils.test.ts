import { describe, expect, it } from "vitest";

import {
  assertUnreachable,
  getReconnectDelay,
  getWebSocketProtocol,
  isJoinCodeFormat,
  isLoopbackHostname,
  JOIN_CODE_ALPHABET,
  JOIN_CODE_LENGTH,
  normalizeJoinCode,
  normalizePlayerName,
  PLAYER_NAME_MAX_LENGTH,
  PLAYER_NAME_MIN_LENGTH,
  SOCKET_RECONNECT_DELAYS_MS,
} from "./index.js";

describe("join-code", () => {
  it("normalizes whitespace and casing", () => {
    expect(normalizeJoinCode("  abc123  ")).toBe("ABC123");
    expect(normalizeJoinCode("a b c")).toBe("ABC");
  });

  it("accepts valid join codes", () => {
    expect(isJoinCodeFormat("ABCDEF")).toBe(true);
    expect(isJoinCodeFormat("A2K9M7")).toBe(true);
    expect(isJoinCodeFormat(JOIN_CODE_ALPHABET.slice(0, JOIN_CODE_LENGTH))).toBe(true);
  });

  it("rejects invalid join codes", () => {
    expect(isJoinCodeFormat("ABC01")).toBe(false);
    expect(isJoinCodeFormat("AB1CD")).toBe(false);
    expect(isJoinCodeFormat("ABCDE")).toBe(false);
    expect(isJoinCodeFormat("ABCDEFG")).toBe(false);
    expect(isJoinCodeFormat("")).toBe(false);
    expect(isJoinCodeFormat("IO10AB")).toBe(false);
    expect(isJoinCodeFormat("ABC!@#")).toBe(false);
  });

  it("excludes ambiguous characters from alphabet", () => {
    expect(JOIN_CODE_ALPHABET).not.toContain("I");
    expect(JOIN_CODE_ALPHABET).not.toContain("O");
    expect(JOIN_CODE_ALPHABET).not.toContain("0");
    expect(JOIN_CODE_ALPHABET).not.toContain("1");
  });

  it("has correct length constant", () => {
    expect(JOIN_CODE_LENGTH).toBe(6);
  });
});

describe("names", () => {
  it("trims whitespace", () => {
    expect(normalizePlayerName("  Max  ")).toBe("Max");
  });

  it("collapses internal whitespace", () => {
    expect(normalizePlayerName("Max   Mustermann")).toBe("Max Mustermann");
  });

  it("normalizes unicode to NFKC", () => {
    expect(normalizePlayerName("\u0041\u030A")).toBe("\u00C5");
  });

  it("has correct length constants", () => {
    expect(PLAYER_NAME_MIN_LENGTH).toBe(1);
    expect(PLAYER_NAME_MAX_LENGTH).toBe(30);
  });
});

describe("network", () => {
  it("returns correct reconnect delays", () => {
    expect(getReconnectDelay(0)).toBe(SOCKET_RECONNECT_DELAYS_MS[0]);
    expect(getReconnectDelay(1)).toBe(SOCKET_RECONNECT_DELAYS_MS[1]);
    expect(getReconnectDelay(2)).toBe(SOCKET_RECONNECT_DELAYS_MS[2]);
  });

  it("caps reconnect delay at last value", () => {
    expect(getReconnectDelay(10)).toBe(SOCKET_RECONNECT_DELAYS_MS[SOCKET_RECONNECT_DELAYS_MS.length - 1]);
    expect(getReconnectDelay(999)).toBe(SOCKET_RECONNECT_DELAYS_MS[SOCKET_RECONNECT_DELAYS_MS.length - 1]);
  });

  it("detects loopback hostnames", () => {
    expect(isLoopbackHostname("localhost")).toBe(true);
    expect(isLoopbackHostname("127.0.0.1")).toBe(true);
    expect(isLoopbackHostname("::1")).toBe(true);
    expect(isLoopbackHostname("[::1]")).toBe(true);
    expect(isLoopbackHostname("192.168.1.1")).toBe(false);
    expect(isLoopbackHostname("example.com")).toBe(false);
  });

  it("resolves WebSocket protocol from page protocol", () => {
    expect(getWebSocketProtocol("https:")).toBe("wss:");
    expect(getWebSocketProtocol("http:")).toBe("ws:");
  });
});

describe("assertions", () => {
  it("throws for unreachable values", () => {
    expect(() => assertUnreachable("x" as never)).toThrow("Unhandled case");
    expect(() => assertUnreachable("x" as never)).toThrow("x");
  });

  it("uses custom message", () => {
    expect(() => assertUnreachable("y" as never, "Custom")).toThrow("Custom");
  });
});

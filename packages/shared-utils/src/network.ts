export const SOCKET_RECONNECT_DELAYS_MS = [1_000, 2_000, 5_000] as const;

export function getReconnectDelay(attempt: number): number {
  return SOCKET_RECONNECT_DELAYS_MS[Math.min(attempt, SOCKET_RECONNECT_DELAYS_MS.length - 1)];
}

export function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

export function getWebSocketProtocol(pageProtocol: string): "ws:" | "wss:" {
  return pageProtocol === "https:" ? "wss:" : "ws:";
}

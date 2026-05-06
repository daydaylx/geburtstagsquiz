import { getWebSocketProtocol, isLoopbackHostname } from "@quiz/shared-utils";

export function getViteEnv(name: string): string | undefined {
  return (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.[name];
}

export function getPublicHost(): string {
  return getViteEnv("VITE_PUBLIC_HOST") ?? window.location.hostname;
}

export function getServerSocketUrl(): string {
  const envUrl = getViteEnv("VITE_SERVER_SOCKET_URL");
  if (envUrl) return envUrl;

  const url = new URL("/ws", window.location.href);
  url.protocol = getWebSocketProtocol(window.location.protocol);
  return url.toString();
}

export function applyFallbackPlayerOrigin(url: URL): void {
  url.hostname = getPublicHost();

  const explicitPort = getViteEnv("VITE_PLAYER_PORT");
  if (explicitPort) {
    url.port = explicitPort;
    return;
  }

  if (isLoopbackHostname(url.hostname)) {
    url.port = "5174";
    return;
  }

  const labels = url.hostname.split(".");
  if (labels.length > 2 && ["tv", "host", "play"].includes(labels[0])) {
    url.hostname = ["play", ...labels.slice(1)].join(".");
  }
  url.port = "";
}

export function getPlayerJoinUrl(joinCode: string): string {
  const envUrl = getViteEnv("VITE_PLAYER_JOIN_BASE_URL");
  if (envUrl) {
    const url = new URL(envUrl);
    url.searchParams.set("joinCode", joinCode);
    return url.toString();
  }

  const url = new URL(window.location.href);
  applyFallbackPlayerOrigin(url);
  url.pathname = "/";
  url.search = new URLSearchParams({ joinCode }).toString();
  return url.toString();
}

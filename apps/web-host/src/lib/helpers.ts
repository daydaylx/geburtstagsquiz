import { getPublicHost, getViteEnv } from "@quiz/shared-hooks";
import { isLoopbackHostname } from "@quiz/shared-utils";

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

export function getDisplayUrl(displayConnectToken: string, roomId: string): string {
  const envUrl = getViteEnv("VITE_DISPLAY_URL");
  const base = envUrl ?? `${window.location.protocol}//${window.location.hostname}:5175`;
  const url = new URL(base);
  url.searchParams.set("displayConnectToken", displayConnectToken);
  url.searchParams.set("roomId", roomId);
  return url.toString();
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

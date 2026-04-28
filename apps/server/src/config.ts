export const PORT = Number(process.env.PORT) || 3001;
export const HOST = process.env.HOST || undefined;
export const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "http://127.0.0.1:5175",
  "https://tv.quiz.disaai.de",
  "https://host.quiz.disaai.de",
  "https://play.quiz.disaai.de",
] as const;
export const ALLOWED_ORIGINS = parseAllowedOrigins(
  process.env.ALLOWED_ORIGINS ?? DEFAULT_ALLOWED_ORIGINS.join(","),
);
export const HEARTBEAT_INTERVAL_MS = 15_000;
export const PLAYER_DISCONNECT_GRACE_MS = 30_000;
export const HOST_DISCONNECT_GRACE_MS = 5 * 60_000;
export const DISPLAY_DISCONNECT_GRACE_MS = 45_000;
export const QUESTION_DURATION_MS = 30_000;
export const REVEAL_DURATION_MS = 5_000;

function parseAllowedOrigins(value: string): Set<string> {
  return new Set(
    value
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

export function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) {
    return true;
  }

  try {
    const parsedOrigin = new URL(origin);
    return ALLOWED_ORIGINS.has(`${parsedOrigin.protocol}//${parsedOrigin.host}`);
  } catch {
    return false;
  }
}

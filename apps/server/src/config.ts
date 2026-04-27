export const PORT = Number(process.env.PORT) || 3001;
export const HOST = process.env.HOST || undefined;
export const HEARTBEAT_INTERVAL_MS = 15_000;
export const PLAYER_DISCONNECT_GRACE_MS = 30_000;
export const HOST_DISCONNECT_GRACE_MS = 5 * 60_000;
export const DISPLAY_DISCONNECT_GRACE_MS = 45_000;
export const QUESTION_DURATION_MS = 30_000;
export const REVEAL_DURATION_MS = 5_000;

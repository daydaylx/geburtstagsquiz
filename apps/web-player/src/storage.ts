export interface PlayerStoredSession {
  roomId: string;
  sessionId: string;
  playerId: string;
  playerName: string;
  joinCode: string;
}

const PLAYER_SESSION_STORAGE_KEY = "quiz:player-session:v1";

export function loadPlayerStoredSession(): PlayerStoredSession | null {
  try {
    const rawValue = window.localStorage.getItem(PLAYER_SESSION_STORAGE_KEY);

    if (!rawValue) {
      return null;
    }

    const parsedValue = JSON.parse(rawValue) as Partial<PlayerStoredSession>;

    if (
      typeof parsedValue.roomId !== "string" ||
      typeof parsedValue.sessionId !== "string" ||
      typeof parsedValue.playerId !== "string" ||
      typeof parsedValue.playerName !== "string" ||
      typeof parsedValue.joinCode !== "string"
    ) {
      return null;
    }

    return {
      roomId: parsedValue.roomId,
      sessionId: parsedValue.sessionId,
      playerId: parsedValue.playerId,
      playerName: parsedValue.playerName,
      joinCode: parsedValue.joinCode,
    };
  } catch {
    return null;
  }
}

export function savePlayerStoredSession(session: PlayerStoredSession): void {
  window.localStorage.setItem(PLAYER_SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearPlayerStoredSession(): void {
  window.localStorage.removeItem(PLAYER_SESSION_STORAGE_KEY);
}

export interface DisplayStoredSession {
  roomId: string;
  displaySessionId: string;
  displayToken: string;
}

const DISPLAY_SESSION_STORAGE_KEY = "quiz:display-session:v1";

export function loadDisplayStoredSession(): DisplayStoredSession | null {
  try {
    const rawValue = window.localStorage.getItem(DISPLAY_SESSION_STORAGE_KEY);

    if (!rawValue) {
      return null;
    }

    const parsedValue = JSON.parse(rawValue) as Partial<DisplayStoredSession>;

    if (
      typeof parsedValue.roomId !== "string" ||
      typeof parsedValue.displaySessionId !== "string" ||
      typeof parsedValue.displayToken !== "string"
    ) {
      return null;
    }

    return {
      roomId: parsedValue.roomId,
      displaySessionId: parsedValue.displaySessionId,
      displayToken: parsedValue.displayToken,
    };
  } catch {
    return null;
  }
}

export function saveDisplayStoredSession(session: DisplayStoredSession): void {
  window.localStorage.setItem(DISPLAY_SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearDisplayStoredSession(): void {
  window.localStorage.removeItem(DISPLAY_SESSION_STORAGE_KEY);
}

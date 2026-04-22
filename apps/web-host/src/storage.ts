export interface HostStoredSession {
  roomId: string;
  sessionId: string;
}

const HOST_SESSION_STORAGE_KEY = "quiz:host-session:v1";

export function loadHostStoredSession(): HostStoredSession | null {
  try {
    const rawValue = window.localStorage.getItem(HOST_SESSION_STORAGE_KEY);

    if (!rawValue) {
      return null;
    }

    const parsedValue = JSON.parse(rawValue) as Partial<HostStoredSession>;

    if (typeof parsedValue.roomId !== "string" || typeof parsedValue.sessionId !== "string") {
      return null;
    }

    return {
      roomId: parsedValue.roomId,
      sessionId: parsedValue.sessionId,
    };
  } catch {
    return null;
  }
}

export function saveHostStoredSession(session: HostStoredSession): void {
  window.localStorage.setItem(HOST_SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearHostStoredSession(): void {
  window.localStorage.removeItem(HOST_SESSION_STORAGE_KEY);
}

export const PLAYER_NAME_MIN_LENGTH = 1;
export const PLAYER_NAME_MAX_LENGTH = 30;

export function normalizePlayerName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

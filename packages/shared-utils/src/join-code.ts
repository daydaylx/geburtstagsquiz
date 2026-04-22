export const JOIN_CODE_LENGTH = 6;
export const JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const joinCodePattern = new RegExp(`^[${JOIN_CODE_ALPHABET}]{${JOIN_CODE_LENGTH}}$`);

export function normalizeJoinCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function isJoinCodeFormat(value: string): boolean {
  return joinCodePattern.test(normalizeJoinCode(value));
}

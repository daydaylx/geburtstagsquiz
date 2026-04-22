export const CLIENT_ROLES = ["host", "player"] as const;

export type ClientRole = (typeof CLIENT_ROLES)[number];

export interface ClientInfo {
  deviceType: string;
  appVersion: string;
}

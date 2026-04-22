import type { PlayerState } from "./enums.js";

export interface Player {
  id: string;
  name: string;
  sessionId: string;
  state: PlayerState;
  score: number;
}

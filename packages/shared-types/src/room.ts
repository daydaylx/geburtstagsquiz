import type { GameState, RoomState } from "./enums.js";
import type { Player } from "./player.js";
import type { Quiz } from "./quiz.js";

export interface RoomSettings {
  showAnswerTextOnPlayerDevices: boolean;
}

export interface Room {
  id: string;
  joinCode: string;
  state: RoomState;
  hostName: string;
  hostSessionId: string;
  hostConnected: boolean;
  settings: RoomSettings;
  players: Player[];
  quiz: Quiz | null;
  currentQuestionIndex: number | null;
  gameState: GameState | null;
}

import type { GameState, RoomState } from "./enums.js";
import type { GamePlan, ResolvedGamePlan } from "./game-plan.js";
import type { Player } from "./player.js";
import type { Quiz } from "./quiz.js";

export interface RoomSettings {
  showAnswerTextOnPlayerDevices: boolean;
  gamePlanDraft?: GamePlan;
}

export interface Room {
  id: string;
  joinCode: string;
  state: RoomState;
  hostName: string;
  hostSessionId: string;
  hostConnected: boolean;
  displayConnected: boolean;
  settings: RoomSettings;
  players: Player[];
  quiz: Quiz | null;
  resolvedGamePlan?: ResolvedGamePlan;
  currentQuestionIndex: number | null;
  gameState: GameState | null;
}

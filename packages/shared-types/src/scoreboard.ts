import type { Answer, CorrectAnswer } from "./answer.js";

export interface ScoreboardEntry {
  playerId: string;
  name: string;
  score: number;
}

export type Scoreboard = ScoreboardEntry[];

export interface PlayerRoundResult {
  playerId: string;
  answer: Answer | null;
  isCorrect: boolean;
  pointsEarned: number;
}

export interface RoundResult {
  questionId: string;
  correctAnswer: CorrectAnswer;
  playerResults: PlayerRoundResult[];
}

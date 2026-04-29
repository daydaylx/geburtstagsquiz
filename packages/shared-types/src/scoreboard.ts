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
  detail?: {
    exactPositions?: number;
    totalPositions?: number;
    bonusPoints?: number;
    submittedText?: string;
  };
}

export interface RoundResult {
  questionId: string;
  correctAnswer: CorrectAnswer;
  playerResults: PlayerRoundResult[];
}

export interface ScoreChange {
  playerId: string;
  name: string;
  previousScore: number;
  score: number;
  delta: number;
  previousRank: number;
  rank: number;
}

export interface GameFinalStats {
  mostCorrect?: {
    playerId: string;
    name: string;
    count: number;
  };
  fastestAnswer?: {
    playerId: string;
    name: string;
    submittedAtMs: number;
  };
  closestGap?: {
    points: number;
  };
}

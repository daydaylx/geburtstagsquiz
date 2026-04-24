import { QuestionType } from "./enums.js";

export interface QuestionOption {
  id: string;
  label: string;
}

export interface MultipleChoiceQuestion {
  id: string;
  type: QuestionType.MultipleChoice;
  text: string;
  options: QuestionOption[];
  correctOptionId: string;
  durationMs: number;
  points: number;
}

export interface LogicQuestion {
  id: string;
  type: QuestionType.Logic;
  text: string;
  options: QuestionOption[];
  correctOptionId: string;
  durationMs: number;
  points: number;
}

export interface EstimateQuestion {
  id: string;
  type: QuestionType.Estimate;
  text: string;
  correctValue: number;
  unit: string;
  context: string;
  durationMs: number;
  points: number;
}

export interface MajorityGuessQuestion {
  id: string;
  type: QuestionType.MajorityGuess;
  text: string;
  correctValue: number;
  unit: string;
  context: string;
  durationMs: number;
  points: number;
}

export interface RankingQuestion {
  id: string;
  type: QuestionType.Ranking;
  text: string;
  items: QuestionOption[];
  correctOrder: string[];
  durationMs: number;
  points: number;
}

export type Question =
  | MultipleChoiceQuestion
  | LogicQuestion
  | EstimateQuestion
  | MajorityGuessQuestion
  | RankingQuestion;

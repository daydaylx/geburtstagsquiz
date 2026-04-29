import { QuestionType } from "./enums.js";

export interface QuestionOption {
  id: string;
  label: string;
}

export interface QuestionMetadata {
  categoryId?: string;
  categoryName?: string;
  categorySlug?: string;
  categoryDifficulty?: string;
  difficulty?: string;
  tags?: string[];
  isDemoQuestion?: boolean;
}

export interface MultipleChoiceQuestion extends QuestionMetadata {
  id: string;
  type: QuestionType.MultipleChoice;
  text: string;
  options: QuestionOption[];
  correctOptionId: string;
  durationMs: number;
  points: number;
  explanation?: string;
}

export interface LogicQuestion extends QuestionMetadata {
  id: string;
  type: QuestionType.Logic;
  text: string;
  options: QuestionOption[];
  correctOptionId: string;
  durationMs: number;
  points: number;
  explanation?: string;
}

export interface EstimateQuestion extends QuestionMetadata {
  id: string;
  type: QuestionType.Estimate;
  text: string;
  correctValue: number;
  unit: string;
  context: string;
  durationMs: number;
  points: number;
  explanation?: string;
}

export interface MajorityGuessQuestion extends QuestionMetadata {
  id: string;
  type: QuestionType.MajorityGuess;
  text: string;
  options: QuestionOption[];
  durationMs: number;
  points: number;
  explanation?: string;
}

export interface RankingQuestion extends QuestionMetadata {
  id: string;
  type: QuestionType.Ranking;
  text: string;
  items: QuestionOption[];
  correctOrder: string[];
  durationMs: number;
  points: number;
  explanation?: string;
}

export interface OpenTextQuestion extends QuestionMetadata {
  id: string;
  type: QuestionType.OpenText;
  text: string;
  correctText: string;
  aliases: string[];
  durationMs: number;
  points: number;
  explanation?: string;
}

export type Question =
  | MultipleChoiceQuestion
  | LogicQuestion
  | EstimateQuestion
  | MajorityGuessQuestion
  | RankingQuestion
  | OpenTextQuestion;

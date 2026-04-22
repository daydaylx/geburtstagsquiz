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

export type Question = MultipleChoiceQuestion;

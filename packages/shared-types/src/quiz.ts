import type { Question } from "./question.js";

export interface Quiz {
  id: string;
  title: string;
  questions: Question[];
}

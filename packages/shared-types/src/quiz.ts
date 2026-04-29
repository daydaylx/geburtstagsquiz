import type { QuizCategory } from "./game-plan.js";
import type { Question } from "./question.js";

export interface Quiz {
  id: string;
  title: string;
  categories: QuizCategory[];
  questions: Question[];
}

import { QuestionType } from "./enums.js";

export const GAME_PLAN_PRESET_IDS = [
  "quick_dirty",
  "normal_evening",
  "full_evening",
  "chaos_party",
] as const;

export type GamePlanPresetId = (typeof GAME_PLAN_PRESET_IDS)[number];
export type GamePlanMode = "preset" | "custom";
export type DisplayShowLevel = "minimal" | "normal" | "high";
export type RevealMode = "auto" | "manual_with_fallback";
export type RankingScoringMode = "exact" | "partial_with_bonus";

export interface GamePlan {
  mode: GamePlanMode;
  presetId?: GamePlanPresetId;
  questionCount: number;
  categoryIds: string[];
  questionTypes: QuestionType[];
  timerMs: number;
  revealDurationMs: number;
  revealMode: RevealMode;
  showAnswerTextOnPlayerDevices: boolean;
  enableDemoQuestion: boolean;
  displayShowLevel: DisplayShowLevel;
  rankingScoringMode: RankingScoringMode;
}

export interface ResolvedGamePlan extends GamePlan {
  label: string;
}

export interface QuizCategory {
  id: string;
  slug: string;
  name: string;
  difficulty?: string;
  tags: string[];
  questionCount: number;
}

export interface CatalogQuestionTypeSummary {
  type: QuestionType;
  count: number;
}

export interface CatalogCategorySummary extends QuizCategory {
  questionTypes: CatalogQuestionTypeSummary[];
}

export interface QuizCatalogSummary {
  totalQuestions: number;
  maxQuestionCount: number;
  categories: CatalogCategorySummary[];
  questionTypes: CatalogQuestionTypeSummary[];
}


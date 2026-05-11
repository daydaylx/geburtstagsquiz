import { type DisplayShowLevel, type GamePlanPresetId, QuestionType } from "@quiz/shared-types";

export function getAnswerDisplayLabel(index: number): string {
  return index < 26 ? String.fromCharCode(65 + index) : `${index + 1}`;
}

export function getPresetLabel(presetId: GamePlanPresetId): string {
  switch (presetId) {
    case "quick_dirty":
      return "Kurz & dreckig";
    case "normal_evening":
      return "Normaler Abendmodus";
    case "full_evening":
      return "Voller Quizabend";
    case "chaos_party":
      return "Chaos-/Party-Modus";
  }
}

export function getPresetHint(presetId: GamePlanPresetId): string {
  switch (presetId) {
    case "quick_dirty":
      return "12 Fragen, schnell, wenig Frust.";
    case "normal_evening":
      return "20 Fragen, gemischt, Geburtstags-Default.";
    case "full_evening":
      return "30 Fragen, langer Mix.";
    case "chaos_party":
      return "18 Fragen, Tempo und Lacher.";
  }
}

export function getQuestionTypeLabel(type: QuestionType): string {
  switch (type) {
    case QuestionType.MultipleChoice:
      return "Multiple Choice";
    case QuestionType.Estimate:
      return "Schätzfragen";
    case QuestionType.MajorityGuess:
      return "Mehrheitsfragen";
    case QuestionType.Ranking:
      return "Ranking";
    case QuestionType.Logic:
      return "Denkfragen";
    case QuestionType.OpenText:
      return "Freitext";
  }
}

export function getShowLevelLabel(level: DisplayShowLevel): string {
  switch (level) {
    case "minimal":
      return "Minimal";
    case "normal":
      return "Normal";
    case "high":
      return "High";
  }
}

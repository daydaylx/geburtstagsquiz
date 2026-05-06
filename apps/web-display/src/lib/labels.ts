import { QuestionType } from "@quiz/shared-types";

export function getQuestionTypeLabel(type: QuestionType): string {
  switch (type) {
    case QuestionType.MultipleChoice:
      return "Auswahlfrage";
    case QuestionType.Logic:
      return "Logikfrage";
    case QuestionType.Estimate:
      return "Schätzfrage";
    case QuestionType.MajorityGuess:
      return "Mehrheitsfrage";
    case QuestionType.Ranking:
      return "Reihenfrage";
    case QuestionType.OpenText:
      return "Freitextfrage";
    default:
      return "";
  }
}

export function getAnswerDisplayLabel(index: number): string {
  return index < 26 ? String.fromCharCode(65 + index) : `${index + 1}`;
}

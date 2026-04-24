import { QuestionType, type Answer, type Question } from "@quiz/shared-types";

export function isAnswerValidForQuestion(question: Question, answer: Answer): boolean {
  switch (question.type) {
    case QuestionType.MultipleChoice:
    case QuestionType.Logic:
      return (
        answer.type === "option" &&
        question.options.some((option) => option.id === answer.value)
      );

    case QuestionType.Estimate:
    case QuestionType.MajorityGuess:
      return answer.type === "number" && Number.isFinite(answer.value);

    case QuestionType.Ranking: {
      if (answer.type !== "ranking") {
        return false;
      }

      const expectedIds = new Set(question.items.map((item) => item.id));
      const submittedIds = new Set(answer.value);

      return (
        answer.value.length === question.items.length &&
        submittedIds.size === expectedIds.size &&
        answer.value.every((id) => expectedIds.has(id))
      );
    }
  }
}

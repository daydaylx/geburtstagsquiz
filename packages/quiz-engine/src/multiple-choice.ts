import type {
  CorrectAnswer,
  LogicQuestion,
  MultipleChoiceQuestion,
  PlayerRoundResult,
  RoundResult,
  SubmittedAnswer,
} from "@quiz/shared-types";

import { DEFAULT_MULTIPLE_CHOICE_POINTS } from "./constants.js";

type OptionQuestion = MultipleChoiceQuestion | LogicQuestion;

function toCorrectAnswer(question: OptionQuestion): CorrectAnswer {
  return {
    type: "option",
    value: question.correctOptionId,
  };
}

export function scoreMultipleChoice(
  isCorrect: boolean,
  points = DEFAULT_MULTIPLE_CHOICE_POINTS,
): number {
  return isCorrect ? points : 0;
}

export function evaluateMultipleChoice(
  question: OptionQuestion,
  answers: SubmittedAnswer[],
): RoundResult {
  const correctAnswer = toCorrectAnswer(question);

  const playerResults: PlayerRoundResult[] = answers.map((submittedAnswer) => {
    const isCorrect =
      submittedAnswer.answer.type === correctAnswer.type &&
      submittedAnswer.answer.value === correctAnswer.value;

    return {
      playerId: submittedAnswer.playerId,
      answer: submittedAnswer.answer,
      isCorrect,
      pointsEarned: scoreMultipleChoice(isCorrect, question.points),
    };
  });

  return {
    questionId: question.id,
    correctAnswer,
    playerResults,
  };
}

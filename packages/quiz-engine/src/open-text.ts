import type {
  OpenTextQuestion,
  PlayerRoundResult,
  RoundResult,
  SubmittedAnswer,
} from "@quiz/shared-types";

export function normalizeTextAnswer(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("de-DE").replace(/\s+/g, " ");
}

export function evaluateOpenText(
  question: OpenTextQuestion,
  answers: SubmittedAnswer[],
): RoundResult {
  const acceptedAnswers = new Set(
    [question.correctText, ...question.aliases].map((answer) => normalizeTextAnswer(answer)),
  );

  const playerResults: PlayerRoundResult[] = answers.map((submittedAnswer) => {
    const isCorrect =
      submittedAnswer.answer.type === "text" &&
      acceptedAnswers.has(normalizeTextAnswer(submittedAnswer.answer.value));

    return {
      playerId: submittedAnswer.playerId,
      answer: submittedAnswer.answer,
      isCorrect,
      pointsEarned: isCorrect ? question.points : 0,
      ...(submittedAnswer.answer.type === "text"
        ? { detail: { submittedText: submittedAnswer.answer.value } }
        : {}),
    };
  });

  return {
    questionId: question.id,
    correctAnswer: { type: "text", value: question.correctText },
    playerResults,
  };
}

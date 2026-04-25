import type {
  CorrectAnswer,
  MajorityGuessQuestion,
  OptionAnswer,
  PlayerRoundResult,
  RoundResult,
  SubmittedAnswer,
} from "@quiz/shared-types";

export function evaluateMajorityGuess(
  question: MajorityGuessQuestion,
  answers: SubmittedAnswer[],
): RoundResult {
  const optionAnswers = answers.filter(
    (a): a is SubmittedAnswer & { answer: OptionAnswer } => a.answer.type === "option",
  );
  const counts = new Map<string, number>();

  for (const answer of optionAnswers) {
    counts.set(answer.answer.value, (counts.get(answer.answer.value) ?? 0) + 1);
  }

  const maxCount = Math.max(0, ...counts.values());
  const winningOptionIds =
    maxCount > 0
      ? question.options
          .map((option) => option.id)
          .filter((optionId) => (counts.get(optionId) ?? 0) === maxCount)
      : [];
  const correctAnswer: CorrectAnswer = { type: "options", value: winningOptionIds };
  const winningOptionIdSet = new Set(winningOptionIds);

  const playerResults: PlayerRoundResult[] = answers.map((submittedAnswer) => {
    const isCorrect =
      submittedAnswer.answer.type === "option" &&
      winningOptionIdSet.has(submittedAnswer.answer.value);

    return {
      playerId: submittedAnswer.playerId,
      answer: submittedAnswer.answer,
      isCorrect,
      pointsEarned: isCorrect ? question.points : 0,
    };
  });

  return {
    questionId: question.id,
    correctAnswer,
    playerResults,
  };
}

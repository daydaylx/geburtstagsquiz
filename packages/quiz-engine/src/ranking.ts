import type {
  CorrectAnswer,
  PlayerRoundResult,
  RankingScoringMode,
  RankingAnswer,
  RankingQuestion,
  RoundResult,
  SubmittedAnswer,
} from "@quiz/shared-types";

export function evaluateRanking(
  question: RankingQuestion,
  answers: SubmittedAnswer[],
  scoringMode: RankingScoringMode = "exact",
): RoundResult {
  const correctAnswer: CorrectAnswer = { type: "ranking", value: question.correctOrder };
  const correctKey = question.correctOrder.join(",");

  const playerResults: PlayerRoundResult[] = answers.map((sub) => {
    if (sub.answer.type !== "ranking") {
      return { playerId: sub.playerId, answer: sub.answer, isCorrect: false, pointsEarned: 0 };
    }
    const submitted = sub.answer as RankingAnswer;
    const isCorrect =
      submitted.value.length === question.correctOrder.length &&
      submitted.value.every((itemId, index) => itemId === question.correctOrder[index]);

    if (scoringMode === "partial_with_bonus") {
      const maxLen = Math.min(submitted.value.length, question.correctOrder.length);
      const exactPositions = submitted.value
        .slice(0, maxLen)
        .filter((itemId, index) => itemId === question.correctOrder[index]).length;
      const bonusPoints = isCorrect ? 1 : 0;
      const proportionalPoints = Math.round(
        (exactPositions / question.correctOrder.length) * question.points,
      );

      return {
        playerId: sub.playerId,
        answer: sub.answer,
        isCorrect,
        pointsEarned: Math.min(proportionalPoints + bonusPoints, question.points),
        detail: {
          exactPositions,
          totalPositions: question.correctOrder.length,
          bonusPoints,
        },
      };
    }

    return {
      playerId: sub.playerId,
      answer: sub.answer,
      isCorrect,
      pointsEarned: isCorrect ? question.points : 0,
    };
  });

  return { questionId: question.id, correctAnswer, playerResults };
}

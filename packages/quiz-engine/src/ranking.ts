import type {
  CorrectAnswer,
  PlayerRoundResult,
  RankingAnswer,
  RankingQuestion,
  RoundResult,
  SubmittedAnswer,
} from "@quiz/shared-types";

export function evaluateRanking(
  question: RankingQuestion,
  answers: SubmittedAnswer[],
): RoundResult {
  const correctAnswer: CorrectAnswer = { type: "ranking", value: question.correctOrder };
  const correctKey = question.correctOrder.join(",");

  const playerResults: PlayerRoundResult[] = answers.map((sub) => {
    if (sub.answer.type !== "ranking") {
      return { playerId: sub.playerId, answer: sub.answer, isCorrect: false, pointsEarned: 0 };
    }
    const submitted = sub.answer as RankingAnswer;
    const isCorrect = submitted.value.join(",") === correctKey;
    return {
      playerId: sub.playerId,
      answer: sub.answer,
      isCorrect,
      pointsEarned: isCorrect ? question.points : 0,
    };
  });

  return { questionId: question.id, correctAnswer, playerResults };
}

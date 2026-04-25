import type {
  CorrectAnswer,
  EstimateQuestion,
  NumberAnswer,
  PlayerRoundResult,
  RoundResult,
  SubmittedAnswer,
} from "@quiz/shared-types";

export function evaluateEstimate(
  question: EstimateQuestion,
  answers: SubmittedAnswer[],
): RoundResult {
  const correctAnswer: CorrectAnswer = { type: "number", value: question.correctValue };

  const numericAnswers = answers.filter(
    (a): a is SubmittedAnswer & { answer: NumberAnswer } => a.answer.type === "number",
  );

  let minDist = Infinity;
  for (const a of numericAnswers) {
    const dist = Math.abs(a.answer.value - question.correctValue);
    if (dist < minDist) minDist = dist;
  }

  const playerResults: PlayerRoundResult[] = answers.map((sub) => {
    if (sub.answer.type !== "number") {
      return { playerId: sub.playerId, answer: sub.answer, isCorrect: false, pointsEarned: 0 };
    }
    const isClosest =
      numericAnswers.length > 0 && Math.abs(sub.answer.value - question.correctValue) === minDist;
    return {
      playerId: sub.playerId,
      answer: sub.answer,
      isCorrect: isClosest,
      pointsEarned: isClosest ? question.points : 0,
    };
  });

  return { questionId: question.id, correctAnswer, playerResults };
}

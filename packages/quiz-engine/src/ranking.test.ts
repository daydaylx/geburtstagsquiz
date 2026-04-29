import { describe, expect, it } from "vitest";
import { QuestionType } from "@quiz/shared-types";
import type { RankingQuestion, SubmittedAnswer } from "@quiz/shared-types";

import { evaluateRanking } from "./ranking.js";

function makeQuestion(overrides?: Partial<RankingQuestion>): RankingQuestion {
  return {
    id: "q1",
    type: QuestionType.Ranking,
    text: "Sortiere nach Größe!",
    items: [
      { id: "A", label: "Maus" },
      { id: "B", label: "Katze" },
      { id: "C", label: "Elefant" },
    ],
    correctOrder: ["A", "B", "C"],
    durationMs: 15_000,
    points: 10,
    ...overrides,
  };
}

function makeAnswer(
  playerId: string,
  value: string[],
  overrides?: Partial<SubmittedAnswer>,
): SubmittedAnswer {
  return {
    playerId,
    questionId: "q1",
    answer: { type: "ranking", value },
    submittedAtMs: 1000,
    requestId: "req-1",
    ...overrides,
  };
}

describe("evaluateRanking", () => {
  it("returns correct results for correct ranking", () => {
    const question = makeQuestion();
    const answers = [makeAnswer("p1", ["A", "B", "C"])];

    const result = evaluateRanking(question, answers);

    expect(result.questionId).toBe("q1");
    expect(result.correctAnswer).toEqual({ type: "ranking", value: ["A", "B", "C"] });
    expect(result.playerResults).toHaveLength(1);
    expect(result.playerResults[0].isCorrect).toBe(true);
    expect(result.playerResults[0].pointsEarned).toBe(10);
  });

  it("returns wrong result for incorrect ranking", () => {
    const question = makeQuestion();
    const answers = [makeAnswer("p1", ["C", "B", "A"])];

    const result = evaluateRanking(question, answers);

    expect(result.playerResults[0].isCorrect).toBe(false);
    expect(result.playerResults[0].pointsEarned).toBe(0);
  });

  it("handles non-ranking answer types", () => {
    const question = makeQuestion();
    const answers: SubmittedAnswer[] = [
      {
        playerId: "p1",
        questionId: "q1",
        answer: { type: "option", value: "A" } as any,
        submittedAtMs: 1000,
        requestId: "req-1",
      },
    ];

    const result = evaluateRanking(question, answers);

    expect(result.playerResults[0].isCorrect).toBe(false);
    expect(result.playerResults[0].pointsEarned).toBe(0);
  });

  it("handles mix of correct and incorrect answers", () => {
    const question = makeQuestion();
    const answers = [
      makeAnswer("p1", ["A", "B", "C"]),
      makeAnswer("p2", ["A", "C", "B"]),
    ];

    const result = evaluateRanking(question, answers);

    expect(result.playerResults).toHaveLength(2);
    expect(result.playerResults[0].isCorrect).toBe(true);
    expect(result.playerResults[1].isCorrect).toBe(false);
  });

  it("respects custom points", () => {
    const question = makeQuestion({ points: 50 });
    const answers = [makeAnswer("p1", ["A", "B", "C"])];

    const result = evaluateRanking(question, answers);

    expect(result.playerResults[0].pointsEarned).toBe(50);
  });

  it("awards exact-position points plus bonus in partial_with_bonus mode", () => {
    const question = makeQuestion({ points: 10 });
    const answers = [makeAnswer("p1", ["A", "B", "C"])];

    const result = evaluateRanking(question, answers, "partial_with_bonus");

    expect(result.playerResults[0].isCorrect).toBe(true);
    expect(result.playerResults[0].pointsEarned).toBe(4);
    expect(result.playerResults[0].detail).toEqual({
      exactPositions: 3,
      totalPositions: 3,
      bonusPoints: 1,
    });
  });

  it("awards only exact-position points for imperfect partial rankings", () => {
    const question = makeQuestion({ points: 10 });
    const answers = [makeAnswer("p1", ["A", "C", "B"])];

    const result = evaluateRanking(question, answers, "partial_with_bonus");

    expect(result.playerResults[0].isCorrect).toBe(false);
    expect(result.playerResults[0].pointsEarned).toBe(1);
    expect(result.playerResults[0].detail).toEqual({
      exactPositions: 1,
      totalPositions: 3,
      bonusPoints: 0,
    });
  });
});

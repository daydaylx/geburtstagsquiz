import { describe, expect, it } from "vitest";
import { QuestionType } from "@quiz/shared-types";
import type { MultipleChoiceQuestion, SubmittedAnswer } from "@quiz/shared-types";

import { evaluateMultipleChoice, scoreMultipleChoice } from "./multiple-choice.js";

function makeQuestion(overrides?: Partial<MultipleChoiceQuestion>): MultipleChoiceQuestion {
  return {
    id: "q1",
    type: QuestionType.MultipleChoice,
    text: "Testfrage?",
    options: [
      { id: "A", label: "Antwort A" },
      { id: "B", label: "Antwort B" },
      { id: "C", label: "Antwort C" },
      { id: "D", label: "Antwort D" },
    ],
    correctOptionId: "B",
    durationMs: 15_000,
    points: 10,
    ...overrides,
  };
}

function makeAnswer(
  playerId: string,
  value: string,
  overrides?: Partial<SubmittedAnswer>,
): SubmittedAnswer {
  return {
    playerId,
    questionId: "q1",
    answer: { type: "option", value },
    submittedAtMs: 1000,
    requestId: "req-1",
    ...overrides,
  };
}

describe("scoreMultipleChoice", () => {
  it("returns 10 points for correct answer", () => {
    expect(scoreMultipleChoice(true)).toBe(10);
  });

  it("returns 0 points for wrong answer", () => {
    expect(scoreMultipleChoice(false)).toBe(0);
  });

  it("respects custom points value", () => {
    expect(scoreMultipleChoice(true, 25)).toBe(25);
    expect(scoreMultipleChoice(false, 25)).toBe(0);
  });
});

describe("evaluateMultipleChoice", () => {
  it("returns correct results when all answers are correct", () => {
    const question = makeQuestion();
    const answers = [makeAnswer("p1", "B"), makeAnswer("p2", "B")];

    const result = evaluateMultipleChoice(question, answers);

    expect(result.questionId).toBe("q1");
    expect(result.correctAnswer).toEqual({ type: "option", value: "B" });
    expect(result.playerResults).toHaveLength(2);
    expect(result.playerResults[0].isCorrect).toBe(true);
    expect(result.playerResults[0].pointsEarned).toBe(10);
    expect(result.playerResults[1].isCorrect).toBe(true);
    expect(result.playerResults[1].pointsEarned).toBe(10);
  });

  it("returns correct results when all answers are wrong", () => {
    const question = makeQuestion();
    const answers = [makeAnswer("p1", "A"), makeAnswer("p2", "C")];

    const result = evaluateMultipleChoice(question, answers);

    expect(result.playerResults).toHaveLength(2);
    expect(result.playerResults[0].isCorrect).toBe(false);
    expect(result.playerResults[0].pointsEarned).toBe(0);
    expect(result.playerResults[1].isCorrect).toBe(false);
    expect(result.playerResults[1].pointsEarned).toBe(0);
  });

  it("handles mix of correct and wrong answers", () => {
    const question = makeQuestion();
    const answers = [makeAnswer("p1", "B"), makeAnswer("p2", "A")];

    const result = evaluateMultipleChoice(question, answers);

    expect(result.playerResults).toHaveLength(2);
    expect(result.playerResults[0].isCorrect).toBe(true);
    expect(result.playerResults[0].pointsEarned).toBe(10);
    expect(result.playerResults[1].isCorrect).toBe(false);
    expect(result.playerResults[1].pointsEarned).toBe(0);
  });

  it("returns empty playerResults for empty answers array", () => {
    const question = makeQuestion();

    const result = evaluateMultipleChoice(question, []);

    expect(result.playerResults).toHaveLength(0);
    expect(result.correctAnswer).toEqual({ type: "option", value: "B" });
  });

  it("respects custom question points", () => {
    const question = makeQuestion({ points: 25 });
    const answers = [makeAnswer("p1", "B")];

    const result = evaluateMultipleChoice(question, answers);

    expect(result.playerResults[0].pointsEarned).toBe(25);
  });
});

import { describe, expect, it } from "vitest";
import { QuestionType, type Answer, type Question } from "@quiz/shared-types";

import { isAnswerValidForQuestion } from "./answer-validation.js";

const optionQuestion = {
  id: "q-option",
  type: QuestionType.MultipleChoice,
  text: "Option?",
  options: [
    { id: "A", label: "A" },
    { id: "B", label: "B" },
  ],
  correctOptionId: "A",
  durationMs: 15_000,
  points: 2,
} satisfies Question;

const estimateQuestion = {
  id: "q-number",
  type: QuestionType.Estimate,
  text: "Number?",
  correctValue: 42,
  unit: "kg",
  context: "Test",
  durationMs: 15_000,
  points: 3,
} satisfies Question;

const rankingQuestion = {
  id: "q-ranking",
  type: QuestionType.Ranking,
  text: "Ranking?",
  items: [
    { id: "A", label: "A" },
    { id: "B", label: "B" },
    { id: "C", label: "C" },
  ],
  correctOrder: ["A", "B", "C"],
  durationMs: 20_000,
  points: 4,
} satisfies Question;

describe("isAnswerValidForQuestion", () => {
  it("accepts only existing option IDs for option questions", () => {
    expect(isAnswerValidForQuestion(optionQuestion, { type: "option", value: "A" })).toBe(true);
    expect(isAnswerValidForQuestion(optionQuestion, { type: "option", value: "X" })).toBe(false);
    expect(isAnswerValidForQuestion(optionQuestion, { type: "number", value: 1 })).toBe(false);
  });

  it("accepts only finite numbers for estimate questions", () => {
    expect(isAnswerValidForQuestion(estimateQuestion, { type: "number", value: 41.5 })).toBe(true);
    expect(isAnswerValidForQuestion(estimateQuestion, { type: "number", value: Infinity })).toBe(
      false,
    );
    expect(isAnswerValidForQuestion(estimateQuestion, { type: "option", value: "A" })).toBe(false);
  });

  it("requires every ranking item exactly once", () => {
    expect(
      isAnswerValidForQuestion(rankingQuestion, { type: "ranking", value: ["C", "A", "B"] }),
    ).toBe(true);
    expect(
      isAnswerValidForQuestion(rankingQuestion, { type: "ranking", value: ["A", "A", "B"] }),
    ).toBe(false);
    expect(
      isAnswerValidForQuestion(rankingQuestion, { type: "ranking", value: ["A", "B"] }),
    ).toBe(false);
    expect(
      isAnswerValidForQuestion(rankingQuestion, { type: "ranking", value: ["A", "B", "X"] }),
    ).toBe(false);
    expect(isAnswerValidForQuestion(rankingQuestion, { type: "ranking", value: [] })).toBe(false);
  });

  it("handles decimal values for estimate questions", () => {
    expect(isAnswerValidForQuestion(estimateQuestion, { type: "number", value: 3.14159 })).toBe(
      true,
    );
    expect(isAnswerValidForQuestion(estimateQuestion, { type: "number", value: -10 })).toBe(true);
  });

  it("rejects mismatched answer types", () => {
    const answer: Answer = { type: "ranking", value: ["A", "B", "C"] };

    expect(isAnswerValidForQuestion(optionQuestion, answer)).toBe(false);
  });
});

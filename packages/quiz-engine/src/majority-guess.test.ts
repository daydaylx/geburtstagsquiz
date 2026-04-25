import { describe, expect, it } from "vitest";
import { QuestionType, type MajorityGuessQuestion, type SubmittedAnswer } from "@quiz/shared-types";

import { evaluateMajorityGuess } from "./majority-guess.js";

const question: MajorityGuessQuestion = {
  id: "q-majority",
  type: QuestionType.MajorityGuess,
  text: "Mehrheit?",
  options: [
    { id: "A", label: "A" },
    { id: "B", label: "B" },
    { id: "C", label: "C" },
  ],
  durationMs: 15_000,
  points: 2,
};

describe("evaluateMajorityGuess", () => {
  it("awards points to players who picked the majority option", () => {
    const answers: SubmittedAnswer[] = [
      { playerId: "p1", questionId: question.id, answer: { type: "option", value: "A" }, submittedAtMs: 1 },
      { playerId: "p2", questionId: question.id, answer: { type: "option", value: "A" }, submittedAtMs: 2 },
      { playerId: "p3", questionId: question.id, answer: { type: "option", value: "B" }, submittedAtMs: 3 },
    ];

    const result = evaluateMajorityGuess(question, answers);

    expect(result.correctAnswer).toEqual({ type: "options", value: ["A"] });
    expect(result.playerResults.map((entry) => entry.pointsEarned)).toEqual([2, 2, 0]);
  });

  it("awards points for all tied top options", () => {
    const answers: SubmittedAnswer[] = [
      { playerId: "p1", questionId: question.id, answer: { type: "option", value: "A" }, submittedAtMs: 1 },
      { playerId: "p2", questionId: question.id, answer: { type: "option", value: "B" }, submittedAtMs: 2 },
    ];

    const result = evaluateMajorityGuess(question, answers);

    expect(result.correctAnswer).toEqual({ type: "options", value: ["A", "B"] });
    expect(result.playerResults.every((entry) => entry.isCorrect)).toBe(true);
  });

  it("has no winning option when nobody answered", () => {
    const result = evaluateMajorityGuess(question, []);

    expect(result.correctAnswer).toEqual({ type: "options", value: [] });
    expect(result.playerResults).toEqual([]);
  });
});

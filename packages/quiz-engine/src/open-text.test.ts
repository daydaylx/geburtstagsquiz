import { describe, expect, it } from "vitest";
import { QuestionType, type OpenTextQuestion, type SubmittedAnswer } from "@quiz/shared-types";

import { evaluateOpenText, normalizeTextAnswer } from "./open-text.js";

const question: OpenTextQuestion = {
  id: "q-text",
  type: QuestionType.OpenText,
  text: "Freitext?",
  correctText: "Karl Klammer",
  aliases: ["Clippy"],
  durationMs: 15_000,
  points: 3,
};

describe("normalizeTextAnswer", () => {
  it("normalizes whitespace and casing", () => {
    expect(normalizeTextAnswer("  KARL   Klammer ")).toBe("karl klammer");
  });
});

describe("evaluateOpenText", () => {
  it("accepts canonical answers and aliases", () => {
    const answers: SubmittedAnswer[] = [
      {
        playerId: "p1",
        questionId: question.id,
        answer: { type: "text", value: "karl klammer" },
        submittedAtMs: 1,
      },
      {
        playerId: "p2",
        questionId: question.id,
        answer: { type: "text", value: "clippy" },
        submittedAtMs: 2,
      },
      {
        playerId: "p3",
        questionId: question.id,
        answer: { type: "text", value: "Büroklammer" },
        submittedAtMs: 3,
      },
    ];

    const result = evaluateOpenText(question, answers);

    expect(result.correctAnswer).toEqual({ type: "text", value: "Karl Klammer" });
    expect(result.playerResults.map((entry) => entry.pointsEarned)).toEqual([3, 3, 0]);
  });
});

import { describe, it, expect } from "vitest";
import { evaluateEstimate } from "./estimate.js";
import { QuestionType } from "@quiz/shared-types";

describe("evaluateEstimate", () => {
  const question = {
    id: "q-est-test",
    type: QuestionType.Estimate,
    text: "Test question",
    correctValue: 100,
    unit: "units",
    context: "test context",
    durationMs: 10000,
    points: 10,
  } as const;

  it("should award points to the closest answer", () => {
    const answers = [
      { playerId: "p1", questionId: "q-est-test", answer: { type: "number", value: 90 }, submittedAtMs: 100 },
      { playerId: "p2", questionId: "q-est-test", answer: { type: "number", value: 105 }, submittedAtMs: 200 },
      { playerId: "p3", questionId: "q-est-test", answer: { type: "number", value: 120 }, submittedAtMs: 300 },
    ] as any[];

    const result = evaluateEstimate(question, answers);

    expect(result.playerResults.find(r => r.playerId === "p2")?.isCorrect).toBe(true);
    expect(result.playerResults.find(r => r.playerId === "p2")?.pointsEarned).toBe(10);
    expect(result.playerResults.find(r => r.playerId === "p1")?.isCorrect).toBe(false);
    expect(result.playerResults.find(r => r.playerId === "p3")?.isCorrect).toBe(false);
  });

  it("should award points to multiple players if they have the same distance", () => {
    const answers = [
      { playerId: "p1", questionId: "q-est-test", answer: { type: "number", value: 95 }, submittedAtMs: 100 },
      { playerId: "p2", questionId: "q-est-test", answer: { type: "number", value: 105 }, submittedAtMs: 200 },
    ] as any[];

    const result = evaluateEstimate(question, answers);

    expect(result.playerResults.find(r => r.playerId === "p1")?.isCorrect).toBe(true);
    expect(result.playerResults.find(r => r.playerId === "p2")?.isCorrect).toBe(true);
  });

  it("should handle non-numeric answers gracefully", () => {
    const answers = [
      { playerId: "p1", questionId: "q-est-test", answer: { type: "option", value: "A" }, submittedAtMs: 100 },
      { playerId: "p2", questionId: "q-est-test", answer: { type: "number", value: 100 }, submittedAtMs: 200 },
    ] as any[];

    const result = evaluateEstimate(question, answers);

    expect(result.playerResults.find(r => r.playerId === "p1")?.isCorrect).toBe(false);
    expect(result.playerResults.find(r => r.playerId === "p1")?.pointsEarned).toBe(0);
    expect(result.playerResults.find(r => r.playerId === "p2")?.isCorrect).toBe(true);
  });
});

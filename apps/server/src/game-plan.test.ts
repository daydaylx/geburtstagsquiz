import { describe, expect, it } from "vitest";
import { QuestionType, type GamePlan, type Question } from "@quiz/shared-types";

import {
  buildCatalogSummary,
  GamePlanValidationError,
  resolveGamePlan,
  selectQuestionsForGamePlan,
} from "./game-plan.js";

function makeMCQuestion(id: string, categoryId = "cat-a"): Question {
  return {
    id,
    type: QuestionType.MultipleChoice,
    text: id,
    options: [
      { id: "A", label: "A" },
      { id: "B", label: "B" },
    ],
    correctOptionId: "A",
    durationMs: 10_000,
    points: 1,
    categoryId,
    categoryName: `Kategorie ${categoryId}`,
    categorySlug: categoryId,
  };
}

function makeTestQuiz(questions: Question[]) {
  const catIds = [...new Set(questions.map((q) => q.categoryId).filter(Boolean))];
  return {
    id: "test",
    title: "Test",
    categories: catIds.map((id) => ({
      id: id!,
      slug: id!,
      name: id!,
      tags: [],
      questionCount: questions.filter((q) => q.categoryId === id).length,
    })),
    questions,
  };
}

function makeCustomPlan(overrides: Partial<GamePlan> = {}): GamePlan {
  return {
    mode: "custom",
    questionCount: 5,
    categoryIds: ["cat-a"],
    questionTypes: [QuestionType.MultipleChoice],
    timerMs: 30_000,
    revealDurationMs: 5_000,
    revealMode: "auto",
    showAnswerTextOnPlayerDevices: false,
    enableDemoQuestion: false,
    displayShowLevel: "minimal",
    rankingScoringMode: "partial_with_bonus",
    ...overrides,
  };
}

function makeRng(initialSeed: number) {
  let seed = initialSeed;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}

describe("resolveGamePlan", () => {
  it("throws on invalid timer value", () => {
    const questions = Array.from({ length: 10 }, (_, i) => makeMCQuestion(`q${i}`));
    const quiz = makeTestQuiz(questions);
    const catalog = buildCatalogSummary(quiz);
    const plan = makeCustomPlan({ timerMs: 99_999 });

    expect(() => resolveGamePlan(plan, catalog, quiz)).toThrow(GamePlanValidationError);
  });

  it("throws on unknown category", () => {
    const questions = Array.from({ length: 10 }, (_, i) => makeMCQuestion(`q${i}`));
    const quiz = makeTestQuiz(questions);
    const catalog = buildCatalogSummary(quiz);
    const plan = makeCustomPlan({ categoryIds: ["nonexistent"] });

    expect(() => resolveGamePlan(plan, catalog, quiz)).toThrow(GamePlanValidationError);
  });

  it("throws when not enough questions available", () => {
    const questions = Array.from({ length: 3 }, (_, i) => makeMCQuestion(`q${i}`));
    const quiz = makeTestQuiz(questions);
    const catalog = buildCatalogSummary(quiz);
    const plan = makeCustomPlan({ questionCount: 5 });

    expect(() => resolveGamePlan(plan, catalog, quiz)).toThrow(GamePlanValidationError);
  });

  it("sets revealDurationMs to 0 for manual reveal mode", () => {
    const questions = Array.from({ length: 10 }, (_, i) => makeMCQuestion(`q${i}`));
    const quiz = makeTestQuiz(questions);
    const catalog = buildCatalogSummary(quiz);
    const plan = makeCustomPlan({ revealMode: "manual", revealDurationMs: 15_000 });

    const resolved = resolveGamePlan(plan, catalog, quiz);

    expect(resolved.revealDurationMs).toBe(0);
  });

  it("returns label for preset mode", () => {
    const questions = Array.from({ length: 20 }, (_, i) => makeMCQuestion(`q${i}`));
    const quiz = makeTestQuiz(questions);
    const catalog = buildCatalogSummary(quiz);
    const plan = makeCustomPlan({
      mode: "preset",
      presetId: "quick_dirty",
      questionCount: 10,
      timerMs: 90_000,
    });

    const resolved = resolveGamePlan(plan, catalog, quiz);

    expect(resolved.label).toBe("Kurz & dreckig");
  });
});

describe("selectQuestionsForGamePlan", () => {
  it("returns exactly questionCount questions", () => {
    const questions = Array.from({ length: 15 }, (_, i) => makeMCQuestion(`q${i}`));
    const quiz = makeTestQuiz(questions);
    const catalog = buildCatalogSummary(quiz);
    const resolved = resolveGamePlan(makeCustomPlan({ questionCount: 5 }), catalog, quiz);

    const selected = selectQuestionsForGamePlan(quiz.questions, resolved);

    expect(selected).toHaveLength(5);
  });

  it("only selects questions from the requested category", () => {
    const catA = Array.from({ length: 8 }, (_, i) => makeMCQuestion(`a${i}`, "cat-a"));
    const catB = Array.from({ length: 7 }, (_, i) => makeMCQuestion(`b${i}`, "cat-b"));
    const quiz = makeTestQuiz([...catA, ...catB]);
    const catalog = buildCatalogSummary(quiz);
    const resolved = resolveGamePlan(
      makeCustomPlan({ questionCount: 5, categoryIds: ["cat-a"] }),
      catalog,
      quiz,
    );

    const selected = selectQuestionsForGamePlan(quiz.questions, resolved);

    expect(selected.every((q) => q.categoryId === "cat-a")).toBe(true);
  });

  it("excludes demo questions from selection", () => {
    const demo: Question = { ...makeMCQuestion("demo"), isDemoQuestion: true };
    const normals = Array.from({ length: 8 }, (_, i) => makeMCQuestion(`q${i}`));
    const quiz = makeTestQuiz([demo, ...normals]);
    const catalog = buildCatalogSummary(quiz);
    const resolved = resolveGamePlan(makeCustomPlan({ questionCount: 5 }), catalog, quiz);

    const selected = selectQuestionsForGamePlan(quiz.questions, resolved);

    expect(selected.every((q) => !q.isDemoQuestion)).toBe(true);
  });

  it("sets durationMs from plan timerMs", () => {
    const questions = Array.from({ length: 10 }, (_, i) => makeMCQuestion(`q${i}`));
    const quiz = makeTestQuiz(questions);
    const catalog = buildCatalogSummary(quiz);
    const resolved = resolveGamePlan(
      makeCustomPlan({ questionCount: 5, timerMs: 45_000 }),
      catalog,
      quiz,
    );

    const selected = selectQuestionsForGamePlan(quiz.questions, resolved);

    expect(selected.every((q) => q.durationMs === 45_000)).toBe(true);
  });

  it("is deterministic with the same random seed", () => {
    const questions = Array.from({ length: 20 }, (_, i) => makeMCQuestion(`q${i}`));
    const quiz = makeTestQuiz(questions);
    const catalog = buildCatalogSummary(quiz);
    const resolved = resolveGamePlan(makeCustomPlan({ questionCount: 10 }), catalog, quiz);

    const selected1 = selectQuestionsForGamePlan(quiz.questions, resolved, makeRng(42));
    const selected2 = selectQuestionsForGamePlan(quiz.questions, resolved, makeRng(42));

    expect(selected1.map((q) => q.id)).toEqual(selected2.map((q) => q.id));
  });
});

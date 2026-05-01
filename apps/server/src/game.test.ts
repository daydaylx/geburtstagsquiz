import { describe, expect, it } from "vitest";
import {
  PlayerState,
  QuestionType,
  type GamePlan,
  type Player,
  type Question,
  type Quiz,
} from "@quiz/shared-types";

import { getAnswerProgress } from "./game.js";
import {
  buildCatalogSummary,
  buildDefaultGamePlan,
  createDemoQuestion,
  GamePlanValidationError,
  resolveGamePlan,
  selectQuestionsForGamePlan,
} from "./game-plan.js";
import { QUESTION_DURATION_MS } from "./config.js";
import { getDefaultQuiz } from "./quiz-data.js";

function makePlayer(id: string, state: PlayerState): Player {
  return {
    id,
    name: id,
    sessionId: `session-${id}`,
    state,
    score: 0,
  };
}

function makeQuestion(id: string, type: QuestionType): Question {
  if (type === QuestionType.Estimate) {
    return {
      id,
      type,
      text: id,
      correctValue: 1,
      unit: "x",
      context: "test",
      durationMs: 10_000,
      points: 1,
    };
  }

  if (type === QuestionType.MajorityGuess) {
    return {
      id,
      type,
      text: id,
      options: [
        { id: "A", label: "A" },
        { id: "B", label: "B" },
      ],
      durationMs: 10_000,
      points: 1,
    };
  }

  if (type === QuestionType.Ranking) {
    return {
      id,
      type,
      text: id,
      items: [
        { id: "A", label: "A" },
        { id: "B", label: "B" },
      ],
      correctOrder: ["A", "B"],
      durationMs: 10_000,
      points: 1,
    };
  }

  if (type === QuestionType.OpenText) {
    return {
      id,
      type,
      text: id,
      correctText: "Antwort",
      aliases: ["Alias"],
      durationMs: 10_000,
      points: 1,
    };
  }

  return {
    id,
    type,
    text: id,
    options: [
      { id: "A", label: "A" },
      { id: "B", label: "B" },
    ],
    correctOptionId: "A",
    durationMs: 10_000,
    points: 1,
  };
}

function withCategory(question: Question, categoryId: string): Question {
  return {
    ...question,
    categoryId,
    categoryName: categoryId === "cat-a" ? "Kategorie A" : "Kategorie B",
    categorySlug: categoryId,
  };
}

function makeTestQuiz(questions: Question[]): Quiz {
  return {
    id: "test-quiz",
    title: "Test Quiz",
    categories: [
      {
        id: "cat-a",
        slug: "cat-a",
        name: "Kategorie A",
        tags: [],
        questionCount: questions.filter((question) => question.categoryId === "cat-a").length,
      },
      {
        id: "cat-b",
        slug: "cat-b",
        name: "Kategorie B",
        tags: [],
        questionCount: questions.filter((question) => question.categoryId === "cat-b").length,
      },
    ],
    questions,
  };
}

function makeCustomPlan(overrides: Partial<GamePlan> = {}): GamePlan {
  return {
    mode: "custom",
    questionCount: 5,
    categoryIds: ["cat-a", "cat-b"],
    questionTypes: [
      QuestionType.MultipleChoice,
      QuestionType.Estimate,
      QuestionType.MajorityGuess,
      QuestionType.Ranking,
    ],
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

describe("getAnswerProgress", () => {
  it("counts answers only from currently connected players", () => {
    const currentAnswers = new Map([
      [
        "p1",
        {
          playerId: "p1",
          questionId: "q1",
          answer: { type: "option" as const, value: "A" },
          submittedAtMs: 1,
        },
      ],
      [
        "p2",
        {
          playerId: "p2",
          questionId: "q1",
          answer: { type: "option" as const, value: "A" },
          submittedAtMs: 1,
        },
      ],
    ]);

    expect(
      getAnswerProgress({
        players: [
          makePlayer("p1", PlayerState.Answered),
          makePlayer("p2", PlayerState.Disconnected),
          makePlayer("p3", PlayerState.Answering),
        ],
        currentAnswers,
      }),
    ).toEqual({
      answeredCount: 1,
      totalEligiblePlayers: 2,
    });
  });

  it("returns zeros when no players are eligible", () => {
    expect(
      getAnswerProgress({
        players: [makePlayer("p1", PlayerState.Disconnected)],
        currentAnswers: new Map(),
      }),
    ).toEqual({
      answeredCount: 0,
      totalEligiblePlayers: 0,
    });
  });

  it("returns zeros when there are no players", () => {
    expect(
      getAnswerProgress({
        players: [],
        currentAnswers: new Map(),
      }),
    ).toEqual({
      answeredCount: 0,
      totalEligiblePlayers: 0,
    });
  });
});
describe("getDefaultQuiz", () => {
  it("loads the JSON question bank", () => {
    const quiz = getDefaultQuiz();

    expect(quiz.id).toBe("geburtstagsquiz-millennials-v2-engine-v2");
    expect(quiz.questions).toHaveLength(502);
    expect(new Set(quiz.questions.map((q) => q.id)).size).toBe(502);
    expect(quiz.questions.every((q) => q.durationMs === QUESTION_DURATION_MS)).toBe(true);
  });
});

describe("game plan selection", () => {
  it("builds a catalog summary from real source categories", () => {
    const quiz = getDefaultQuiz();
    const catalog = buildCatalogSummary(quiz);

    expect(catalog.totalQuestions).toBe(502);
    expect(catalog.maxQuestionCount).toBe(502);
    expect(catalog.categories.length).toBeGreaterThan(0);
    expect(catalog.categories.some((category) => category.id === "cat-01")).toBe(true);
    expect(catalog.questionTypes.some((entry) => entry.type === QuestionType.MultipleChoice)).toBe(
      true,
    );
  });

  it("uses 90 seconds as the default question timer", () => {
    const quiz = getDefaultQuiz();
    const catalog = buildCatalogSummary(quiz);
    const defaultPlan = buildDefaultGamePlan(catalog);

    expect(defaultPlan.timerMs).toBe(90_000);

    const resolvedPlan = resolveGamePlan(defaultPlan, catalog, quiz);
    const demoQuestion = createDemoQuestion(resolvedPlan);

    expect(resolvedPlan.timerMs).toBe(90_000);
    expect(demoQuestion.durationMs).toBe(90_000);
  });

  it("rejects game plans when the filtered pool is too small", () => {
    const questions = [
      withCategory(makeQuestion("rank-1", QuestionType.Ranking), "cat-a"),
      withCategory(makeQuestion("rank-2", QuestionType.Ranking), "cat-a"),
      withCategory(makeQuestion("mc-1", QuestionType.MultipleChoice), "cat-b"),
      withCategory(makeQuestion("mc-2", QuestionType.MultipleChoice), "cat-b"),
      withCategory(makeQuestion("mc-3", QuestionType.MultipleChoice), "cat-b"),
    ];
    const quiz = makeTestQuiz(questions);
    const catalog = buildCatalogSummary(quiz);
    const plan = makeCustomPlan({
      questionCount: 5,
      categoryIds: ["cat-a"],
      questionTypes: [QuestionType.Ranking],
    });

    expect(() => resolveGamePlan(plan, catalog, quiz)).toThrow(GamePlanValidationError);
    expect(() => resolveGamePlan(plan, catalog, quiz)).toThrow(
      "Nicht genug Fragen für diese Auswahl. Verfügbar: 2. Benötigt: 5.",
    );
  });

  it("filters by category and question type and applies the configured timer", () => {
    const questions = [
      withCategory(makeQuestion("a-mc-1", QuestionType.MultipleChoice), "cat-a"),
      withCategory(makeQuestion("a-mc-2", QuestionType.MultipleChoice), "cat-a"),
      withCategory(makeQuestion("a-mc-3", QuestionType.MultipleChoice), "cat-a"),
      withCategory(makeQuestion("a-est-1", QuestionType.Estimate), "cat-a"),
      withCategory(makeQuestion("a-est-2", QuestionType.Estimate), "cat-a"),
      withCategory(makeQuestion("a-rank-1", QuestionType.Ranking), "cat-a"),
      withCategory(makeQuestion("b-mc-1", QuestionType.MultipleChoice), "cat-b"),
      withCategory(makeQuestion("b-est-1", QuestionType.Estimate), "cat-b"),
    ];
    const quiz = makeTestQuiz(questions);
    const catalog = buildCatalogSummary(quiz);
    const resolvedPlan = resolveGamePlan(
      makeCustomPlan({
        questionCount: 5,
        categoryIds: ["cat-a"],
        questionTypes: [QuestionType.MultipleChoice, QuestionType.Estimate],
        timerMs: 45_000,
      }),
      catalog,
      quiz,
    );

    const selected = selectQuestionsForGamePlan(questions, resolvedPlan, () => 0.3);
    const selectedIds = selected.map((question) => question.id);

    expect(selected).toHaveLength(5);
    expect(new Set(selectedIds).size).toBe(selectedIds.length);
    expect(selected.every((question) => question.categoryId === "cat-a")).toBe(true);
    expect(
      selected.every((question) =>
        [QuestionType.MultipleChoice, QuestionType.Estimate].includes(question.type),
      ),
    ).toBe(true);
    expect(selected.every((question) => question.durationMs === 45_000)).toBe(true);
  });
});

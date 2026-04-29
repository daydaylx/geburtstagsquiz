import { describe, expect, it } from "vitest";
import {
  PlayerState,
  QuestionType,
  type GamePlan,
  type Player,
  type Question,
  type Quiz,
} from "@quiz/shared-types";

import { getAnswerProgress, getEveningQuestions } from "./game.js";
import {
  buildCatalogSummary,
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

describe("getEveningQuestions", () => {
  it("handles empty question list", () => {
    expect(getEveningQuestions([])).toEqual([]);
  });

  it("selects an evening mix based on target distribution and sets QUESTION_DURATION_MS", () => {
    const questions = [
      ...Array.from({ length: 16 }, (_, i) => makeQuestion(`mc-${i}`, QuestionType.MultipleChoice)),
      ...Array.from({ length: 14 }, (_, i) => makeQuestion(`estimate-${i}`, QuestionType.Estimate)),
      ...Array.from({ length: 5 }, (_, i) => makeQuestion(`ranking-${i}`, QuestionType.Ranking)),
    ];

    const selected = getEveningQuestions(questions);

    expect(selected).toHaveLength(30);
    expect(selected.every((q) => q.durationMs === QUESTION_DURATION_MS)).toBe(true);
    expect(questions.every((q) => q.durationMs === 10_000)).toBe(true);

    // Initial targets: MC 12, Est 5, Rank 3 (Total 20)
    // Remaining 10 slots filled by largest surplus:
    // Est surplus was 9, MC was 4, Rank was 2.
    // 1. Est (9->8), counts: MC 12, Est 6, Rank 3
    // 2. Est (8->7), counts: MC 12, Est 7, Rank 3
    // 3. Est (7->6), counts: MC 12, Est 8, Rank 3
    // 4. Est (6->5), counts: MC 12, Est 9, Rank 3
    // 5. Est (5->4), counts: MC 12, Est 10, Rank 3
    // 6. MC (4->3), counts: MC 13, Est 10, Rank 3
    // 7. Est (4->3), counts: MC 13, Est 11, Rank 3
    // 8. MC (3->2), counts: MC 14, Est 11, Rank 3
    // 9. Est (3->2), counts: MC 14, Est 12, Rank 3
    // 10. MC wins the final tie by type order, counts: MC 15, Est 12, Rank 3
    expect(selected.filter((q) => q.type === QuestionType.MultipleChoice)).toHaveLength(15);
    expect(selected.filter((q) => q.type === QuestionType.Estimate)).toHaveLength(12);
    expect(selected.filter((q) => q.type === QuestionType.Ranking)).toHaveLength(3);
  });

  it("does not produce duplicate question IDs", () => {
    const questions = [
      ...Array.from({ length: 10 }, (_, i) => makeQuestion(`mc-${i}`, QuestionType.MultipleChoice)),
      ...Array.from({ length: 10 }, (_, i) => makeQuestion(`logic-${i}`, QuestionType.Logic)),
      ...Array.from({ length: 10 }, (_, i) => makeQuestion(`estimate-${i}`, QuestionType.Estimate)),
      ...Array.from({ length: 10 }, (_, i) =>
        makeQuestion(`majority-${i}`, QuestionType.MajorityGuess),
      ),
      ...Array.from({ length: 10 }, (_, i) => makeQuestion(`ranking-${i}`, QuestionType.Ranking)),
    ];

    const selected = getEveningQuestions(questions);
    const ids = selected.map((q) => q.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("does not mutate the original question array", () => {
    const questions = Array.from({ length: 8 }, (_, i) =>
      makeQuestion(`mc-${i}`, QuestionType.MultipleChoice),
    );
    const originalOrder = questions.map((q) => q.id);

    getEveningQuestions(questions);

    expect(questions.map((q) => q.id)).toEqual(originalOrder);
    expect(questions.every((q) => q.durationMs === 10_000)).toBe(true);
  });

  it("uses all available questions when fewer exist than requested", () => {
    const questions = [
      ...Array.from({ length: 2 }, (_, i) => makeQuestion(`mc-${i}`, QuestionType.MultipleChoice)),
      ...Array.from({ length: 1 }, (_, i) => makeQuestion(`estimate-${i}`, QuestionType.Estimate)),
      ...Array.from({ length: 1 }, (_, i) => makeQuestion(`ranking-${i}`, QuestionType.Ranking)),
    ];

    const selected = getEveningQuestions(questions);

    expect(selected.filter((q) => q.type === QuestionType.MultipleChoice)).toHaveLength(2);
    expect(selected.filter((q) => q.type === QuestionType.Estimate)).toHaveLength(1);
    expect(selected.filter((q) => q.type === QuestionType.Ranking)).toHaveLength(1);
  });

  it("produces a deterministic result with a fixed random function", () => {
    const questions = Array.from({ length: 10 }, (_, i) =>
      makeQuestion(`mc-${i}`, QuestionType.MultipleChoice),
    );
    let seed = 42;
    const seededRandom = () => {
      seed = (seed * 1664525 + 1013904223) & 0xffffffff;
      return (seed >>> 0) / 0xffffffff;
    };

    const run1 = getEveningQuestions(questions, seededRandom);
    seed = 42;
    const run2 = getEveningQuestions(questions, seededRandom);

    expect(run1.map((q) => q.id)).toEqual(run2.map((q) => q.id));
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

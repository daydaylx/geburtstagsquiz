import {
  QuestionType,
  type CatalogCategorySummary,
  type CatalogQuestionTypeSummary,
  type GamePlan,
  type GamePlanPresetId,
  type Question,
  type Quiz,
  type QuizCatalogSummary,
  type ResolvedGamePlan,
} from "@quiz/shared-types";

export const ALLOWED_QUESTION_COUNTS = [10, 15, 20, 25, 30] as const;
export const ALLOWED_TIMER_MS = [20_000, 30_000, 45_000, 60_000, 90_000] as const;
export const ALLOWED_REVEAL_DURATION_MS = [3_000, 5_000, 8_000, 15_000, 30_000] as const;
export const MANUAL_REVEAL_FALLBACK_MS = 30_000;

const PRESET_LABELS: Record<GamePlanPresetId, string> = {
  quick_dirty: "Kurz & dreckig",
  normal_evening: "Normaler Abendmodus",
  full_evening: "Voller Quizabend",
  chaos_party: "Chaos-/Party-Modus",
};

const TYPE_WEIGHTS: Record<GamePlanPresetId, Partial<Record<QuestionType, number>>> = {
  quick_dirty: {
    [QuestionType.MultipleChoice]: 5,
    [QuestionType.MajorityGuess]: 3,
    [QuestionType.Estimate]: 2,
    [QuestionType.Logic]: 1,
  },
  normal_evening: {
    [QuestionType.MultipleChoice]: 4,
    [QuestionType.MajorityGuess]: 2,
    [QuestionType.Estimate]: 2,
    [QuestionType.Logic]: 2,
    [QuestionType.Ranking]: 0.8,
  },
  full_evening: {
    [QuestionType.MultipleChoice]: 4,
    [QuestionType.MajorityGuess]: 2,
    [QuestionType.Estimate]: 2,
    [QuestionType.Logic]: 2,
    [QuestionType.Ranking]: 1,
    [QuestionType.OpenText]: 0.6,
  },
  chaos_party: {
    [QuestionType.MultipleChoice]: 5,
    [QuestionType.MajorityGuess]: 4,
    [QuestionType.Estimate]: 2,
  },
};

const TYPE_CAPS: Partial<Record<GamePlanPresetId, Partial<Record<QuestionType, number>>>> = {
  normal_evening: {
    [QuestionType.Ranking]: 2,
    [QuestionType.OpenText]: 0,
  },
  full_evening: {
    [QuestionType.Ranking]: 3,
    [QuestionType.OpenText]: 2,
  },
};

export class GamePlanValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GamePlanValidationError";
  }
}

function uniq<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function shuffleArray<T>(array: T[], random: () => number = Math.random): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function summarizeQuestionTypes(questions: Question[]): CatalogQuestionTypeSummary[] {
  const counts = new Map<QuestionType, number>();

  for (const question of questions) {
    counts.set(question.type, (counts.get(question.type) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => a.type.localeCompare(b.type));
}

export function buildCatalogSummary(quiz: Quiz): QuizCatalogSummary {
  const categories: CatalogCategorySummary[] = quiz.categories
    .map((category) => {
      const categoryQuestions = quiz.questions.filter((question) => question.categoryId === category.id);

      return {
        ...category,
        questionCount: categoryQuestions.length,
        questionTypes: summarizeQuestionTypes(categoryQuestions),
      };
    })
    .filter((category) => category.questionCount > 0)
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    totalQuestions: quiz.questions.length,
    maxQuestionCount: quiz.questions.length,
    categories,
    questionTypes: summarizeQuestionTypes(quiz.questions),
  };
}

export function buildDefaultGamePlan(catalog: QuizCatalogSummary): GamePlan {
  const categoryIds = catalog.categories.map((category) => category.id);

  return {
    mode: "preset",
    presetId: "normal_evening",
    questionCount: 20,
    categoryIds,
    questionTypes: [
      QuestionType.MultipleChoice,
      QuestionType.MajorityGuess,
      QuestionType.Estimate,
      QuestionType.Logic,
      QuestionType.Ranking,
    ],
    timerMs: 90_000,
    revealDurationMs: 15_000,
    revealMode: "manual_with_fallback",
    showAnswerTextOnPlayerDevices: true,
    enableDemoQuestion: true,
    displayShowLevel: "normal",
    rankingScoringMode: "partial_with_bonus",
  };
}

function filterQuestionsForPlan(questions: Question[], plan: GamePlan): Question[] {
  const categoryIds = new Set(plan.categoryIds);
  const questionTypes = new Set(plan.questionTypes);

  return questions.filter(
    (question) =>
      !question.isDemoQuestion &&
      question.categoryId !== undefined &&
      categoryIds.has(question.categoryId) &&
      questionTypes.has(question.type),
  );
}

export function resolveGamePlan(plan: GamePlan, catalog: QuizCatalogSummary, quiz: Quiz): ResolvedGamePlan {
  if (plan.mode === "preset" && !plan.presetId) {
    throw new GamePlanValidationError("Preset-Spielplan braucht eine presetId.");
  }

  if (plan.mode === "custom" && plan.questionCount < 5) {
    throw new GamePlanValidationError("Freie Auswahl braucht mindestens 5 Fragen.");
  }

  if (!ALLOWED_TIMER_MS.includes(plan.timerMs as (typeof ALLOWED_TIMER_MS)[number])) {
    throw new GamePlanValidationError("Ungültige Timerdauer.");
  }

  if (
    !ALLOWED_REVEAL_DURATION_MS.includes(
      plan.revealDurationMs as (typeof ALLOWED_REVEAL_DURATION_MS)[number],
    )
  ) {
    throw new GamePlanValidationError("Ungültige Reveal-Dauer.");
  }

  const knownCategoryIds = new Set(catalog.categories.map((category) => category.id));
  const unknownCategory = plan.categoryIds.find((categoryId) => !knownCategoryIds.has(categoryId));
  if (unknownCategory) {
    throw new GamePlanValidationError(`Unbekannte Kategorie: ${unknownCategory}`);
  }

  const categoryIds = uniq(plan.categoryIds);
  const questionTypes = uniq(plan.questionTypes);
  if (categoryIds.length === 0) {
    throw new GamePlanValidationError("Bitte mindestens eine Kategorie aktivieren.");
  }
  if (questionTypes.length === 0) {
    throw new GamePlanValidationError("Bitte mindestens einen Fragetyp aktivieren.");
  }

  const normalizedPlan: GamePlan = {
    ...plan,
    categoryIds,
    questionTypes,
    revealDurationMs:
      plan.revealMode === "manual_with_fallback" ? MANUAL_REVEAL_FALLBACK_MS : plan.revealDurationMs,
  };

  const available = filterQuestionsForPlan(quiz.questions, normalizedPlan).length;
  if (available < normalizedPlan.questionCount) {
    throw new GamePlanValidationError(
      `Nicht genug Fragen für diese Auswahl. Verfügbar: ${available}. Benötigt: ${normalizedPlan.questionCount}. Bitte mehr Kategorien oder Fragetypen aktivieren.`,
    );
  }

  return {
    ...normalizedPlan,
    label:
      normalizedPlan.mode === "preset" && normalizedPlan.presetId
        ? PRESET_LABELS[normalizedPlan.presetId]
        : "Freie Auswahl",
  };
}

function getSelectionWeight(plan: ResolvedGamePlan, type: QuestionType): number {
  if (plan.mode === "preset" && plan.presetId) {
    return TYPE_WEIGHTS[plan.presetId][type] ?? 0.1;
  }

  return 1;
}

function getTypeCap(plan: ResolvedGamePlan, type: QuestionType): number {
  if (plan.mode !== "preset" || !plan.presetId) {
    return Number.POSITIVE_INFINITY;
  }

  return TYPE_CAPS[plan.presetId]?.[type] ?? Number.POSITIVE_INFINITY;
}

export function selectQuestionsForGamePlan(
  questions: Question[],
  plan: ResolvedGamePlan,
  random: () => number = Math.random,
): Question[] {
  const filteredQuestions = filterQuestionsForPlan(questions, plan);

  if (filteredQuestions.length < plan.questionCount) {
    throw new GamePlanValidationError(
      `Nicht genug Fragen für diese Auswahl. Verfügbar: ${filteredQuestions.length}. Benötigt: ${plan.questionCount}. Bitte mehr Kategorien oder Fragetypen aktivieren.`,
    );
  }

  const poolsByType = new Map<QuestionType, Question[]>();
  for (const type of plan.questionTypes) {
    poolsByType.set(
      type,
      shuffleArray(
        filteredQuestions.filter((question) => question.type === type),
        random,
      ),
    );
  }

  const selected: Question[] = [];
  const countsByType = new Map<QuestionType, number>();

  while (selected.length < plan.questionCount) {
    const candidates = plan.questionTypes.filter((type) => {
      const pool = poolsByType.get(type) ?? [];
      return pool.length > 0 && (countsByType.get(type) ?? 0) < getTypeCap(plan, type);
    });
    const fallbackCandidates = plan.questionTypes.filter((type) => (poolsByType.get(type)?.length ?? 0) > 0);
    const usableCandidates = candidates.length > 0 ? candidates : fallbackCandidates;

    if (usableCandidates.length === 0) {
      break;
    }

    const nextType = usableCandidates
      .map((type) => ({
        type,
        ratio: (countsByType.get(type) ?? 0) / getSelectionWeight(plan, type),
      }))
      .sort((a, b) => a.ratio - b.ratio)[0].type;
    const pool = poolsByType.get(nextType);
    const nextQuestion = pool?.shift();
    if (!nextQuestion) {
      continue;
    }

    countsByType.set(nextType, (countsByType.get(nextType) ?? 0) + 1);
    selected.push({
      ...nextQuestion,
      durationMs: plan.timerMs,
    });
  }

  if (selected.length < plan.questionCount) {
    throw new GamePlanValidationError(
      `Nicht genug Fragen für diese Auswahl. Verfügbar: ${filteredQuestions.length}. Benötigt: ${plan.questionCount}. Bitte mehr Kategorien oder Fragetypen aktivieren.`,
    );
  }

  return shuffleArray(selected, random);
}

export function createDemoQuestion(plan: ResolvedGamePlan): Question {
  return {
    id: "__demo-question",
    type: QuestionType.MultipleChoice,
    text: "Testfrage: Welcher Button funktioniert?",
    options: [
      { id: "A", label: "A" },
      { id: "B", label: "B" },
      { id: "C", label: "C" },
      { id: "D", label: "Bier" },
    ],
    correctOptionId: "D",
    durationMs: plan.timerMs,
    points: 0,
    explanation: "Die Testfrage zählt nicht in die Punkte. Wichtig ist nur, dass alle Handys reagieren.",
    categoryId: "__demo",
    categoryName: "Demo",
    categorySlug: "demo",
    tags: ["demo"],
    isDemoQuestion: true,
  };
}

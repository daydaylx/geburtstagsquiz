import type { CatalogSummaryPayload } from "@quiz/shared-protocol";
import { QuestionType, type GamePlan, type GamePlanPresetId } from "@quiz/shared-types";

const DEFAULT_CUSTOM_TYPES = [
  QuestionType.MultipleChoice,
  QuestionType.MajorityGuess,
  QuestionType.Estimate,
  QuestionType.Logic,
  QuestionType.Ranking,
];

function getAvailableQuestionTypes(catalog: CatalogSummaryPayload): QuestionType[] {
  return catalog.questionTypes.map((entry) => entry.type);
}

function getDefaultCategoryIds(catalog: CatalogSummaryPayload, includeHard: boolean): string[] {
  return catalog.categories
    .filter((category) => includeHard || category.difficulty !== "hard")
    .map((category) => category.id);
}

export function buildPresetGamePlan(
  presetId: GamePlanPresetId,
  catalog: CatalogSummaryPayload,
  showAnswerTextOnPlayerDevices: boolean,
): GamePlan {
  const includeHard = presetId === "normal_evening" || presetId === "full_evening";
  const categoryIds = getDefaultCategoryIds(catalog, includeHard);
  const allTypes = getAvailableQuestionTypes(catalog);

  const byPreset: Record<GamePlanPresetId, Omit<GamePlan, "categoryIds">> = {
    quick_dirty: {
      mode: "preset",
      presetId,
      questionCount: 12,
      questionTypes: [
        QuestionType.MultipleChoice,
        QuestionType.MajorityGuess,
        QuestionType.Estimate,
        QuestionType.Logic,
      ].filter((type) => allTypes.includes(type)),
      timerMs: 90_000,
      revealDurationMs: 30_000,
      revealMode: "manual",
      showAnswerTextOnPlayerDevices: true,
      enableDemoQuestion: true,
      displayShowLevel: "normal",
      rankingScoringMode: "partial_with_bonus",
    },
    normal_evening: {
      mode: "preset",
      presetId,
      questionCount: 20,
      questionTypes: DEFAULT_CUSTOM_TYPES.filter((type) => allTypes.includes(type)),
      timerMs: 90_000,
      revealDurationMs: 30_000,
      revealMode: "manual",
      showAnswerTextOnPlayerDevices: true,
      enableDemoQuestion: true,
      displayShowLevel: "normal",
      rankingScoringMode: "partial_with_bonus",
    },
    full_evening: {
      mode: "preset",
      presetId,
      questionCount: 30,
      questionTypes: allTypes,
      timerMs: 90_000,
      revealDurationMs: 30_000,
      revealMode: "manual",
      showAnswerTextOnPlayerDevices: true,
      enableDemoQuestion: true,
      displayShowLevel: "normal",
      rankingScoringMode: "partial_with_bonus",
    },
    chaos_party: {
      mode: "preset",
      presetId,
      questionCount: 18,
      questionTypes: [
        QuestionType.MultipleChoice,
        QuestionType.MajorityGuess,
        QuestionType.Estimate,
      ].filter((type) => allTypes.includes(type)),
      timerMs: 90_000,
      revealDurationMs: 30_000,
      revealMode: "manual",
      showAnswerTextOnPlayerDevices: true,
      enableDemoQuestion: true,
      displayShowLevel: "normal",
      rankingScoringMode: "partial_with_bonus",
    },
  };

  return {
    ...byPreset[presetId],
    categoryIds,
  };
}

export function buildCustomGamePlan(
  catalog: CatalogSummaryPayload,
  showAnswerTextOnPlayerDevices: boolean,
): GamePlan {
  const allTypes = getAvailableQuestionTypes(catalog);

  return {
    mode: "custom",
    questionCount: 20,
    categoryIds: catalog.categories.map((category) => category.id),
    questionTypes: DEFAULT_CUSTOM_TYPES.filter((type) => allTypes.includes(type)),
    timerMs: 90_000,
    revealDurationMs: 30_000,
    revealMode: "manual_with_fallback",
    showAnswerTextOnPlayerDevices: true,
    enableDemoQuestion: true,
    displayShowLevel: "normal",
    rankingScoringMode: "partial_with_bonus",
  };
}

export function createHostClientInfo() {
  return { deviceType: "browser", appVersion: "0.0.1" };
}

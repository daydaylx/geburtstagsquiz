import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  type LogicQuestion,
  type MultipleChoiceQuestion,
  type Question,
  type QuestionMetadata,
  type QuestionOption,
  QuestionType,
  type Quiz,
  type QuizCategory,
} from "@quiz/shared-types";

import { QUESTION_DURATION_MS } from "./config.js";

const QUIZ_CATEGORIES_DIR = "data/quiz/questions";
const QUIZ_ID = "privatquiz-millennials-v2";
const QUIZ_TITLE = "Privatquiz für Millennials";

type RawCategory = {
  category_id?: string;
  id?: string;
  slug?: string;
  name?: string;
  difficulty?: string;
  tags?: string[];
  question_count?: number;
  questions: RawQuestion[];
};

type RawQuestion = {
  id: string;
  type: string;
  prompt: string;
  options?: RawOption[];
  items?: RawOption[];
  answer?: RawAnswer;
  correct_order?: string[];
  correct_option_id?: string;
  explanation?: string;
  difficulty?: string;
  points?: number;
};

type RawOption =
  | string
  | {
      id?: string;
      text?: string;
      label?: string;
      is_correct?: boolean;
    };

type RawAnswer = {
  reference_value?: number;
  unit?: string;
  context?: string;
  canonical?: string;
  aliases?: string[];
  canonical_order?: string[];
};

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

function findQuizCategoriesDir(): string {
  const searchRoots = [process.cwd(), moduleDir];
  const visited = new Set<string>();

  for (const startDir of searchRoots) {
    let currentDir = startDir;

    while (!visited.has(currentDir)) {
      visited.add(currentDir);

      const candidate = path.resolve(currentDir, QUIZ_CATEGORIES_DIR);
      if (existsSync(candidate)) {
        return candidate;
      }

      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        break;
      }

      currentDir = parentDir;
    }
  }

  throw new Error(`Quiz categories directory not found: ${QUIZ_CATEGORIES_DIR}`);
}

function loadCategoryFiles(dir: string): RawCategory[] {
  const files = readdirSync(dir)
    .filter((f) => f.startsWith("cat-") && f.endsWith(".json"))
    .sort();

  return files.map((file) => {
    const filePath = path.join(dir, file);
    return JSON.parse(readFileSync(filePath, "utf8")) as RawCategory;
  });
}

function requireText(value: string | undefined, fieldName: string, questionId: string): string {
  if (!value) {
    throw new Error(`Question ${questionId} is missing required field ${fieldName}`);
  }

  return value;
}

function requireRawOptions(question: RawQuestion): RawOption[] {
  if (!question.options || question.options.length === 0) {
    throw new Error(`Question ${question.id} is missing answer options`);
  }

  return question.options;
}

function toPoints(points: number | undefined): number {
  return Number.isFinite(points) ? (points as number) : 1;
}

function toOptionId(index: number): string {
  return index < 26 ? String.fromCharCode(65 + index) : `OPT-${index + 1}`;
}

function toQuestionOptions(options: RawOption[] | undefined, questionId: string): QuestionOption[] {
  if (!options || options.length === 0) {
    throw new Error(`Question ${questionId} is missing answer options`);
  }

  return options.map((option, index) => ({
    id: typeof option === "string" ? toOptionId(index) : (option.id ?? toOptionId(index)),
    label:
      typeof option === "string"
        ? option
        : requireText(option.text ?? option.label, `options[${index}].text`, questionId),
  }));
}

function getCorrectOptionId(question: RawQuestion, rawOptions: RawOption[], options: QuestionOption[]): string {
  if (question.correct_option_id) {
    if (!options.some((option) => option.id === question.correct_option_id)) {
      throw new Error(`Question ${question.id} references an unknown correct_option_id`);
    }

    return question.correct_option_id;
  }

  const correctIndex = rawOptions.findIndex((option) => typeof option !== "string" && option.is_correct === true);
  if (correctIndex < 0) {
    throw new Error(`Question ${question.id} is missing a correct option`);
  }

  return options[correctIndex].id;
}

function getExplanation(question: RawQuestion): string | undefined {
  return question.explanation ?? question.answer?.context;
}

function hasCorrectOption(question: RawQuestion): boolean {
  return (
    Array.isArray(question.options) &&
    question.options.length > 0 &&
    Boolean(
      question.correct_option_id || question.options.some((option) => typeof option !== "string" && option.is_correct),
    )
  );
}

function hasNumericAnswer(question: RawQuestion): boolean {
  return typeof question.answer?.reference_value === "number";
}

function hasRankingAnswer(question: RawQuestion): boolean {
  return (
    (Array.isArray(question.items) && Array.isArray(question.correct_order)) ||
    Array.isArray(question.answer?.canonical_order)
  );
}

function toQuestionMetadata(category: RawCategory, question: RawQuestion): QuestionMetadata {
  const categoryId =
    category.category_id ?? category.id ?? category.slug ?? `category-${question.id.split("-").slice(0, 2).join("-")}`;

  return {
    categoryId,
    categoryName: category.name ?? categoryId,
    categorySlug: category.slug ?? categoryId,
    ...(category.difficulty ? { categoryDifficulty: category.difficulty } : {}),
    ...(question.difficulty ? { difficulty: question.difficulty } : {}),
    tags: category.tags ?? [],
  };
}

function toQuizCategory(category: RawCategory): QuizCategory {
  const id = category.category_id ?? category.id ?? category.slug ?? "unknown-category";

  return {
    id,
    slug: category.slug ?? id,
    name: category.name ?? id,
    ...(category.difficulty ? { difficulty: category.difficulty } : {}),
    tags: category.tags ?? [],
    questionCount: category.questions.length,
  };
}

function toOptionQuestion(question: RawQuestion, metadata: QuestionMetadata): Question {
  const rawOptions = requireRawOptions(question);
  const options = toQuestionOptions(rawOptions, question.id);
  const correctOptionId = getCorrectOptionId(question, rawOptions, options);
  const baseQuestion = {
    ...metadata,
    id: question.id,
    text: question.prompt,
    options,
    correctOptionId,
    durationMs: QUESTION_DURATION_MS,
    points: toPoints(question.points),
    ...(getExplanation(question) ? { explanation: getExplanation(question) } : {}),
  };

  if (question.type === "logic") {
    return {
      ...baseQuestion,
      type: QuestionType.Logic,
    };
  }

  return {
    ...baseQuestion,
    type: QuestionType.MultipleChoice,
  };
}

function toEstimateQuestion(question: RawQuestion, metadata: QuestionMetadata): Question {
  const answer = question.answer;
  if (!answer || typeof answer.reference_value !== "number") {
    throw new Error(`Question ${question.id} is missing a numeric answer`);
  }

  return {
    ...metadata,
    id: question.id,
    type: QuestionType.Estimate,
    text: question.prompt,
    correctValue: answer.reference_value,
    unit: requireText(answer.unit, "answer.unit", question.id),
    context: answer.context || "Referenzwert",
    durationMs: QUESTION_DURATION_MS,
    points: toPoints(question.points),
    ...(getExplanation(question) ? { explanation: getExplanation(question) } : {}),
  };
}

function rotateOptions<T>(items: T[]): T[] {
  if (items.length <= 1) {
    return items;
  }

  const offset = Math.ceil(items.length / 2);
  return [...items.slice(offset), ...items.slice(0, offset)];
}

function toRankingQuestion(question: RawQuestion, metadata: QuestionMetadata): Question {
  if (question.items && question.correct_order) {
    const items = toQuestionOptions(question.items, question.id);
    const correctOrder = question.correct_order.map((entry) => {
      const matchingItem = items.find((item) => item.id === entry || item.label === entry);
      if (!matchingItem) {
        throw new Error(`Question ${question.id} references an unknown ranking item: ${entry}`);
      }

      return matchingItem.id;
    });

    return {
      ...metadata,
      id: question.id,
      type: QuestionType.Ranking,
      text: question.prompt,
      items,
      correctOrder,
      durationMs: QUESTION_DURATION_MS,
      points: toPoints(question.points),
      ...(getExplanation(question) ? { explanation: getExplanation(question) } : {}),
    };
  }

  const canonicalOrder = question.answer?.canonical_order;
  if (!canonicalOrder || canonicalOrder.length === 0) {
    throw new Error(`Question ${question.id} is missing a ranking answer`);
  }

  const orderedItems = canonicalOrder.map((label, index) => ({
    id: toOptionId(index),
    label,
  }));

  return {
    ...metadata,
    id: question.id,
    type: QuestionType.Ranking,
    text: question.prompt,
    items: rotateOptions(orderedItems),
    correctOrder: orderedItems.map((item) => item.id),
    durationMs: QUESTION_DURATION_MS,
    points: toPoints(question.points),
    ...(getExplanation(question) ? { explanation: getExplanation(question) } : {}),
  };
}

function toMajorityGuessQuestion(question: RawQuestion, metadata: QuestionMetadata): Question {
  return {
    ...metadata,
    id: question.id,
    type: QuestionType.MajorityGuess,
    text: question.prompt,
    options: toQuestionOptions(question.options, question.id),
    durationMs: QUESTION_DURATION_MS,
    points: toPoints(question.points),
    ...(getExplanation(question) ? { explanation: getExplanation(question) } : {}),
  };
}

function toOpenTextQuestion(question: RawQuestion, metadata: QuestionMetadata): Question {
  const correctText = requireText(question.answer?.canonical, "answer.canonical", question.id);

  return {
    ...metadata,
    id: question.id,
    type: QuestionType.OpenText,
    text: question.prompt,
    correctText,
    aliases: (question.answer?.aliases ?? []).filter((alias) => alias.trim().length > 0),
    durationMs: QUESTION_DURATION_MS,
    points: toPoints(question.points),
    ...(getExplanation(question) ? { explanation: getExplanation(question) } : {}),
  };
}

function transformQuestion(question: RawQuestion, category: RawCategory): Question {
  const metadata = toQuestionMetadata(category, question);

  switch (question.type) {
    case "multiple_choice":
    case "logic":
      if (hasCorrectOption(question)) {
        return toOptionQuestion(question, metadata);
      }
      break;

    case "majority_guess":
      if (question.options?.length) {
        return toMajorityGuessQuestion(question, metadata);
      }
      break;

    case "estimate":
    case "estimate_duel":
      if (hasNumericAnswer(question)) {
        return toEstimateQuestion(question, metadata);
      }
      break;

    case "ranking":
      if (hasRankingAnswer(question)) {
        return toRankingQuestion(question, metadata);
      }
      break;

    case "standard":
    case "common_mistake":
    case "pattern":
    case "fast_guess":
      if (hasCorrectOption(question)) {
        return toOptionQuestion(question, metadata);
      }
      if (hasNumericAnswer(question)) {
        return toEstimateQuestion(question, metadata);
      }
      if (hasRankingAnswer(question)) {
        return toRankingQuestion(question, metadata);
      }
      if (question.answer?.canonical) {
        return toOpenTextQuestion(question, metadata);
      }
      break;
  }

  throw new Error(`Unsupported question shape in quiz source: ${question.id} (${question.type})`);
}

type CorrectOptionQuestion = MultipleChoiceQuestion | LogicQuestion;

function isCorrectOptionQuestion(question: Question): question is CorrectOptionQuestion {
  return question.type === QuestionType.MultipleChoice || question.type === QuestionType.Logic;
}

function stableCategoryOffset(categoryId: string, optionCount: number): number {
  let hash = 2166136261;

  for (const char of categoryId) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return optionCount > 0 ? (hash >>> 0) % optionCount : 0;
}

function moveCorrectOptionToIndex<T extends CorrectOptionQuestion>(question: T, targetIndex: number): T {
  const currentIndex = question.options.findIndex((option) => option.id === question.correctOptionId);

  if (currentIndex < 0) {
    throw new Error(`Question ${question.id} references an unknown correctOptionId`);
  }

  const boundedTargetIndex = Math.max(0, Math.min(targetIndex, question.options.length - 1));
  if (currentIndex === boundedTargetIndex) {
    return question;
  }

  const correctOption = question.options[currentIndex];
  const remainingOptions = question.options.filter((option) => option.id !== question.correctOptionId);

  return {
    ...question,
    options: [
      ...remainingOptions.slice(0, boundedTargetIndex),
      correctOption,
      ...remainingOptions.slice(boundedTargetIndex),
    ],
  };
}

function balanceCorrectAnswerPositions(questions: Question[]): Question[] {
  const seenByCategory = new Map<string, number>();

  return questions.map((question) => {
    if (!isCorrectOptionQuestion(question)) {
      return question;
    }

    const categoryKey = question.categoryId ?? question.categorySlug ?? "__uncategorized";
    const sequenceIndex = seenByCategory.get(categoryKey) ?? 0;
    seenByCategory.set(categoryKey, sequenceIndex + 1);

    const targetIndex =
      (stableCategoryOffset(categoryKey, question.options.length) + sequenceIndex) % question.options.length;
    return moveCorrectOptionToIndex(question, targetIndex);
  });
}

function loadDefaultQuiz(): Quiz {
  const questionsById = new Map<string, Question>();
  const categoriesById = new Map<string, QuizCategory>();

  let totalLoaded = 0;
  let totalSkipped = 0;
  let totalDuplicates = 0;

  const categoriesDir = findQuizCategoriesDir();
  const rawCategories = loadCategoryFiles(categoriesDir);

  for (const category of rawCategories) {
    const quizCategory = toQuizCategory(category);
    categoriesById.set(quizCategory.id, quizCategory);

    let catLoaded = 0;
    let catSkipped = 0;
    let catDuplicates = 0;

    for (const question of category.questions) {
      if (questionsById.has(question.id)) {
        catDuplicates++;
        continue;
      }
      try {
        questionsById.set(question.id, transformQuestion(question, category));
        catLoaded++;
      } catch (err) {
        console.warn(
          `[quiz-data] Skipping unsupported question ${question.id} (${question.type}): ${err instanceof Error ? err.message : String(err)}`,
        );
        catSkipped++;
      }
    }

    console.log(
      `[quiz-data] ${quizCategory.id} (${quizCategory.name}): ${catLoaded} geladen` +
        (catSkipped > 0 ? `, ${catSkipped} übersprungen` : "") +
        (catDuplicates > 0 ? `, ${catDuplicates} Duplikate` : ""),
    );
    totalLoaded += catLoaded;
    totalSkipped += catSkipped;
    totalDuplicates += catDuplicates;
  }

  console.log(
    `[quiz-data] Gesamt: ${totalLoaded} Fragen aus ${questionsById.size} eindeutigen IDs` +
      (totalSkipped > 0 ? `, ${totalSkipped} übersprungen` : "") +
      (totalDuplicates > 0 ? `, ${totalDuplicates} Duplikate ignoriert` : ""),
  );

  return {
    id: QUIZ_ID,
    title: QUIZ_TITLE,
    categories: [...categoriesById.values()].filter((category) => category.questionCount > 0),
    questions: balanceCorrectAnswerPositions([...questionsById.values()]),
  };
}

function loadDefaultQuizOrThrow(): Quiz {
  try {
    return loadDefaultQuiz();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[quiz-data] Failed to load default quiz: ${message}`);
  }
}

const DEFAULT_QUIZ = loadDefaultQuizOrThrow();

export function getDefaultQuiz(): Quiz {
  return DEFAULT_QUIZ;
}

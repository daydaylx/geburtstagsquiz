import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  QuestionType,
  type Question,
  type QuestionMetadata,
  type QuestionOption,
  type Quiz,
  type QuizCategory,
} from "@quiz/shared-types";

import { QUESTION_DURATION_MS } from "./config.js";

type RawQuizFile = {
  quiz: {
    quiz_id: string;
    title: string;
    categories: RawCategory[];
  };
};

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

const QUIZ_SOURCE_FILES = [
  "geburtstagsquiz_millennials_engine_v4_release_candidate.json",
  "geburtstagsquiz_millennials_engine_v5_expanded.json",
] as const;
const moduleDir = path.dirname(fileURLToPath(import.meta.url));

function findQuizSourceFile(fileName: string): string {
  const searchRoots = [process.cwd(), moduleDir];
  const visited = new Set<string>();

  for (const startDir of searchRoots) {
    let currentDir = startDir;

    while (!visited.has(currentDir)) {
      visited.add(currentDir);

      const candidate = path.resolve(currentDir, fileName);
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

  throw new Error(`Quiz source file not found: ${fileName}`);
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

function getCorrectOptionId(
  question: RawQuestion,
  rawOptions: RawOption[],
  options: QuestionOption[],
): string {
  if (question.correct_option_id) {
    if (!options.some((option) => option.id === question.correct_option_id)) {
      throw new Error(`Question ${question.id} references an unknown correct_option_id`);
    }

    return question.correct_option_id;
  }

  const correctIndex = rawOptions.findIndex(
    (option) => typeof option !== "string" && option.is_correct === true,
  );
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
      question.correct_option_id ||
      question.options.some((option) => typeof option !== "string" && option.is_correct),
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
    category.category_id ??
    category.id ??
    category.slug ??
    `category-${question.id.split("-").slice(0, 2).join("-")}`;

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
    context: answer.context || answer.canonical || "Referenzwert",
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

  if (hasCorrectOption(question)) {
    return toOptionQuestion(question, metadata);
  }

  if (hasNumericAnswer(question)) {
    return toEstimateQuestion(question, metadata);
  }

  if (hasRankingAnswer(question)) {
    return toRankingQuestion(question, metadata);
  }

  if (question.type === "majority_guess" && question.options?.length) {
    return toMajorityGuessQuestion(question, metadata);
  }

  if (question.answer?.canonical) {
    return toOpenTextQuestion(question, metadata);
  }

  throw new Error(`Unsupported question shape in quiz source: ${question.id} (${question.type})`);
}

function loadDefaultQuiz(): Quiz {
  const questionsById = new Map<string, Question>();
  const categoriesById = new Map<string, QuizCategory>();
  let quizId = "geburtstagsquiz-millennials-combined";
  let quizTitle = "Geburtstagsquiz für Millennials";

  for (const sourceFile of QUIZ_SOURCE_FILES) {
    const sourcePath = findQuizSourceFile(sourceFile);
    const rawQuiz = JSON.parse(readFileSync(sourcePath, "utf8")) as RawQuizFile;

    quizId = rawQuiz.quiz.quiz_id;
    quizTitle = rawQuiz.quiz.title;

    for (const category of rawQuiz.quiz.categories) {
      const quizCategory = toQuizCategory(category);
      const existingCategory = categoriesById.get(quizCategory.id);
      categoriesById.set(quizCategory.id, {
        ...quizCategory,
        questionCount: (existingCategory?.questionCount ?? 0) + category.questions.length,
        tags: [...new Set([...(existingCategory?.tags ?? []), ...quizCategory.tags])],
      });

      for (const question of category.questions) {
        try {
          questionsById.set(question.id, transformQuestion(question, category));
        } catch {
          console.warn(
            `[quiz-data] Skipping unsupported question ${question.id} (${question.type})`,
          );
        }
      }
    }
  }

  return {
    id: quizId,
    title: quizTitle,
    categories: [...categoriesById.values()].filter((category) => category.questionCount > 0),
    questions: [...questionsById.values()],
  };
}

const DEFAULT_QUIZ = loadDefaultQuiz();

export function getDefaultQuiz(): Quiz {
  return DEFAULT_QUIZ;
}

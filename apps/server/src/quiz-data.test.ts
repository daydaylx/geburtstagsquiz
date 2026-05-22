import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { type Question, type QuestionOption, QuestionType } from "@quiz/shared-types";
import { describe, expect, it } from "vitest";

import { QUESTION_DURATION_MS } from "./config.js";
import { getDefaultQuiz } from "./quiz-data.js";

type RawOption =
  | string
  | {
      id?: string;
      label?: string;
      text?: string;
      is_correct?: boolean;
    };

type RawQuestion = {
  id?: string;
  type?: string;
  prompt?: string;
  options?: RawOption[];
  items?: RawOption[];
  correct_option_id?: string;
};

type RawCategoryFile = {
  category_id?: string;
  question_count?: number;
  questions: RawQuestion[];
};

const QUIZ_CATEGORIES_DIR = "data/quiz/questions";

function readCategoryFiles(): RawCategoryFile[] {
  const dir = path.resolve(process.cwd(), QUIZ_CATEGORIES_DIR);
  const files = readdirSync(dir)
    .filter((f) => f.startsWith("cat-") && f.endsWith(".json"))
    .sort();
  return files.map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")) as RawCategoryFile);
}

function getRawOptionId(option: RawOption, index: number): string {
  return typeof option === "string" ? String.fromCharCode(65 + index) : (option.id ?? `OPT-${index + 1}`);
}

function getRawCorrectOptionId(question: RawQuestion): string | null {
  if (!question.options?.length || question.type === "majority_guess") {
    return null;
  }

  if (question.correct_option_id) {
    return question.correct_option_id;
  }

  const correctIndex = question.options.findIndex((option) => typeof option !== "string" && option.is_correct === true);

  return correctIndex >= 0 ? getRawOptionId(question.options[correctIndex], correctIndex) : null;
}

function collectOptionIssues(question: Question, options: QuestionOption[], minCount: number): string[] {
  const issues: string[] = [];
  const optionIds = options.map((option) => option.id);

  if (options.length < minCount || options.length > 4) {
    issues.push(`${question.id}: expected ${minCount}-4 options, got ${options.length}`);
  }

  if (new Set(optionIds).size !== optionIds.length) {
    issues.push(`${question.id}: duplicate option ids`);
  }

  if (options.some((option) => option.label.trim().length === 0)) {
    issues.push(`${question.id}: empty option label`);
  }

  return issues;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function numericTextVariants(value: number): string[] {
  const normalized = String(value);
  return [...new Set([normalized, normalized.replace(".", ",")])];
}

function containsStandaloneNumber(text: string, value: number): boolean {
  return numericTextVariants(value).some((variant) => {
    const pattern = new RegExp(`(^|[^0-9])${escapeRegExp(variant)}($|[^0-9])`);
    return pattern.test(text);
  });
}

function hasVisibleRankingSortKey(question: Extract<Question, { type: QuestionType.Ranking }>): boolean {
  const prompt = question.text.toLowerCase();
  const labels = question.items.map((item) => item.label);

  if (/(release|erscheinungsjahr|launch|startdatum|chronologisch)/.test(prompt)) {
    return labels.some((label) => /\b(19|20)\d{2}\b/.test(label));
  }

  if (/kapazität/.test(prompt)) {
    return labels.some((label) => /\b\d+(?:[,.]\d+)?\s?(?:kb|mb|gb|tb)\b/i.test(label));
  }

  return false;
}

describe("quiz source files", () => {
  it("keep raw question ids and metadata consistent", () => {
    const issues: string[] = [];
    const seenIds = new Map<string, string>();
    let rawQuestionCount = 0;

    for (const categoryFile of readCategoryFiles()) {
      const catId = categoryFile.category_id ?? "unknown";

      if (categoryFile.question_count !== undefined && categoryFile.question_count !== categoryFile.questions.length) {
        issues.push(`${catId}: question_count mismatch`);
      }

      for (const question of categoryFile.questions) {
        rawQuestionCount += 1;

        if (!question.id?.trim()) {
          issues.push(`${catId}: empty question id`);
          continue;
        }

        const previous = seenIds.get(question.id);
        if (previous) {
          issues.push(`${question.id}: duplicate raw id in ${previous} and ${catId}`);
        }
        seenIds.set(question.id, catId);

        if (!question.prompt?.trim()) {
          issues.push(`${question.id}: empty prompt`);
        }

        for (const fieldName of ["options", "items"] as const) {
          const entries = question[fieldName];
          if (!entries) {
            continue;
          }

          const ids = entries.map(getRawOptionId);
          if (new Set(ids).size !== ids.length) {
            issues.push(`${question.id}: duplicate raw ${fieldName} ids`);
          }
        }
      }
    }

    expect(rawQuestionCount).toBe(516);
    expect(seenIds.size).toBe(516);
    expect(issues).toEqual([]);
  });
});

describe("getDefaultQuiz catalog invariants", () => {
  it("loads a technically consistent playable catalog", () => {
    const quiz = getDefaultQuiz();
    const issues: string[] = [];
    const ids = quiz.questions.map((question) => question.id);
    const categoryIds = new Set(quiz.categories.map((category) => category.id));

    if (quiz.categories.length === 0) {
      issues.push("catalog has no categories");
    }

    if (!categoryIds.has("cat-01")) {
      issues.push("catalog lost source category cat-01");
    }

    for (const category of quiz.categories) {
      if (!category.id.trim()) {
        issues.push("category with empty id");
      }
      if (!category.name.trim()) {
        issues.push(`${category.id}: empty category name`);
      }
      if (!category.slug.trim()) {
        issues.push(`${category.id}: empty category slug`);
      }
      if (!Number.isFinite(category.questionCount) || category.questionCount <= 0) {
        issues.push(`${category.id}: invalid category questionCount`);
      }
    }

    for (const question of quiz.questions) {
      if (!question.id.trim()) {
        issues.push("question with empty id");
      }

      if (!question.text.trim()) {
        issues.push(`${question.id}: empty text`);
      }

      if (question.durationMs !== QUESTION_DURATION_MS) {
        issues.push(`${question.id}: unexpected durationMs`);
      }

      if (!Number.isFinite(question.points) || question.points <= 0) {
        issues.push(`${question.id}: invalid points`);
      }

      if (!question.explanation?.trim()) {
        issues.push(`${question.id}: missing explanation`);
      }

      if (!question.categoryId || !categoryIds.has(question.categoryId)) {
        issues.push(`${question.id}: missing or unknown categoryId`);
      }

      if (!question.categoryName?.trim()) {
        issues.push(`${question.id}: missing categoryName`);
      }

      switch (question.type) {
        case QuestionType.MultipleChoice:
        case QuestionType.Logic: {
          issues.push(...collectOptionIssues(question, question.options, 3));

          if (!question.options.some((option) => option.id === question.correctOptionId)) {
            issues.push(`${question.id}: correctOptionId does not reference an option`);
          }
          break;
        }

        case QuestionType.MajorityGuess:
          issues.push(...collectOptionIssues(question, question.options, 3));
          break;

        case QuestionType.Estimate:
          if (!Number.isFinite(question.correctValue)) {
            issues.push(`${question.id}: invalid correctValue`);
          }
          if (!question.unit.trim()) {
            issues.push(`${question.id}: empty estimate unit`);
          }
          if (!question.context.trim()) {
            issues.push(`${question.id}: empty estimate context`);
          }
          if (containsStandaloneNumber(question.text, question.correctValue)) {
            issues.push(`${question.id}: estimate prompt leaks correct value`);
          }
          if (containsStandaloneNumber(question.context, question.correctValue)) {
            issues.push(`${question.id}: estimate context leaks correct value`);
          }
          break;

        case QuestionType.Ranking: {
          issues.push(...collectOptionIssues(question, question.items, 3));

          const itemIds = new Set(question.items.map((item) => item.id));
          const correctOrderIds = new Set(question.correctOrder);
          if (
            question.correctOrder.length !== question.items.length ||
            correctOrderIds.size !== question.correctOrder.length ||
            question.correctOrder.some((itemId) => !itemIds.has(itemId))
          ) {
            issues.push(`${question.id}: invalid correctOrder`);
          }
          if (question.items.map((item) => item.id).join("|") === question.correctOrder.join("|")) {
            issues.push(`${question.id}: ranking items are already in correct order`);
          }
          if (hasVisibleRankingSortKey(question)) {
            issues.push(`${question.id}: ranking item label leaks sort key`);
          }
          break;
        }

        case QuestionType.OpenText:
          if (!question.correctText.trim()) {
            issues.push(`${question.id}: empty correctText`);
          }
          if (question.aliases.length === 0) {
            issues.push(`${question.id}: missing aliases`);
          }
          if (question.aliases.some((alias) => alias.trim().length === 0)) {
            issues.push(`${question.id}: empty alias`);
          }
          break;
      }
    }

    expect(quiz.questions).toHaveLength(516);
    expect(new Set(ids).size).toBe(ids.length);
    expect(issues).toEqual([]);
  });

  it("keeps correct answer ids while balancing visible correct positions per category", () => {
    const rawCorrectOptionIds = new Map<string, string>();

    for (const categoryFile of readCategoryFiles()) {
      for (const question of categoryFile.questions) {
        const correctOptionId = getRawCorrectOptionId(question);
        if (question.id && correctOptionId) {
          rawCorrectOptionIds.set(question.id, correctOptionId);
        }
      }
    }

    const quiz = getDefaultQuiz();
    const issues: string[] = [];
    const positionsByCategory = new Map<string, number[]>();

    for (const question of quiz.questions) {
      if (question.type !== QuestionType.MultipleChoice && question.type !== QuestionType.Logic) {
        continue;
      }

      const rawCorrectOptionId = rawCorrectOptionIds.get(question.id);
      if (rawCorrectOptionId && rawCorrectOptionId !== question.correctOptionId) {
        issues.push(
          `${question.id}: correctOptionId changed from ${rawCorrectOptionId} to ${question.correctOptionId}`,
        );
      }

      const correctIndex = question.options.findIndex((option) => option.id === question.correctOptionId);
      if (correctIndex < 0) {
        issues.push(`${question.id}: correctOptionId missing from shuffled options`);
        continue;
      }

      const categoryId = question.categoryId ?? "unknown";
      const positions = positionsByCategory.get(categoryId) ?? [];
      positions.push(correctIndex);
      positionsByCategory.set(categoryId, positions);
    }

    for (const [categoryId, positions] of positionsByCategory.entries()) {
      if (positions.length < 4) {
        continue;
      }

      const counts = [0, 0, 0, 0];
      for (const position of positions) {
        counts[position] += 1;
      }

      const usedPositions = counts.filter((count) => count > 0).length;
      const max = Math.max(...counts);
      const min = Math.min(...counts);

      if (usedPositions !== 4) {
        issues.push(`${categoryId}: correct answers use only ${usedPositions} visible positions`);
      }
      if (max - min > 1) {
        issues.push(`${categoryId}: correct answer positions are unbalanced (${counts.join("/")})`);
      }
    }

    expect(issues).toEqual([]);
  });
});

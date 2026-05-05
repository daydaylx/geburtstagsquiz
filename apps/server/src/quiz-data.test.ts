import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { QuestionType, type Question, type QuestionOption } from "@quiz/shared-types";

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
  prompt?: string;
  options?: RawOption[];
  items?: RawOption[];
  correct_option_id?: string;
};

type RawCategory = {
  category_id?: string;
  question_count?: number;
  questions: RawQuestion[];
};

type RawQuizFile = {
  quiz: {
    stats?: {
      total_questions?: number;
      total_categories?: number;
    };
    categories: RawCategory[];
  };
};

const QUIZ_SOURCE_FILES = [
  "geburtstagsquiz_millennials_engine_v4_release_candidate.json",
  "geburtstagsquiz_millennials_engine_v5_expanded.json",
] as const;

function readQuizSource(fileName: string): RawQuizFile {
  return JSON.parse(readFileSync(path.resolve(process.cwd(), fileName), "utf8")) as RawQuizFile;
}

function getRawOptionId(option: RawOption, index: number): string {
  return typeof option === "string"
    ? String.fromCharCode(65 + index)
    : (option.id ?? `OPT-${index + 1}`);
}

function collectOptionIssues(
  question: Question,
  options: QuestionOption[],
  minCount: number,
): string[] {
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

describe("quiz source files", () => {
  it("keep raw question ids and metadata consistent", () => {
    const issues: string[] = [];
    const seenIds = new Map<string, string>();
    let rawQuestionCount = 0;

    for (const fileName of QUIZ_SOURCE_FILES) {
      const source = readQuizSource(fileName);
      let fileQuestionCount = 0;

      if (source.quiz.stats?.total_categories !== source.quiz.categories.length) {
        issues.push(`${fileName}: stats.total_categories does not match categories`);
      }

      for (const category of source.quiz.categories) {
        fileQuestionCount += category.questions.length;

        if (
          category.question_count !== undefined &&
          category.question_count !== category.questions.length
        ) {
          issues.push(`${fileName}/${category.category_id}: question_count mismatch`);
        }

        for (const question of category.questions) {
          rawQuestionCount += 1;

          if (!question.id?.trim()) {
            issues.push(`${fileName}/${category.category_id}: empty question id`);
            continue;
          }

          const previous = seenIds.get(question.id);
          if (previous) {
            issues.push(`${question.id}: duplicate raw id in ${previous} and ${fileName}`);
          }
          seenIds.set(question.id, fileName);

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

      if (source.quiz.stats?.total_questions !== fileQuestionCount) {
        issues.push(`${fileName}: stats.total_questions does not match questions`);
      }
    }

    expect(rawQuestionCount).toBe(498);
    expect(seenIds.size).toBe(498);
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

    expect(quiz.questions).toHaveLength(498);
    expect(new Set(ids).size).toBe(ids.length);
    expect(issues).toEqual([]);
  });
});

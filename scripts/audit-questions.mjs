#!/usr/bin/env node
// Strukturelle Analyse beider Fragenkatalog-JSONs.
// Ausgabe: JSON auf stdout.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = [
  "geburtstagsquiz_millennials_engine_v4_release_candidate.json",
  "geburtstagsquiz_millennials_engine_v5_expanded.json",
];

const SUPPORTED_TYPES = new Set([
  "multiple_choice",
  "estimate",
  "majority_guess",
  "ranking",
  "logic",
  "open_text",
]);

function loadFile(filename) {
  const raw = JSON.parse(readFileSync(resolve(ROOT, filename), "utf8"));
  return raw.quiz ?? raw;
}

function getAllQuestions(quiz) {
  const questions = [];
  for (const cat of quiz.categories ?? []) {
    for (const q of cat.questions ?? []) {
      questions.push({ ...q, _category: cat });
    }
  }
  return questions;
}

function auditFile(filename) {
  const quiz = loadFile(filename);
  const questions = getAllQuestions(quiz);

  const byType = {};
  const unsupported = [];
  const integrityErrors = [];
  const longPrompts = [];
  const noExplanation = [];
  const estimateErrors = [];
  const rankingErrors = [];
  const catDist = {};

  for (const q of questions) {
    const type = q.type;
    byType[type] = (byType[type] ?? 0) + 1;
    const catId = q.category_id ?? q._category?.category_id ?? "unknown";
    catDist[catId] = (catDist[catId] ?? 0) + 1;

    if (!SUPPORTED_TYPES.has(type)) {
      unsupported.push({ id: q.id, type, catId });
      continue;
    }

    const prompt = q.prompt ?? q.text ?? "";
    if (prompt.length > 200) {
      longPrompts.push({
        id: q.id,
        type,
        len: prompt.length,
        catId,
        prompt: prompt.slice(0, 80) + "…",
      });
    }

    if (!q.explanation) {
      noExplanation.push({ id: q.id, type, catId });
    }

    // multiple_choice / logic / majority_guess: option integrity
    if (["multiple_choice", "logic", "majority_guess"].includes(type)) {
      const opts = q.options ?? [];
      const optIds = new Set(opts.map((o) => o.id));

      if (type !== "majority_guess" && q.correct_option_id) {
        if (!optIds.has(q.correct_option_id)) {
          integrityErrors.push({
            id: q.id,
            type,
            catId,
            problem: `correct_option_id '${q.correct_option_id}' not in options [${[...optIds].join(", ")}]`,
          });
        }
      }
      if (opts.length < 2) {
        integrityErrors.push({ id: q.id, type, catId, problem: `only ${opts.length} option(s)` });
      }
      if (type !== "majority_guess" && !q.correct_option_id) {
        integrityErrors.push({ id: q.id, type, catId, problem: "missing correct_option_id" });
      }
    }

    // estimate
    if (type === "estimate") {
      const val = q.answer?.reference_value ?? q.correct_value;
      if (val === undefined || val === null || typeof val !== "number" || isNaN(val)) {
        estimateErrors.push({
          id: q.id,
          catId,
          problem: `invalid reference_value: ${JSON.stringify(val)}`,
        });
      }
      if (!q.answer?.unit && !q.unit) {
        estimateErrors.push({ id: q.id, catId, problem: "missing unit" });
      }
    }

    // ranking
    if (type === "ranking") {
      const items = q.items ?? [];
      const itemIds = new Set(items.map((i) => i.id));
      const order = q.correct_order ?? [];
      for (const oid of order) {
        if (!itemIds.has(oid)) {
          rankingErrors.push({
            id: q.id,
            catId,
            problem: `correct_order item '${oid}' not in items [${[...itemIds].join(", ")}]`,
          });
        }
      }
      if (order.length !== items.length) {
        rankingErrors.push({
          id: q.id,
          catId,
          problem: `correct_order length ${order.length} != items length ${items.length}`,
        });
      }
    }
  }

  return {
    filename,
    totalQuestions: questions.length,
    byType,
    unsupportedCount: unsupported.length,
    unsupported,
    integrityErrors,
    estimateErrors,
    rankingErrors,
    longPrompts,
    noExplanation,
    catDistribution: catDist,
  };
}

function findDuplicates(filesResults) {
  const all = [];
  for (const r of filesResults) {
    const quiz = loadFile(r.filename);
    for (const q of getAllQuestions(quiz)) {
      const prompt = (q.prompt ?? q.text ?? "").trim().toLowerCase().slice(0, 80);
      all.push({ id: q.id, prompt, full: q.prompt ?? q.text ?? "", file: r.filename });
    }
  }
  const seen = new Map();
  const dupes = [];
  for (const q of all) {
    if (seen.has(q.prompt)) {
      dupes.push({ a: seen.get(q.prompt), b: q });
    } else {
      seen.set(q.prompt, q);
    }
  }
  return dupes;
}

const results = FILES.map(auditFile);
const duplicates = findDuplicates(results);

const summary = {
  files: results.map(({ filename, totalQuestions, byType, unsupportedCount, catDistribution }) => ({
    filename,
    totalQuestions,
    byType,
    unsupportedCount,
    catDistribution,
  })),
  totalQuestions: results.reduce((s, r) => s + r.totalQuestions, 0),
  totalUnsupported: results.reduce((s, r) => s + r.unsupportedCount, 0),
  totalIntegrityErrors: results.reduce((s, r) => s + r.integrityErrors.length, 0),
  totalEstimateErrors: results.reduce((s, r) => s + r.estimateErrors.length, 0),
  totalRankingErrors: results.reduce((s, r) => s + r.rankingErrors.length, 0),
  totalLongPrompts: results.reduce((s, r) => s + r.longPrompts.length, 0),
  totalNoExplanation: results.reduce((s, r) => s + r.noExplanation.length, 0),
  totalDuplicates: duplicates.length,
  details: results,
  duplicates,
};

process.stdout.write(JSON.stringify(summary, null, 2) + "\n");

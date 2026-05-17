#!/usr/bin/env node
// Strukturelle Analyse des Fragenkatalogs (Kategorie-Dateien).
// Ausgabe: JSON auf stdout.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CATEGORIES_DIR = resolve(ROOT, "data/quiz/questions");
const FILES = readdirSync(CATEGORIES_DIR)
  .filter((f) => f.startsWith("cat-") && f.endsWith(".json"))
  .sort()
  .map((f) => join(CATEGORIES_DIR, f));

const SUPPORTED_TYPES = new Set(["multiple_choice", "estimate", "majority_guess", "ranking", "logic", "open_text"]);

// Non-canonical raw types (standard, common_mistake, pattern, fast_guess, estimate_duel, etc.)
// are normalized to canonical types by the server loader (quiz-data.ts).
// This count tracks them for transparency, not as errors.
const CANONICAL_TYPES = new Set([...SUPPORTED_TYPES]);

function loadFile(filename) {
  return JSON.parse(readFileSync(filename, "utf8"));
}

function getAllQuestions(cat) {
  const questions = [];
  for (const q of cat.questions ?? []) {
    questions.push({ ...q, _category: cat });
  }
  return questions;
}

function auditFile(filename) {
  const cat = loadFile(filename);
  const questions = getAllQuestions(cat);

  const byType = {};
  const nonCanonicalRawTypes = [];
  const integrityErrors = [];
  const longPrompts = [];
  const noExplanation = [];
  const estimateErrors = [];
  const rankingErrors = [];
  const leakFindings = [];
  const catDist = {};

  for (const q of questions) {
    const type = q.type;
    byType[type] = (byType[type] ?? 0) + 1;
    const catId = q.category_id ?? q._category?.category_id ?? "unknown";
    catDist[catId] = (catDist[catId] ?? 0) + 1;

    if (!CANONICAL_TYPES.has(type)) {
      nonCanonicalRawTypes.push({ id: q.id, type, catId, note: "normalized by server loader" });
    }

    const prompt = q.prompt ?? q.text ?? "";
    if (prompt.length > 200) {
      longPrompts.push({
        id: q.id,
        type,
        len: prompt.length,
        catId,
        prompt: `${prompt.slice(0, 80)}…`,
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
      if (val === undefined || val === null || typeof val !== "number" || Number.isNaN(val)) {
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

    // ── Fairness / Leak-Checks ────────────────────────────────────────

    if (type === "estimate") {
      const refVal = q.answer?.reference_value;
      const canonical = String(q.answer?.canonical ?? "");
      const answerContext = String(q.answer?.context ?? "");

      // P0: Referenzwert als Zahl im sichtbaren Prompt
      if (typeof refVal === "number" && prompt.includes(String(refVal))) {
        leakFindings.push({
          severity: "P0",
          id: q.id,
          catId,
          field: "prompt",
          reason: `reference_value ${refVal} im sichtbaren Prompt`,
        });
      }
      // P0: Canonical-Wert im sichtbaren Prompt
      if (canonical && prompt.includes(canonical)) {
        leakFindings.push({
          severity: "P0",
          id: q.id,
          catId,
          field: "prompt",
          reason: `answer.canonical "${canonical}" im sichtbaren Prompt`,
        });
      }
      // P1: answer.context enthält Referenzwert (Datenfeld-Check – wird serverseitig aktuell nicht gesendet)
      if (typeof refVal === "number" && answerContext.includes(String(refVal))) {
        leakFindings.push({
          severity: "P1",
          id: q.id,
          catId,
          field: "answer.context",
          reason: `reference_value ${refVal} in answer.context – serverseitig nicht gesendet, aber Datenfeld beachten`,
        });
      }
      // P1: answer.context enthält canonical
      if (canonical && answerContext.includes(canonical)) {
        leakFindings.push({
          severity: "P1",
          id: q.id,
          catId,
          field: "answer.context",
          reason: `answer.canonical "${canonical}" in answer.context – serverseitig nicht gesendet, aber Datenfeld beachten`,
        });
      }
    }

    if (type === "ranking") {
      const items = q.items ?? [];
      // Erkennt Wert+Einheit im Label (z.B. "700 MB", "25 kg", "3,5 €")
      const valueWithUnit =
        /\b\d[\d.,]*\s*(MB|GB|KB|TB|kg|g\b|t\b|cm|mm\b|m\b|km|€|\$|BPM|bpm|Hz|GHz|MHz|W\b|PS\b|%|ml|l\b|min\b|h\b|cal|kcal|km\/h|m\/s)/i;
      // Schlüsselwörter im Prompt, nach denen sortiert wird
      const metricSort =
        /Größe|Speicher|Gewicht|Preis|Dauer|BPM|Hz|Volumen|Länge|Breite|Höhe|Distanz|Entfernung|Auflage|Stückzahl|Kaloriengehalt|Kalorien|Leistung|Kapazität/i;
      // Eigenständige Jahreszahl (19xx oder 20xx)
      const standaloneYear = /(?<![A-Za-z0-9])(19|20)\d{2}(?![A-Za-z0-9])/;
      const yearSort = /Jahr|Release|Erschein|älteste|neuste|chronolog|Datum|Veröffentlich/i;

      for (const item of items) {
        const label = typeof item === "string" ? item : (item.label ?? item.text ?? "");

        // P0: Label mit Wert+Einheit wenn Prompt nach dieser Metrik sortiert
        if (valueWithUnit.test(label) && metricSort.test(prompt)) {
          leakFindings.push({
            severity: "P0",
            id: q.id,
            catId,
            field: `items[${item.id ?? label}].label`,
            reason: `Item-Label "${label}" enthält Wert+Einheit, Prompt sortiert nach Metrik`,
          });
        }
        // P1: Eigenständige Jahreszahl im Label wenn Prompt nach Jahr/Release sortiert
        // (Ausnahme: Produktnamen wie "Nintendo 64" oder "Xbox 360" enthalten keine 4-stelligen Jahre)
        if (standaloneYear.test(label) && yearSort.test(prompt)) {
          leakFindings.push({
            severity: "P1",
            id: q.id,
            catId,
            field: `items[${item.id ?? label}].label`,
            reason: `Item-Label "${label}" enthält Jahreszahl, Prompt sortiert nach Datum/Release`,
          });
        }
      }
    }

    // MC/Logic P2: Korrekte Antwort deutlich länger als alle falschen
    if (type === "multiple_choice" || type === "logic") {
      const opts = q.options ?? [];
      const correctOpt = opts.find((o) => o.id === q.correct_option_id);
      if (correctOpt && opts.length >= 2) {
        const correctLen = (correctOpt.text ?? "").length;
        const otherLens = opts.filter((o) => o.id !== q.correct_option_id).map((o) => (o.text ?? "").length);
        const avgOtherLen = otherLens.reduce((a, b) => a + b, 0) / otherLens.length;
        if (correctLen > avgOtherLen * 1.8 && correctLen > avgOtherLen + 20) {
          leakFindings.push({
            severity: "P2",
            id: q.id,
            catId,
            field: `options[${q.correct_option_id}]`,
            reason: `Richtige Antwort (${correctLen} Zeichen) deutlich länger als Ø der falschen (${Math.round(avgOtherLen)}) – könnte auffallen`,
          });
        }
      }
    }
  }

  return {
    filename,
    totalQuestions: questions.length,
    byType,
    nonCanonicalRawTypeCount: nonCanonicalRawTypes.length,
    nonCanonicalRawTypes,
    integrityErrors,
    estimateErrors,
    rankingErrors,
    leakFindings,
    longPrompts,
    noExplanation,
    catDistribution: catDist,
  };
}

function findDuplicates(filesResults) {
  const all = [];
  for (const r of filesResults) {
    const cat = loadFile(r.filename);
    for (const q of getAllQuestions(cat)) {
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

const allLeakFindings = results.flatMap((r) => r.leakFindings.map((f) => ({ ...f, file: r.filename })));

const summary = {
  files: results.map(({ filename, totalQuestions, byType, nonCanonicalRawTypeCount, catDistribution }) => ({
    filename,
    totalQuestions,
    byType,
    nonCanonicalRawTypeCount,
    catDistribution,
  })),
  totalQuestions: results.reduce((s, r) => s + r.totalQuestions, 0),
  totalNonCanonicalRawTypes: results.reduce((s, r) => s + r.nonCanonicalRawTypeCount, 0),
  totalIntegrityErrors: results.reduce((s, r) => s + r.integrityErrors.length, 0),
  totalEstimateErrors: results.reduce((s, r) => s + r.estimateErrors.length, 0),
  totalRankingErrors: results.reduce((s, r) => s + r.rankingErrors.length, 0),
  totalLongPrompts: results.reduce((s, r) => s + r.longPrompts.length, 0),
  totalNoExplanation: results.reduce((s, r) => s + r.noExplanation.length, 0),
  totalDuplicates: duplicates.length,
  totalLeakFindings: allLeakFindings.length,
  leakFindingsByLevel: {
    P0: allLeakFindings.filter((f) => f.severity === "P0").length,
    P1: allLeakFindings.filter((f) => f.severity === "P1").length,
    P2: allLeakFindings.filter((f) => f.severity === "P2").length,
  },
  details: results,
  duplicates,
  leakFindings: allLeakFindings,
};

// Menschenlesbare Fairness-Zusammenfassung auf stderr
const p0 = allLeakFindings.filter((f) => f.severity === "P0");

if (allLeakFindings.length === 0) {
  process.stderr.write("✓ Keine Fairness-Leaks gefunden.\n");
} else {
  process.stderr.write(`\n=== FAIRNESS-AUDIT (${allLeakFindings.length} Befunde) ===\n\n`);
  for (const sev of ["P0", "P1", "P2"]) {
    const findings = allLeakFindings.filter((f) => f.severity === sev);
    if (findings.length === 0) continue;
    const label =
      sev === "P0" ? "Lösung direkt sichtbar" : sev === "P1" ? "Starker Lösungshinweis" : "Mögliche Unfairness";
    process.stderr.write(`${sev} – ${label} (${findings.length}):\n`);
    for (const f of findings) {
      process.stderr.write(`  [${f.id}] ${f.catId} · ${f.field}\n    ${f.reason}\n`);
    }
    process.stderr.write("\n");
  }
}

if (p0.length > 0) {
  process.stderr.write(`FEHLER: ${p0.length} P0-Leak(s) gefunden – Quiz wäre unfair!\n`);
  process.exitCode = 1;
}

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

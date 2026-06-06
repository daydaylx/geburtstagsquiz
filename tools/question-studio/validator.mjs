import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const QUESTIONS_DIR = resolve(ROOT, "data/quiz/questions");
const SUPPORTED_TYPES = new Set(["multiple_choice", "logic"]);

export function generateQuestionId(categoryId, questionIndex) {
  const hash = randomUUID().slice(0, 10).replace(/-/g, "");
  return `q-${categoryId}-${String(questionIndex).padStart(2, "0")}-${hash}`;
}

export function generateOptionId(questionId, optionIndex) {
  return `${questionId}-opt-${optionIndex + 1}`;
}

export function shuffleOptions(question) {
  const opts = question.options ?? [];
  if (opts.length === 0) return question;

  const indexed = opts.map((opt, i) => ({ opt, originalIndex: i }));
  for (let i = indexed.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indexed[i], indexed[j]] = [indexed[j], indexed[i]];
  }

  const shuffledOptions = indexed.map(({ opt }) => opt);
  const correctOldId = question.correct_option_id;
  let correctNewId = correctOldId;

  if (correctOldId) {
    const oldIndex = opts.findIndex((o) => o.id === correctOldId);
    if (oldIndex >= 0) {
      const newIndex = indexed.findIndex((item) => item.originalIndex === oldIndex);
      if (newIndex >= 0) {
        correctNewId = shuffledOptions[newIndex].id;
      }
    }
  }

  return {
    ...question,
    options: shuffledOptions,
    correct_option_id: correctNewId,
  };
}

export function extractJsonFromResponse(raw) {
  if (typeof raw !== "string") return null;

  let text = raw.trim();

  const jsonBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (jsonBlockMatch) {
    text = jsonBlockMatch[1].trim();
  }

  if (text.startsWith("[") || text.startsWith("{")) {
    try {
      const endBracket = text.startsWith("[")
        ? findMatchingBracket(text, "[", "]")
        : findMatchingBracket(text, "{", "}");
      if (endBracket >= 0) {
        text = text.slice(0, endBracket + 1);
      }
      return JSON.parse(text);
    } catch {
      // fall through
    }
  }

  const firstBracket = text.indexOf("[");
  const firstBrace = text.indexOf("{");
  const start = firstBracket < 0 ? firstBrace : firstBrace < 0 ? firstBracket : Math.min(firstBracket, firstBrace);

  if (start >= 0) {
    const openChar = text[start];
    const closeChar = openChar === "[" ? "]" : "}";
    try {
      const endBracket = findMatchingBracket(text, openChar, closeChar, start);
      if (endBracket >= 0) {
        return JSON.parse(text.slice(start, endBracket + 1));
      }
    } catch {
      // fall through
    }
  }

  return null;
}

function findMatchingBracket(text, open, close, startIndex = 0) {
  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let i = startIndex; i < text.length; i++) {
    const ch = text[i];
    if (escaping) {
      escaping = false;
      continue;
    }
    if (ch === "\\") {
      escaping = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === open) depth++;
    if (ch === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export function normalizeDraft(rawJson) {
  let data = rawJson;

  if (typeof rawJson === "string") {
    data = extractJsonFromResponse(rawJson);
    if (data === null) {
      return {
        ok: false,
        error: "Antwort enthält kein gültiges JSON.",
        metaDetected: false,
      };
    }
  }

  if (!data || typeof data !== "object") {
    return {
      ok: false,
      error: "Ungültiges Format: kein Objekt oder Array.",
      metaDetected: false,
    };
  }

  let questions;
  if (Array.isArray(data)) {
    questions = data;
  } else if (Array.isArray(data.questions)) {
    questions = data.questions;
  } else {
    return {
      ok: false,
      error: "Kein questions-Array gefunden.",
      metaDetected: false,
    };
  }

  const normalized = [];
  const usedIds = new Set();

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (!q || typeof q !== "object") continue;

    let id = q.id || "";
    if (!id || usedIds.has(id)) {
      id = `q-gen-${i + 1}-${randomUUID().slice(0, 8)}`;
    }
    usedIds.add(id);

    const type = q.type || "multiple_choice";
    const prompt = q.prompt || q.text || q.question || "";
    const explanation = q.explanation || "";
    const difficulty = q.difficulty || "medium";
    const difficultyScore = q.difficulty_score || q.difficultyScore || 3;
    const categoryId = q.category_id || "";
    const points = typeof q.points === "number" ? q.points : 1;

    let options = Array.isArray(q.options) ? q.options : [];
    let correctOptionId = q.correct_option_id || q.correctOptionId || "";

    if (options.length === 0 && Array.isArray(q.answers)) {
      options = q.answers;
    }

    const normalizedOptions = options.map((opt, oi) => {
      if (typeof opt === "string") {
        return { id: `${id}-opt-${oi + 1}`, text: opt, is_correct: false };
      }
      return {
        id: opt.id || `${id}-opt-${oi + 1}`,
        text: opt.text || opt.label || "",
        is_correct: Boolean(opt.is_correct || opt.correct || opt.isCorrect),
      };
    });

    if (!correctOptionId && normalizedOptions.length > 0) {
      const correctOpt = normalizedOptions.find((o) => o.is_correct);
      if (correctOpt) {
        correctOptionId = correctOpt.id;
      }
    }

    normalized.push({
      id,
      type,
      prompt,
      options: normalizedOptions,
      correct_option_id: correctOptionId,
      explanation,
      difficulty,
      difficulty_score: Number(difficultyScore),
      category_id: categoryId,
      points,
    });
  }

  return {
    ok: true,
    questions: normalized,
    metaDetected: typeof rawJson === "string" && rawJson.includes("```"),
  };
}

export function validateDraft(draft, existingQuestions = []) {
  const errors = [];
  const warnings = [];

  if (!draft || !Array.isArray(draft) || draft.length === 0) {
    errors.push({
      code: "EMPTY_DRAFT",
      message: "Draft ist leer oder kein Array.",
    });
    return { errors, warnings };
  }

  const allIds = new Set();
  const allPrompts = [];

  for (let i = 0; i < draft.length; i++) {
    const q = draft[i];
    const prefix = `Frage ${i + 1} (${q.id || "ohne ID"})`;

    if (!q.id) {
      errors.push({
        code: "MISSING_ID",
        message: `${prefix}: Keine ID.`,
        questionIndex: i,
      });
    } else if (allIds.has(q.id)) {
      errors.push({
        code: "DUPLICATE_ID",
        message: `${prefix}: ID doppelt.`,
        questionIndex: i,
      });
    } else {
      allIds.add(q.id);
    }

    if (!q.prompt || q.prompt.trim().length < 5) {
      errors.push({
        code: "MISSING_PROMPT",
        message: `${prefix}: Prompt fehlt oder zu kurz.`,
        questionIndex: i,
      });
    }

    const type = q.type || "multiple_choice";
    if (!SUPPORTED_TYPES.has(type)) {
      errors.push({
        code: "UNSUPPORTED_TYPE",
        message: `${prefix}: Typ '${type}' wird vom Generator nicht unterstützt.`,
        questionIndex: i,
      });
    }

    const opts = q.options ?? [];
    if (opts.length !== 4) {
      errors.push({
        code: "WRONG_OPTION_COUNT",
        message: `${prefix}: Erwartet 4 Optionen, gefunden ${opts.length}.`,
        questionIndex: i,
      });
    } else {
      const optIds = new Set();
      for (const opt of opts) {
        if (optIds.has(opt.id)) {
          errors.push({
            code: "DUPLICATE_OPTION_ID",
            message: `${prefix}: Options-ID '${opt.id}' doppelt.`,
            questionIndex: i,
          });
        }
        optIds.add(opt.id);
        if (!opt.text || opt.text.trim().length === 0) {
          errors.push({
            code: "EMPTY_OPTION_TEXT",
            message: `${prefix}: Option '${opt.id}' hat keinen Text.`,
            questionIndex: i,
          });
        }
      }

      const correctOpts = opts.filter((o) => o.is_correct === true);
      if (correctOpts.length === 0) {
        errors.push({
          code: "NO_CORRECT_OPTION",
          message: `${prefix}: Keine korrekte Option markiert.`,
          questionIndex: i,
        });
      } else if (correctOpts.length > 1) {
        errors.push({
          code: "MULTIPLE_CORRECT",
          message: `${prefix}: ${correctOpts.length} Optionen als korrekt markiert (erwartet: 1).`,
          questionIndex: i,
        });
      }

      if (q.correct_option_id && !optIds.has(q.correct_option_id)) {
        errors.push({
          code: "BROKEN_CORRECT_REF",
          message: `${prefix}: correct_option_id '${q.correct_option_id}' existiert nicht in Optionen.`,
          questionIndex: i,
        });
      }

      if (correctOpts.length === 1 && q.correct_option_id && correctOpts[0].id !== q.correct_option_id) {
        errors.push({
          code: "MISMATCH_CORRECT",
          message: `${prefix}: is_correct zeigt auf '${correctOpts[0].id}', aber correct_option_id ist '${q.correct_option_id}'.`,
          questionIndex: i,
        });
      }

      const texts = opts.map((o) => (o.text || "").trim());
      const lens = texts.map((t) => t.length);
      if (lens.length === 4) {
        const maxLen = Math.max(...lens);
        const minLen = Math.min(...lens);
        if (maxLen > minLen * 3 && maxLen - minLen > 30) {
          warnings.push({
            code: "UNEVEN_OPTION_LENGTH",
            message: `${prefix}: Antwortlängen stark unterschiedlich (${minLen}–${maxLen} Zeichen).`,
            questionIndex: i,
          });
        }
      }
    }

    if (!q.explanation || q.explanation.trim().length < 10) {
      warnings.push({
        code: "THIN_EXPLANATION",
        message: `${prefix}: Erklärung fehlt oder sehr dünn.`,
        questionIndex: i,
      });
    }

    const diffScore = q.difficulty_score;
    if (typeof diffScore !== "number" || diffScore < 1 || diffScore > 5) {
      errors.push({
        code: "INVALID_DIFFICULTY",
        message: `${prefix}: difficulty_score muss 1-5 sein, ist '${diffScore}'.`,
        questionIndex: i,
      });
    }

    allPrompts.push({
      prompt: q.prompt.trim().toLowerCase(),
      index: i,
      id: q.id,
    });
  }

  for (let i = 0; i < allPrompts.length; i++) {
    for (let j = i + 1; j < allPrompts.length; j++) {
      if (stringSimilarity(allPrompts[i].prompt, allPrompts[j].prompt) > 0.8) {
        errors.push({
          code: "INTERNAL_DUPLICATE",
          message: `Fragen ${allPrompts[i].index + 1} und ${allPrompts[j].index + 1} sind sehr ähnlich.`,
          questionIndex: allPrompts[i].index,
        });
      }
    }
  }

  for (const dp of allPrompts) {
    for (const existing of existingQuestions) {
      const exPrompt = (existing.prompt || existing.text || "").trim().toLowerCase();
      if (exPrompt && stringSimilarity(dp.prompt, exPrompt) > 0.8) {
        warnings.push({
          code: "EXISTING_DUPLICATE",
          message: `Frage ${dp.index + 1} ähnelt bestehender Frage '${existing.id}'.`,
          questionIndex: dp.index,
        });
        break;
      }
    }
  }

  return { errors, warnings };
}

function stringSimilarity(a, b) {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const aWords = new Set(a.split(/\s+/));
  const bWords = new Set(b.split(/\s+/));
  let common = 0;
  for (const w of aWords) {
    if (bWords.has(w)) common++;
  }
  return common / Math.max(aWords.size, bWords.size);
}

export function loadExistingQuestions() {
  const questions = [];
  try {
    const files = readdirSync(QUESTIONS_DIR)
      .filter((f) => f.startsWith("cat-") && f.endsWith(".json"))
      .sort();
    for (const file of files) {
      try {
        const cat = JSON.parse(readFileSync(join(QUESTIONS_DIR, file), "utf8"));
        if (Array.isArray(cat.questions)) {
          questions.push(...cat.questions);
        }
      } catch {
        // skip unreadable files
      }
    }
  } catch {
    // dir may not exist yet
  }

  const generatedDir = join(QUESTIONS_DIR, "generated");
  try {
    const draftFiles = readdirSync(generatedDir)
      .filter((f) => f.endsWith(".json"))
      .sort();
    for (const file of draftFiles) {
      try {
        const draft = JSON.parse(readFileSync(join(generatedDir, file), "utf8"));
        if (Array.isArray(draft.questions)) {
          questions.push(...draft.questions);
        }
      } catch {
        // skip unreadable drafts
      }
    }
  } catch {
    // generated dir may not exist yet
  }

  return questions;
}

export function filterFreeModels(models) {
  if (!Array.isArray(models)) return [];
  return models.filter((m) => {
    const pricing = m.pricing || {};
    return pricing.prompt === "0" && pricing.completion === "0";
  });
}

export function ensureGeneratedDir() {
  return resolve(ROOT, "data/quiz/questions/generated");
}

export function buildDraftFilename(categorySlug) {
  const now = new Date();
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  const time = [String(now.getHours()).padStart(2, "0"), String(now.getMinutes()).padStart(2, "0")].join("");
  return `${categorySlug}-draft-${date}-${time}.json`;
}

export function loadEnvLocal() {
  const envPath = resolve(ROOT, ".env.local");
  try {
    const content = readFileSync(envPath, "utf8");
    const vars = {};
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex < 0) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed
        .slice(eqIndex + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
      if (key === "OPENROUTER_API_KEY") {
        vars.OPENROUTER_API_KEY = value;
      }
    }
    return vars;
  } catch {
    return {};
  }
}

export function getApiKey() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  const envVars = loadEnvLocal();
  return envVars.OPENROUTER_API_KEY || null;
}

export function loadCategories() {
  const categories = [];
  try {
    const files = readdirSync(QUESTIONS_DIR)
      .filter((f) => f.startsWith("cat-") && f.endsWith(".json"))
      .sort();
    for (const file of files) {
      try {
        const cat = JSON.parse(readFileSync(join(QUESTIONS_DIR, file), "utf8"));
        categories.push({
          category_id: cat.category_id || cat.id || "",
          slug: cat.slug || "",
          name: cat.name || "",
          difficulty: cat.difficulty || "",
          tags: cat.tags || [],
          question_count: Array.isArray(cat.questions) ? cat.questions.length : 0,
        });
      } catch (err) {
        console.warn(`Konnte Kategorie-Datei nicht lesen: ${file}:`, err.message);
      }
    }
  } catch {
    // dir may not exist
  }
  return categories;
}

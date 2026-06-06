#!/usr/bin/env node

import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildDraftFilename,
  ensureGeneratedDir,
  extractJsonFromResponse,
  filterFreeModels,
  getApiKey,
  loadCategories,
  loadExistingQuestions,
  normalizeDraft,
  shuffleOptions,
  validateDraft,
} from "./validator.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "public");
const promptsDir = join(__dirname, "prompts");

const args = parseArgs(process.argv.slice(2));
const PORT = Number(args.port ?? 4178);
const HOST = args.host ?? "127.0.0.1";

const DIFFICULTY_MAP = {
  1: { label: "very_easy", description: "sehr einfach, fast jeder weiß es" },
  2: { label: "easy", description: "einfach, mit kurzem Nachdenken lösbar" },
  3: { label: "medium", description: "mittel, solides Allgemeinwissen nötig" },
  4: { label: "hard", description: "schwer, viele liegen falsch" },
  5: {
    label: "very_hard",
    description: "fies, aber fair; nicht unfair, nicht willkürlich",
  },
};

let modelsCache = null;
let modelsCacheTime = 0;
const MODEL_CACHE_TTL = 5 * 60 * 1000;

const RULE_PRESETS = {
  no_multiple_correct: "keine mehrfach richtigen Antworten",
  no_obvious_correct: "keine offensichtlich herausstechende richtige Antwort",
  plausible_wrong: "falsche Antworten müssen plausibel sein",
  balanced_lengths: "Antwortlängen sollen halbwegs ausgeglichen sein",
  no_trick_questions: "keine Fangfragen, außer explizit erlaubt",
  no_date_questions: "keine Datumsfragen, außer explizit erlaubt",
  short_explanation: "Erklärung kurz und nachvollziehbar",
  no_guess_only: "keine Fragen, die nur durch Raten funktionieren",
  no_duplicates: "keine doppelten oder sehr ähnlichen Fragen",
  shuffle_positions: "richtige Antwortposition automatisch mischen",
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${HOST}:${PORT}`);

    if (request.method === "OPTIONS") {
      sendJson(response, 204, null);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/models") {
      return handleGetModels(response);
    }

    if (request.method === "GET" && url.pathname === "/api/categories") {
      return sendJson(response, 200, loadCategories());
    }

    if (request.method === "GET" && url.pathname === "/api/rules") {
      return sendJson(response, 200, RULE_PRESETS);
    }

    if (request.method === "GET" && url.pathname === "/api/status") {
      const apiKey = getApiKey();
      return sendJson(response, 200, {
        hasApiKey: Boolean(apiKey),
        apiKeyLength: apiKey ? apiKey.length : 0,
      });
    }

    if (request.method === "POST" && url.pathname === "/api/generate") {
      return handleGenerate(request, response);
    }

    if (request.method === "POST" && url.pathname === "/api/validate") {
      return handleValidate(request, response);
    }

    if (request.method === "POST" && url.pathname === "/api/save-draft") {
      return handleSaveDraft(request, response);
    }

    if (request.method === "GET") {
      return serveStatic(url.pathname, response);
    }

    sendJson(response, 404, { error: "Nicht gefunden." });
  } catch (error) {
    console.error("Server error:", error);
    sendJson(response, 500, { error: error.message || "Interner Fehler." });
  }
});

async function handleGetModels(response) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return sendJson(response, 200, {
      models: [],
      error: "OPENROUTER_API_KEY fehlt. Setze ihn in .env.local oder als Umgebungsvariable.",
    });
  }

  const now = Date.now();
  if (modelsCache && now - modelsCacheTime < MODEL_CACHE_TTL) {
    return sendJson(response, 200, { models: modelsCache, cached: true });
  }

  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return sendJson(response, res.status, {
        models: [],
        error: `OpenRouter API Fehler: ${res.status} ${body.slice(0, 200)}`,
      });
    }

    const data = await res.json();
    const allModels = data.data || [];
    const freeModels = filterFreeModels(allModels).map((m) => ({
      id: m.id,
      name: m.name || m.id,
      context_length: m.context_length || null,
      description: (m.description || "").slice(0, 200),
      architecture: m.architecture?.modality || "",
    }));

    freeModels.sort((a, b) => a.name.localeCompare(b.name));
    modelsCache = freeModels;
    modelsCacheTime = now;

    return sendJson(response, 200, { models: freeModels, cached: false });
  } catch (error) {
    const msg = error.name === "TimeoutError" ? "OpenRouter Timeout (15s)." : error.message;
    return sendJson(response, 200, {
      models: modelsCache || [],
      error: `Fehler beim Laden der Modelle: ${msg}`,
    });
  }
}

async function handleGenerate(request, response) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return sendJson(response, 403, { error: "OPENROUTER_API_KEY fehlt." });
  }

  const body = await readJsonBody(request);
  const {
    model,
    count,
    difficulty_score,
    category_id,
    rules,
    custom_rules,
    quality_mode,
    category_name,
    category_slug,
    category_description,
  } = body;

  if (!model || typeof model !== "string") {
    return sendJson(response, 400, { error: "Modell fehlt." });
  }
  const questionCount = Math.min(Math.max(Number(count) || 5, 1), 20);
  const diffScore = Math.min(Math.max(Number(difficulty_score) || 3, 1), 5);
  const mode = quality_mode || "fast";

  const selectedRules = Array.isArray(rules) ? rules : [];
  const ruleTexts = selectedRules.map((key) => RULE_PRESETS[key]).filter(Boolean);
  if (custom_rules && typeof custom_rules === "string" && custom_rules.trim()) {
    ruleTexts.push(custom_rules.trim());
  }
  const rulesBlock = ruleTexts.length > 0 ? ruleTexts.map((r) => `- ${r}`).join("\n") : "- Standardregeln";

  const diffInfo = DIFFICULTY_MAP[diffScore] || DIFFICULTY_MAP[3];

  let generatePromptTemplate;
  try {
    generatePromptTemplate = await readFile(join(promptsDir, "generate.md"), "utf8");
  } catch {
    return sendJson(response, 500, {
      error: "generate.md Prompt-Template nicht gefunden.",
    });
  }

  const systemPrompt = generatePromptTemplate
    .replace(/\{\{count\}\}/g, String(questionCount))
    .replace(/\{\{difficulty_score\}\}/g, String(diffScore))
    .replace(/\{\{difficulty_label\}\}/g, diffInfo.label)
    .replace(/\{\{difficulty_description\}\}/g, diffInfo.description)
    .replace(/\{\{category_name\}\}/g, category_name || category_id || "Allgemein")
    .replace(/\{\{category_slug\}\}/g, category_slug || category_id || "allgemein")
    .replace(/\{\{category_id\}\}/g, category_id || "cat-gen")
    .replace(/\{\{rules\}\}/g, rulesBlock)
    .replace(/\{\{#if category_description\}\}([\s\S]*?)\{\{\/if\}\}/g, category_description ? "$1" : "")
    .replace(/\{\{category_description\}\}/g, category_description || "");

  const overproduce = mode === "strict" ? questionCount + Math.ceil(questionCount * 0.5) : questionCount;
  const systemPromptFinal = systemPrompt.replace(
    `exakt ${questionCount} Multiple-Choice-Fragen`,
    `exakt ${overproduce} Multiple-Choice-Fragen`,
  );

  try {
    const generateResult = await callOpenRouter(
      apiKey,
      model,
      systemPromptFinal,
      `Erzeuge ${overproduce} Fragen. Nur JSON.`,
    );
    if (!generateResult.ok) {
      return sendJson(response, 502, {
        error: `Generierung fehlgeschlagen: ${generateResult.error}`,
      });
    }

    const normalized = normalizeDraft(generateResult.content);
    if (!normalized.ok) {
      return sendJson(response, 422, {
        error: `Normalisierung fehlgeschlagen: ${normalized.error}`,
        metaDetected: normalized.metaDetected,
      });
    }

    let questions = normalized.questions;
    const steps = [];

    for (let i = 0; i < questions.length; i++) {
      if (!questions[i].category_id && category_id) {
        questions[i].category_id = category_id;
      }
      questions[i].difficulty_score = diffScore;
      questions[i].difficulty = diffInfo.label;
    }

    steps.push(`Schritt 1: ${questions.length} Fragen generiert`);

    if (mode === "better" || mode === "strict") {
      const critiqueResult = await runCritique(apiKey, model, questions);
      if (critiqueResult.ok) {
        const badIndices = critiqueResult.reviews
          .filter((r) => !r.keep)
          .map((r) => questions.findIndex((q) => q.id === r.question_id))
          .filter((i) => i >= 0);

        steps.push(`Schritt 2: Kritik – ${badIndices.length} von ${questions.length} Fragen nicht bestanden`);

        if (mode === "strict" && badIndices.length > 0) {
          const badQuestions = badIndices.map((i) => questions[i]);
          const issues = badIndices.map((i) => {
            const review = critiqueResult.reviews.find((r) => r.question_id === questions[i].id);
            return review ? review.issues.join("; ") : "";
          });

          const rewriteResult = await runRewrite(apiKey, model, badQuestions, issues);
          if (rewriteResult.ok) {
            const rewriteNormalized = normalizeDraft(rewriteResult.content);
            if (rewriteNormalized.ok) {
              for (let j = 0; j < badIndices.length && j < rewriteNormalized.questions.length; j++) {
                questions[badIndices[j]] = rewriteNormalized.questions[j];
              }
              steps.push(`Schritt 3: ${rewriteNormalized.questions.length} Fragen überarbeitet`);
            }
          }
        }

        const beforeFilter = questions.length;
        questions = questions.filter((q) => {
          const review = critiqueResult.reviews.find((r) => r.question_id === q.id);
          return !review || review.keep;
        });
        if (mode === "better") {
          steps.push(`Schritt 2b: ${beforeFilter - questions.length} Fragen verworfen, ${questions.length} verbleiben`);
        }
      }
    }

    for (let i = 0; i < questions.length; i++) {
      questions[i] = shuffleOptions(questions[i]);
    }

    if (mode === "strict" && questions.length > questionCount) {
      questions = questions.slice(0, questionCount);
    }

    const existing = loadExistingQuestions();
    const validation = validateDraft(questions, existing);

    return sendJson(response, 200, {
      questions,
      validation,
      metaDetected: normalized.metaDetected,
      mode,
      generatedCount: questions.length,
      steps,
    });
  } catch (error) {
    return sendJson(response, 500, {
      error: `Fehler bei Generierung: ${error.message}`,
    });
  }
}

async function runCritique(apiKey, model, questions) {
  const critiqueTemplate = await readFile(join(promptsDir, "critique.md"), "utf8");
  const questionsJson = JSON.stringify(questions, null, 2);
  const prompt = critiqueTemplate.replace("{{questions}}", questionsJson);

  return callOpenRouter(apiKey, model, prompt, "Bewerte diese Fragen. Nur JSON.");
}

async function runRewrite(apiKey, model, questions, issues) {
  const rewriteTemplate = await readFile(join(promptsDir, "rewrite.md"), "utf8");
  const prompt = rewriteTemplate
    .replace("{{questions}}", JSON.stringify(questions, null, 2))
    .replace("{{issues}}", issues.join("\n"));

  return callOpenRouter(apiKey, model, prompt, "Verbessere diese Fragen. Nur JSON.");
}

async function callOpenRouter(apiKey, model, systemPrompt, userMessage) {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`OpenRouter error ${res.status}:`, body);
      return {
        ok: false,
        error: `OpenRouter ${res.status}: ${body.slice(0, 1000)}`,
      };
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return { ok: false, error: "Leere Modellantwort." };
    }

    const parsed = extractJsonFromResponse(content);
    if (!parsed) {
      return {
        ok: false,
        error: "Modellantwort enthält kein gültiges JSON.",
        rawContent: content.slice(0, 500),
      };
    }

    return { ok: true, content: parsed };
  } catch (error) {
    if (error.name === "TimeoutError") {
      return {
        ok: false,
        error: "OpenRouter Timeout (120s). Modell möglicherweise überlastet.",
      };
    }
    return { ok: false, error: error.message };
  }
}

async function handleValidate(request, response) {
  const body = await readJsonBody(request);
  if (!body || !Array.isArray(body.questions)) {
    return sendJson(response, 400, { error: "questions-Array fehlt." });
  }
  const existing = loadExistingQuestions();
  const validation = validateDraft(body.questions, existing);
  return sendJson(response, 200, validation);
}

async function handleSaveDraft(request, response) {
  const body = await readJsonBody(request);
  const { questions, category_slug, category_id, category_name } = body;

  if (!Array.isArray(questions) || questions.length === 0) {
    return sendJson(response, 400, { error: "Keine Fragen zum Speichern." });
  }

  const slug = (category_slug || "draft").replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  const filename = buildDraftFilename(slug);
  const generatedDir = ensureGeneratedDir();

  if (!existsSync(generatedDir)) {
    await mkdir(generatedDir, { recursive: true });
  }

  const filePath = join(generatedDir, filename);

  const draftContent = {
    _draft: true,
    _generated_at: new Date().toISOString(),
    _tool: "question-studio",
    category_slug: slug,
    category_id: category_id || "",
    category_name: category_name || "",
    question_count: questions.length,
    questions,
  };

  const tmpPath = `${filePath}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(draftContent, null, 2)}\n`, "utf8");
  await rename(tmpPath, filePath);

  const reviewCommand = `corepack pnpm run review:questions -- ${filePath}`;

  return sendJson(response, 200, {
    saved: true,
    path: filePath,
    filename,
    questionCount: questions.length,
    reviewCommand,
  });
}

async function serveStatic(pathname, response) {
  const safeFiles = ["index.html", "app.js", "styles.css"];
  const fileName = pathname === "/" ? "index.html" : pathname.slice(1);

  if (!safeFiles.includes(fileName)) {
    return sendJson(response, 404, { error: "Nicht gefunden." });
  }

  const filePath = join(publicDir, fileName);
  try {
    const body = await readFile(filePath);
    const ext = fileName.split(".").pop();
    const type = ext === "js" ? "text/javascript" : ext === "css" ? "text/css" : "text/html";
    response.writeHead(200, { "content-type": `${type}; charset=utf-8` });
    response.end(body);
  } catch {
    sendJson(response, 404, { error: "Datei nicht gefunden." });
  }
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "Content-Type",
  });
  response.end(payload ? JSON.stringify(payload) : "");
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

server.listen(PORT, HOST, () => {
  console.log(`\n  Question Studio: http://${HOST}:${PORT}\n`);
  const apiKey = getApiKey();
  if (!apiKey) {
    console.log("  WARNUNG: OPENROUTER_API_KEY nicht gefunden.");
    console.log("  Setze ihn in .env.local oder als Umgebungsvariable.\n");
  }
});

server.on("error", (error) => {
  const detail = error.code === "EADDRINUSE" ? `Port ${PORT} ist bereits belegt.` : error.message;
  console.error(`Konnte Server nicht starten: ${detail}`);
  process.exit(1);
});

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--port") {
      parsed.port = argv[i + 1];
      i += 1;
    } else if (value === "--host") {
      parsed.host = argv[i + 1];
      i += 1;
    }
  }
  return parsed;
}

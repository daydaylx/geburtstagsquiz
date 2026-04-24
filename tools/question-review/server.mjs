#!/usr/bin/env node

import { createServer } from "node:http";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");

const VALID_STATUSES = new Set(["keep", "revise", "remove"]);
const TEXT_KEYS = ["question", "text", "prompt", "frage", "questionText", "body", "title"];
const DIRECT_QUESTION_TEXT_KEYS = ["question", "text", "prompt", "frage", "questionText", "body"];
const ID_KEYS = ["id", "question_id", "questionId", "qid", "uuid", "key", "slug"];
const CATEGORY_KEYS = ["category", "kategorie", "topic", "thema", "round", "section", "gruppe"];
const ANSWER_KEYS = [
  "answer",
  "antwort",
  "correctAnswer",
  "correct_answer",
  "rightAnswer",
  "solution",
  "loesung",
  "lösung",
];
const CORRECT_ID_KEYS = ["correctOptionId", "correct_option_id", "correctId", "correct_id", "correct"];

const args = parseArgs(process.argv.slice(2));
const host = args.host ?? "127.0.0.1";
const port = Number(args.port ?? 4177);

let session = null;
let loadError = null;

if (args.filePath) {
  try {
    await loadQuestions(args.filePath);
  } catch (error) {
    loadError = error.message;
  }
}

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url ?? "/", `http://${host}:${port}`);

    if (request.method === "GET" && requestUrl.pathname === "/api/session") {
      return sendJson(response, 200, getSessionPayload());
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/load") {
      const body = await readJsonBody(request);
      if (!body || typeof body.path !== "string") {
        return sendJson(response, 400, { error: "Bitte einen JSON-Pfad angeben." });
      }
      await loadQuestions(body.path);
      return sendJson(response, 200, getSessionPayload());
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/state") {
      if (!session) {
        return sendJson(response, 400, { error: "Es ist noch keine Fragen-JSON geladen." });
      }

      const body = await readJsonBody(request);
      const questionId = typeof body?.questionId === "string" ? body.questionId : "";
      if (!session.questions.some((question) => question.id === questionId)) {
        return sendJson(response, 400, { error: "Unbekannte Frage." });
      }

      const status = VALID_STATUSES.has(body?.status) ? body.status : null;
      const note = typeof body?.note === "string" ? body.note : "";

      if (!status && note.trim() === "") {
        delete session.state[questionId];
      } else {
        session.state[questionId] = { status, note };
      }

      await saveState();
      return sendJson(response, 200, { state: session.state });
    }

    if (request.method === "GET") {
      const filePath = getStaticPath(requestUrl.pathname);
      if (filePath) {
        return serveStatic(filePath, response);
      }
    }

    sendJson(response, 404, { error: "Nicht gefunden." });
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
});

server.listen(port, host, () => {
  console.log(`Question review tool: http://${host}:${port}`);
  if (args.filePath && loadError) {
    console.error(`Konnte JSON nicht laden: ${loadError}`);
  }
});

server.on("error", (error) => {
  const detail = error.code === "EADDRINUSE" ? `Port ${port} ist bereits belegt.` : error.message;
  console.error(`Konnte Server nicht starten: ${detail}`);
  process.exit(1);
});

function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--port") {
      parsed.port = argv[index + 1];
      index += 1;
    } else if (value === "--host") {
      parsed.host = argv[index + 1];
      index += 1;
    } else if (!value.startsWith("--") && !parsed.filePath) {
      parsed.filePath = value;
    }
  }

  return parsed;
}

async function loadQuestions(inputPath) {
  const sourcePath = path.resolve(process.cwd(), inputPath);
  if (path.basename(sourcePath) === "review_state.json") {
    throw new Error("review_state.json ist der Review-Zustand, nicht die Fragen-JSON.");
  }

  const rawJson = await readFile(sourcePath, "utf8");
  const json = JSON.parse(rawJson);
  const questions = normalizeQuestions(json);

  if (questions.length === 0) {
    throw new Error("Keine Fragen gefunden. Erwartet wird ein Array oder ein Objekt mit Fragen.");
  }

  const statePath = path.join(path.dirname(sourcePath), "review_state.json");
  const state = await readState(statePath);

  session = {
    sourcePath,
    statePath,
    questions,
    state,
  };
  loadError = null;
}

function normalizeQuestions(json) {
  const collected = [];
  collectQuestionObjects(json, "", collected);

  const usedIds = new Map();
  return collected.map(({ item, category }, index) => {
    const baseId = readFirstText(item, ID_KEYS) || `q-${index + 1}`;
    const count = usedIds.get(baseId) ?? 0;
    usedIds.set(baseId, count + 1);
    const id = count === 0 ? baseId : `${baseId}-${count + 1}`;

    return {
      id,
      category: readFirstText(item, CATEGORY_KEYS) || category || "Ohne Kategorie",
      question: readFirstText(item, TEXT_KEYS) || "(Keine Frage gefunden)",
      answer: readAnswer(item),
    };
  });
}

function collectQuestionObjects(value, inheritedCategory, collected) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectQuestionObjects(item, inheritedCategory, collected);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  const category = readCategory(value) || inheritedCategory;
  if (looksLikeQuestion(value)) {
    collected.push({ item: value, category });
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    const childCategory = category || categoryFromObjectKey(key, child);
    collectQuestionObjects(child, childCategory, collected);
  }
}

function categoryFromObjectKey(key, value) {
  if (!Array.isArray(value) || ["questions", "categories", "items", "data"].includes(key)) {
    return "";
  }
  return key;
}

function readCategory(value) {
  const directCategory = readFirstText(value, CATEGORY_KEYS);
  if (directCategory) {
    return directCategory;
  }
  if (Array.isArray(value.questions) && typeof value.name === "string") {
    return value.name;
  }
  return "";
}

function looksLikeQuestion(value) {
  if (DIRECT_QUESTION_TEXT_KEYS.some((key) => value[key] !== undefined)) {
    return true;
  }

  const hasAnswerShape = [...ANSWER_KEYS, ...CORRECT_ID_KEYS, "options", "answers"].some(
    (key) => value[key] !== undefined,
  );
  return value.title !== undefined && hasAnswerShape;
}

function readAnswer(item) {
  const directAnswer = readFirstValue(item, ANSWER_KEYS);
  if (directAnswer !== undefined) {
    return readableValue(directAnswer);
  }

  const options = Array.isArray(item.options) ? item.options : [];
  const correctIds = CORRECT_ID_KEYS.map((key) => item[key]).filter((value) => value !== undefined);
  if (correctIds.length > 0 && options.length > 0) {
    const answers = correctIds.flatMap((value) => idsFromValue(value)).map((id) => optionLabel(options, id) ?? id);
    return answers.join(", ");
  }

  const correctOptions = options.filter(
    (option) => isRecord(option) && (option.correct === true || option.isCorrect === true || option.is_correct === true),
  );
  if (correctOptions.length > 0) {
    return correctOptions.map(readableValue).join(", ");
  }

  if (Array.isArray(item.answers)) {
    return item.answers.map(readableValue).join(", ");
  }

  if (item.correct !== undefined) {
    return readableValue(item.correct);
  }

  return "Keine Antwort gefunden";
}

function idsFromValue(value) {
  if (Array.isArray(value)) {
    return value.flatMap(idsFromValue);
  }
  return [String(value)];
}

function optionLabel(options, wantedId) {
  const match = options.find((option, index) => {
    if (!isRecord(option)) {
      return String(index) === wantedId || String(index + 1) === wantedId || String(option) === wantedId;
    }
    return ["id", "key", "value", "optionId"].some((key) => String(option[key]) === wantedId);
  });

  if (match !== undefined) {
    return readableValue(match);
  }

  const implicitIndex = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".indexOf(wantedId.toUpperCase());
  const implicitOption = options[implicitIndex];
  if (implicitOption !== undefined) {
    return readableValue(implicitOption);
  }

  return null;
}

function readableValue(value) {
  if (Array.isArray(value)) {
    return value.map(readableValue).join(", ");
  }
  if (isRecord(value)) {
    for (const key of ["canonical", "label", "text", "answer", "value", "name", "id"]) {
      if (value[key] !== undefined) {
        return readableValue(value[key]);
      }
    }
    return JSON.stringify(value);
  }
  return String(value);
}

function readFirstText(record, keys) {
  const value = readFirstValue(record, keys);
  if (value === undefined || value === null) {
    return "";
  }
  if (Array.isArray(value)) {
    return value.map(readableValue).join(", ");
  }
  return String(value);
}

function readFirstValue(record, keys) {
  for (const key of keys) {
    if (record[key] !== undefined) {
      return record[key];
    }
  }
  return undefined;
}

async function readState(statePath) {
  try {
    const rawJson = await readFile(statePath, "utf8");
    const parsed = JSON.parse(rawJson);
    if (!isRecord(parsed)) {
      return {};
    }

    const state = {};
    for (const [questionId, entry] of Object.entries(parsed)) {
      if (typeof entry === "string" && VALID_STATUSES.has(entry)) {
        state[questionId] = { status: entry, note: "" };
      } else if (isRecord(entry)) {
        const status = VALID_STATUSES.has(entry.status) ? entry.status : null;
        const note = typeof entry.note === "string" ? entry.note : "";
        if (status || note) {
          state[questionId] = { status, note };
        }
      }
    }
    return state;
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

async function saveState() {
  const orderedState = {};
  for (const question of session.questions) {
    if (session.state[question.id]) {
      orderedState[question.id] = session.state[question.id];
    }
  }

  const temporaryPath = `${session.statePath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(orderedState, null, 2)}\n`, "utf8");
  await rename(temporaryPath, session.statePath);
}

function getSessionPayload() {
  return {
    loaded: Boolean(session),
    error: loadError,
    sourcePath: session?.sourcePath ?? null,
    statePath: session?.statePath ?? null,
    questions: session?.questions ?? [],
    state: session?.state ?? {},
  };
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const rawBody = Buffer.concat(chunks).toString("utf8");
  return rawBody ? JSON.parse(rawBody) : {};
}

function getStaticPath(requestPath) {
  const fileName = requestPath === "/" ? "index.html" : requestPath.slice(1);
  if (!["index.html", "app.js", "styles.css"].includes(fileName)) {
    return null;
  }
  return path.join(publicDir, fileName);
}

async function serveStatic(filePath, response) {
  const body = await readFile(filePath);
  const extension = path.extname(filePath);
  const type = extension === ".js" ? "text/javascript" : extension === ".css" ? "text/css" : "text/html";
  response.writeHead(200, { "content-type": `${type}; charset=utf-8` });
  response.end(body);
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

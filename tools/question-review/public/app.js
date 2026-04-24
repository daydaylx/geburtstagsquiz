const STATUS_LABELS = {
  keep: "Behalten",
  revise: "Überarbeiten",
  remove: "Entfernen",
  open: "Offen",
};

const elements = {
  loadForm: document.querySelector("#load-form"),
  pathInput: document.querySelector("#json-path"),
  paths: document.querySelector("#paths"),
  message: document.querySelector("#message"),
  review: document.querySelector("#review"),
  progressText: document.querySelector("#progress-text"),
  currentText: document.querySelector("#current-text"),
  progressFill: document.querySelector("#progress-fill"),
  filter: document.querySelector("#filter"),
  category: document.querySelector("#category"),
  statusLabel: document.querySelector("#status-label"),
  question: document.querySelector("#question"),
  answer: document.querySelector("#answer"),
  note: document.querySelector("#note"),
  previous: document.querySelector("#previous"),
  next: document.querySelector("#next"),
  statusButtons: [...document.querySelectorAll("[data-status]")],
};

let questions = [];
let state = {};
let sourcePath = null;
let statePath = null;
let currentQuestionId = null;
let noteSaveTimer = null;

elements.loadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const path = elements.pathInput.value.trim();
  if (!path) {
    showMessage("Bitte einen Pfad zur Fragen-JSON eingeben.");
    return;
  }

  try {
    const session = await postJson("/api/load", { path });
    applySession(session);
  } catch (error) {
    showMessage(error.message);
  }
});

elements.filter.addEventListener("change", () => {
  if (!filteredQuestions().some((question) => question.id === currentQuestionId)) {
    currentQuestionId = filteredQuestions()[0]?.id ?? null;
  }
  render();
});

elements.previous.addEventListener("click", () => move(-1));
elements.next.addEventListener("click", () => move(1));

for (const button of elements.statusButtons) {
  button.addEventListener("click", () => setStatus(button.dataset.status));
}

elements.note.addEventListener("input", () => {
  const question = currentQuestion();
  if (!question) {
    return;
  }

  const entry = state[question.id] ?? { status: null, note: "" };
  entry.note = elements.note.value;
  state[question.id] = entry;
  queueSave(question.id);
});

elements.note.addEventListener("blur", () => {
  const question = currentQuestion();
  if (question) {
    saveQuestionState(question.id);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
    return;
  }

  const key = event.key.toLowerCase();
  if (key === "arrowleft" || key === "a") {
    event.preventDefault();
    move(-1);
  } else if (key === "arrowright" || key === "d") {
    event.preventDefault();
    move(1);
  } else if (key === "1") {
    event.preventDefault();
    setStatus("keep");
  } else if (key === "2") {
    event.preventDefault();
    setStatus("revise");
  } else if (key === "3") {
    event.preventDefault();
    setStatus("remove");
  }
});

loadInitialSession();

async function loadInitialSession() {
  try {
    const response = await fetch("/api/session");
    const session = await response.json();
    applySession(session);
  } catch (error) {
    showMessage(error.message);
  }
}

function applySession(session) {
  questions = session.questions ?? [];
  state = session.state ?? {};
  sourcePath = session.sourcePath;
  statePath = session.statePath;
  currentQuestionId = questions[0]?.id ?? null;

  if (session.error) {
    showMessage(session.error);
  } else {
    hideMessage();
  }

  if (sourcePath) {
    elements.pathInput.value = sourcePath;
  }

  render();
}

function render() {
  elements.paths.textContent = sourcePath
    ? `Quelle: ${sourcePath} · Zustand: ${statePath}`
    : "Keine JSON geladen";
  elements.review.hidden = questions.length === 0;

  const list = filteredQuestions();
  const question = currentQuestion();
  if (!question || list.length === 0) {
    elements.question.textContent = "Keine Frage im Filter";
    elements.answer.textContent = "";
    elements.category.textContent = "";
    elements.statusLabel.textContent = "";
    elements.progressText.textContent = `${reviewedCount()} / ${questions.length}`;
    elements.currentText.textContent = "Keine Frage";
    elements.progressFill.style.width = progressWidth();
    return;
  }

  const entry = state[question.id] ?? {};
  const status = entry.status ?? "open";
  const position = questions.findIndex((item) => item.id === question.id) + 1;

  elements.category.textContent = question.category;
  elements.statusLabel.textContent = STATUS_LABELS[status];
  elements.statusLabel.dataset.status = status;
  elements.question.textContent = question.question;
  elements.answer.textContent = question.answer;
  elements.note.value = entry.note ?? "";
  elements.progressText.textContent = `${reviewedCount()} / ${questions.length}`;
  elements.currentText.textContent = `Frage ${position} von ${questions.length}`;
  elements.progressFill.style.width = progressWidth();

  const filteredIndex = list.findIndex((item) => item.id === question.id);
  elements.previous.disabled = filteredIndex <= 0;
  elements.next.disabled = filteredIndex === list.length - 1;

  for (const button of elements.statusButtons) {
    button.classList.toggle("active", button.dataset.status === entry.status);
  }
}

function filteredQuestions() {
  const filter = elements.filter.value;
  if (filter === "all") {
    return questions;
  }
  if (filter === "open") {
    return questions.filter((question) => !state[question.id]?.status);
  }
  return questions.filter((question) => state[question.id]?.status === filter);
}

function currentQuestion() {
  const list = filteredQuestions();
  if (!currentQuestionId || !list.some((question) => question.id === currentQuestionId)) {
    currentQuestionId = list[0]?.id ?? null;
  }
  return list.find((question) => question.id === currentQuestionId) ?? null;
}

function move(step) {
  const list = filteredQuestions();
  const index = list.findIndex((question) => question.id === currentQuestionId);
  const nextIndex = index + step;
  if (nextIndex < 0 || nextIndex >= list.length) {
    return;
  }
  currentQuestionId = list[nextIndex].id;
  render();
}

function setStatus(status) {
  const question = currentQuestion();
  if (!question) {
    return;
  }

  const entry = state[question.id] ?? { status: null, note: "" };
  entry.status = status;
  state[question.id] = entry;
  saveQuestionState(question.id);
  render();
}

function queueSave(questionId) {
  clearTimeout(noteSaveTimer);
  noteSaveTimer = setTimeout(() => saveQuestionState(questionId), 300);
}

async function saveQuestionState(questionId) {
  clearTimeout(noteSaveTimer);
  const entry = state[questionId] ?? { status: null, note: "" };
  try {
    const result = await postJson("/api/state", {
      questionId,
      status: entry.status ?? null,
      note: entry.note ?? "",
    });
    state = result.state ?? state;
  } catch (error) {
    showMessage(error.message);
  }
}

function reviewedCount() {
  return questions.filter((question) => state[question.id]?.status).length;
}

function progressWidth() {
  if (questions.length === 0) {
    return "0%";
  }
  return `${Math.round((reviewedCount() / questions.length) * 100)}%`;
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? "Anfrage fehlgeschlagen.");
  }
  return payload;
}

function showMessage(text) {
  elements.message.hidden = false;
  elements.message.textContent = text;
}

function hideMessage() {
  elements.message.hidden = true;
  elements.message.textContent = "";
}

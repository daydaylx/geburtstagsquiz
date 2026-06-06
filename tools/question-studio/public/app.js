(() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  const state = {
    categories: [],
    models: [],
    rules: {},
    generatedQuestions: [],
    questionStatuses: {},
    selectedCategory: null,
    isGenerating: false,
  };

  const el = {
    apiStatus: $("#api-status"),
    btnRefreshModels: $("#btn-refresh-models"),
    selectCategory: $("#select-category"),
    selectModel: $("#select-model"),
    selectMode: $("#select-mode"),
    selectDifficulty: $("#select-difficulty"),
    inputCount: $("#input-count"),
    rulesCheckboxes: $("#rules-checkboxes"),
    textareaCustomRules: $("#textarea-custom-rules"),
    btnGenerate: $("#btn-generate"),
    generateStatus: $("#generate-status"),
    viewGenerator: $("#view-generator"),
    viewResults: $("#view-results"),
    viewSaved: $("#view-saved"),
    resultCount: $("#result-count"),
    validationSummary: $("#validation-summary"),
    resultsList: $("#results-list"),
    btnSelectAll: $("#btn-select-all"),
    btnDiscardAll: $("#btn-discard-all"),
    btnSaveDraft: $("#btn-save-draft"),
    saveStatus: $("#save-status"),
    btnBack: $("#btn-back"),
    saveConfirmation: $("#save-confirmation"),
    btnNewGenerate: $("#btn-new-generate"),
  };

  function showView(name) {
    el.viewGenerator.classList.toggle("hidden", name !== "generator");
    el.viewResults.classList.toggle("hidden", name !== "results");
    el.viewSaved.classList.toggle("hidden", name !== "saved");
  }

  async function api(method, path, body) {
    const opts = { method, headers: { "Content-Type": "application/json" } };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(`/api${path}`, opts);
    return res.json();
  }

  async function init() {
    await Promise.all([
      loadStatus(),
      loadCategories(),
      loadModels(),
      loadRules(),
    ]);
    updateGenerateButton();
  }

  async function loadStatus() {
    try {
      const data = await api("GET", "/status");
      if (data.hasApiKey) {
        el.apiStatus.textContent = `API-Key: vorhanden (${data.apiKeyLength} Zeichen)`;
        el.apiStatus.className = "status-ok";
      } else {
        el.apiStatus.textContent =
          "API-Key: FEHLT (setze OPENROUTER_API_KEY in .env.local)";
        el.apiStatus.className = "status-error";
      }
    } catch {
      el.apiStatus.textContent = "Server nicht erreichbar";
      el.apiStatus.className = "status-error";
    }
  }

  async function loadCategories() {
    try {
      state.categories = await api("GET", "/categories");
      renderCategories();
    } catch {
      /* ignore */
    }
  }

  function renderCategories() {
    el.selectCategory.innerHTML =
      '<option value="">-- Kategorie wählen --</option>';
    for (const cat of state.categories) {
      const opt = document.createElement("option");
      opt.value = cat.category_id;
      opt.textContent = `${cat.name} (${cat.question_count} Fragen)`;
      opt.dataset.slug = cat.slug;
      opt.dataset.name = cat.name;
      el.selectCategory.appendChild(opt);
    }
  }

  async function loadModels() {
    el.selectModel.innerHTML = '<option value="">Lade Modelle...</option>';
    try {
      const data = await api("GET", "/models");
      if (data.error && (!data.models || data.models.length === 0)) {
        el.selectModel.innerHTML = `<option value="">Fehler: ${data.error}</option>`;
        return;
      }
      state.models = data.models || [];
      renderModels();
    } catch {
      el.selectModel.innerHTML = '<option value="">Fehler beim Laden</option>';
    }
  }

  function renderModels() {
    el.selectModel.innerHTML = "";
    if (state.models.length === 0) {
      el.selectModel.innerHTML =
        '<option value="">Keine Free-Modelle gefunden</option>';
      return;
    }
    for (const m of state.models) {
      const opt = document.createElement("option");
      opt.value = m.id;
      const ctx = m.context_length
        ? ` [${(m.context_length / 1000).toFixed(0)}k ctx]`
        : "";
      opt.textContent = `${m.name}${ctx}`;
      el.selectModel.appendChild(opt);
    }
  }

  async function loadRules() {
    try {
      state.rules = await api("GET", "/rules");
      renderRules();
    } catch {
      /* ignore */
    }
  }

  function renderRules() {
    el.rulesCheckboxes.innerHTML = "";
    for (const [key, label] of Object.entries(state.rules)) {
      const lbl = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = key;
      input.checked = true;
      input.addEventListener("change", updateGenerateButton);
      lbl.appendChild(input);
      lbl.appendChild(document.createTextNode(` ${label}`));
      el.rulesCheckboxes.appendChild(lbl);
    }
  }

  function updateGenerateButton() {
    const hasModel = el.selectModel.value !== "";
    const hasCategory = el.selectCategory.value !== "";
    el.btnGenerate.disabled = state.isGenerating || !hasModel || !hasCategory;
  }

  function getSelectedCategoryInfo() {
    const opt = el.selectCategory.selectedOptions[0];
    if (!opt) return {};
    return {
      category_id: opt.value,
      category_name: opt.dataset.name || opt.textContent,
      category_slug: opt.dataset.slug || "",
    };
  }

  async function handleGenerate() {
    const catInfo = getSelectedCategoryInfo();
    const model = el.selectModel.value;
    const mode = el.selectMode.value;
    const difficultyScore = Number(el.selectDifficulty.value);
    const count = Number(el.inputCount.value);
    const checkedRules = $$("#rules-checkboxes input:checked").map(
      (i) => i.value,
    );
    const customRules = el.textareaCustomRules.value.trim();

    state.isGenerating = true;
    updateGenerateButton();
    el.generateStatus.textContent = `Generiere ${count} Fragen (Modus: ${mode})...`;
    el.generateStatus.className = "status-text";

    try {
      const data = await api("POST", "/generate", {
        model,
        count,
        difficulty_score: difficultyScore,
        quality_mode: mode,
        rules: checkedRules,
        custom_rules: customRules,
        ...catInfo,
      });

      if (data.error) {
        el.generateStatus.textContent = `Fehler: ${data.error}`;
        el.generateStatus.className = "status-text status-error";
        return;
      }

      state.generatedQuestions = data.questions || [];
      state.questionStatuses = {};
      for (const q of state.generatedQuestions) {
        state.questionStatuses[q.id] = "keep";
      }

      if (data.steps && data.steps.length > 0) {
        el.generateStatus.textContent = data.steps.join(" → ");
        el.generateStatus.className = "status-text";
      }

      renderResults(data.validation, data.metaDetected);
      showView("results");
    } catch (error) {
      el.generateStatus.textContent = `Fehler: ${error.message}`;
      el.generateStatus.className = "status-text status-error";
    } finally {
      state.isGenerating = false;
      updateGenerateButton();
    }
  }

  function renderResults(validation, metaDetected) {
    const errors = validation?.errors || [];
    const warnings = validation?.warnings || [];
    const keptCount = state.generatedQuestions.filter(
      (q) => state.questionStatuses[q.id] !== "discard",
    ).length;
    el.resultCount.textContent = `(${state.generatedQuestions.length} Fragen, ${keptCount} behalten)`;

    let summaryHtml = "";
    if (metaDetected) {
      summaryHtml +=
        '<div class="validation-warnings" style="margin-bottom:0.5rem">Warnung: Modell hat Meta-Text/Markdown in der Antwort, wurde automatisch bereinigt.</div>';
    }
    if (errors.length === 0 && warnings.length === 0) {
      summaryHtml +=
        '<div class="validation-ok">Alle Fragen haben die Validierung bestanden.</div>';
    } else {
      if (errors.length > 0) {
        summaryHtml += `<div class="validation-errors" style="margin-bottom:0.5rem">${errors.length} Fehler gefunden. Fragen mit Fehlern sollten verworfen werden.</div>`;
      }
      if (warnings.length > 0) {
        summaryHtml += `<div class="validation-warnings">${warnings.length} Warnungen. Prüfe die markierten Fragen.</div>`;
      }
    }
    el.validationSummary.innerHTML = summaryHtml;

    el.resultsList.innerHTML = "";
    for (let i = 0; i < state.generatedQuestions.length; i++) {
      el.resultsList.appendChild(
        renderQuestionCard(state.generatedQuestions[i], i, errors, warnings),
      );
    }
    updateSaveButton();
  }

  function renderQuestionCard(q, index, allErrors, allWarnings) {
    const card = document.createElement("div");
    card.className = `question-card${state.questionStatuses[q.id] === "discard" ? " discarded" : ""}`;
    card.dataset.id = q.id;

    const status = state.questionStatuses[q.id] || "keep";
    const qErrors = allErrors.filter((e) => e.questionIndex === index);
    const qWarnings = allWarnings.filter((w) => w.questionIndex === index);
    const opts = q.options || [];
    const correctId = q.correct_option_id;

    let optionsHtml = "";
    for (const opt of opts) {
      const isCorrect = opt.id === correctId || opt.is_correct;
      optionsHtml += `<li class="${isCorrect ? "correct" : ""}">${escapeHtml(opt.text)}</li>`;
    }

    let errorsHtml = "";
    for (const e of qErrors) {
      errorsHtml += `<span class="error-item">${escapeHtml(e.message)}</span>`;
    }

    let warningsHtml = "";
    for (const w of qWarnings) {
      warningsHtml += `<span class="warning-item">⚠ ${escapeHtml(w.message)}</span>`;
    }

    card.innerHTML = `
      <div class="q-header">
        <span class="q-id">${q.id}</span>
        <span class="q-meta">
          <span>Schwierigkeit: ${q.difficulty_score || "?"}</span>
          <span>${q.type}</span>
        </span>
      </div>
      <div class="q-prompt">${escapeHtml(q.prompt)}</div>
      <ul class="q-options">${optionsHtml}</ul>
      <div class="q-explanation">${escapeHtml(q.explanation || "(keine Erklärung)")}</div>
      ${errorsHtml ? `<div class="q-errors">${errorsHtml}</div>` : ""}
      ${warningsHtml ? `<div class="q-warnings">${warningsHtml}</div>` : ""}
      <div class="q-actions">
        <button class="btn-small btn-keep${status === "keep" ? " btn-active" : ""}" data-action="keep">Behalten</button>
        <button class="btn-small btn-unsure${status === "unsure" ? " btn-active" : ""}" data-action="unsure">Unsicher</button>
        <button class="btn-small btn-discard${status === "discard" ? " btn-active" : ""}" data-action="discard">Verwerfen</button>
      </div>
    `;

    card.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.dataset.action;
        state.questionStatuses[q.id] = action;
        card.classList.toggle("discarded", action === "discard");
        card
          .querySelectorAll("[data-action]")
          .forEach((b) => b.classList.remove("btn-active"));
        btn.classList.add("btn-active");
        updateSaveButton();
      });
    });

    return card;
  }

  function updateSaveButton() {
    const keptCount = state.generatedQuestions.filter(
      (q) => state.questionStatuses[q.id] !== "discard",
    ).length;
    el.btnSaveDraft.disabled = keptCount === 0;
    el.resultCount.textContent = `(${state.generatedQuestions.length} Fragen, ${keptCount} behalten)`;
  }

  async function handleSaveDraft() {
    const keptQuestions = state.generatedQuestions.filter(
      (q) => state.questionStatuses[q.id] !== "discard",
    );
    if (keptQuestions.length === 0) return;

    const catInfo = getSelectedCategoryInfo();
    el.btnSaveDraft.disabled = true;
    el.saveStatus.textContent = "Speichere Draft...";

    try {
      const data = await api("POST", "/save-draft", {
        questions: keptQuestions,
        category_slug: catInfo.category_slug || "draft",
        category_id: catInfo.category_id || "",
        category_name: catInfo.category_name || "",
      });

      if (data.error) {
        el.saveStatus.textContent = `Fehler: ${data.error}`;
        el.btnSaveDraft.disabled = false;
        return;
      }

      el.saveConfirmation.innerHTML = `
        <p><strong>Gespeichert:</strong> ${data.questionCount} Fragen</p>
        <p>Pfad: <code>${escapeHtml(data.path)}</code></p>
        <p style="margin-top:1rem">Nächster Schritt — Review:</p>
        <p><code>${escapeHtml(data.reviewCommand)}</code></p>
      `;
      showView("saved");
    } catch (error) {
      el.saveStatus.textContent = `Fehler: ${error.message}`;
      el.btnSaveDraft.disabled = false;
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  el.btnRefreshModels.addEventListener("click", loadModels);
  el.selectCategory.addEventListener("change", updateGenerateButton);
  el.selectModel.addEventListener("change", updateGenerateButton);
  el.btnGenerate.addEventListener("click", handleGenerate);
  el.btnSelectAll.addEventListener("click", () => {
    for (const q of state.generatedQuestions)
      state.questionStatuses[q.id] = "keep";
    $$(".question-card").forEach((c) => c.classList.remove("discarded"));
    updateSaveButton();
  });
  el.btnDiscardAll.addEventListener("click", () => {
    for (const q of state.generatedQuestions)
      state.questionStatuses[q.id] = "discard";
    $$(".question-card").forEach((c) => c.classList.add("discarded"));
    updateSaveButton();
  });
  el.btnSaveDraft.addEventListener("click", handleSaveDraft);
  el.btnBack.addEventListener("click", () => showView("generator"));
  el.btnNewGenerate.addEventListener("click", () => {
    state.generatedQuestions = [];
    state.questionStatuses = {};
    showView("generator");
    el.generateStatus.textContent = "";
  });
  init();
})();

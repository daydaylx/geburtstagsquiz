import { describe, expect, it } from "vitest";
import {
  buildDraftFilename,
  ensureGeneratedDir,
  extractJsonFromResponse,
  filterFreeModels,
  normalizeDraft,
  shuffleOptions,
  validateDraft,
} from "./validator.mjs";

function makeValidQuestion(overrides = {}) {
  return {
    id: "q-test-01-abc123",
    type: "multiple_choice",
    prompt: "Was ist die Hauptstadt von Deutschland?",
    options: [
      { id: "q-test-01-abc123-opt-1", text: "Berlin", is_correct: true },
      { id: "q-test-01-abc123-opt-2", text: "München", is_correct: false },
      { id: "q-test-01-abc123-opt-3", text: "Hamburg", is_correct: false },
      { id: "q-test-01-abc123-opt-4", text: "Köln", is_correct: false },
    ],
    correct_option_id: "q-test-01-abc123-opt-1",
    explanation: "Berlin ist seit 1991 wieder die Hauptstadt.",
    difficulty: "medium",
    difficulty_score: 3,
    category_id: "cat-test",
    points: 1,
    ...overrides,
  };
}

function makeValidDraft(questions) {
  return questions || [makeValidQuestion()];
}

describe("normalizeDraft", () => {
  it("accepts valid JSON array", () => {
    const result = normalizeDraft([makeValidQuestion()]);
    expect(result.ok).toBe(true);
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].prompt).toBe("Was ist die Hauptstadt von Deutschland?");
  });

  it("accepts object with questions array", () => {
    const result = normalizeDraft({ questions: [makeValidQuestion()] });
    expect(result.ok).toBe(true);
    expect(result.questions).toHaveLength(1);
  });

  it("rejects completely invalid input", () => {
    const result = normalizeDraft("not json at all");
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("extracts JSON from markdown code block", () => {
    const raw =
      '```json\n[{"id":"q-1","prompt":"Test?","options":[{"id":"o1","text":"A","is_correct":true},{"id":"o2","text":"B","is_correct":false},{"id":"o3","text":"C","is_correct":false},{"id":"o4","text":"D","is_correct":false}],"correct_option_id":"o1","explanation":"Test.","difficulty":"medium","difficulty_score":3,"category_id":"cat-test","points":1,"type":"multiple_choice"}]\n```';
    const result = normalizeDraft(raw);
    expect(result.ok).toBe(true);
    expect(result.questions).toHaveLength(1);
  });

  it("generates IDs for questions without ids", () => {
    const q = makeValidQuestion();
    delete q.id;
    const result = normalizeDraft([q]);
    expect(result.ok).toBe(true);
    expect(result.questions[0].id).toMatch(/^q-gen-/);
  });

  it("normalizes string options to objects", () => {
    const result = normalizeDraft([
      {
        prompt: "Test?",
        options: ["A", "B", "C", "D"],
        correct_option_id: "",
        explanation: "Expl.",
        type: "multiple_choice",
      },
    ]);
    expect(result.ok).toBe(true);
    expect(result.questions[0].options[0]).toEqual({
      id: expect.stringContaining("-opt-1"),
      text: "A",
      is_correct: false,
    });
  });
});

describe("validateDraft", () => {
  it("accepts valid draft", () => {
    const result = validateDraft(makeValidDraft());
    expect(result.errors).toHaveLength(0);
  });

  it("rejects empty draft", () => {
    const result = validateDraft([]);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects question without correct option", () => {
    const q = makeValidQuestion();
    q.options.forEach((o) => {
      o.is_correct = false;
    });
    q.correct_option_id = "";
    const result = validateDraft([q]);
    expect(result.errors.some((e) => e.code === "NO_CORRECT_OPTION")).toBe(true);
  });

  it("rejects question with two correct options", () => {
    const q = makeValidQuestion();
    q.options[0].is_correct = true;
    q.options[1].is_correct = true;
    const result = validateDraft([q]);
    expect(result.errors.some((e) => e.code === "MULTIPLE_CORRECT")).toBe(true);
  });

  it("rejects question with wrong option count", () => {
    const q = makeValidQuestion();
    q.options = q.options.slice(0, 2);
    const result = validateDraft([q]);
    expect(result.errors.some((e) => e.code === "WRONG_OPTION_COUNT")).toBe(true);
  });

  it("rejects broken correct_option_id reference", () => {
    const q = makeValidQuestion();
    q.correct_option_id = "nonexistent";
    const result = validateDraft([q]);
    expect(result.errors.some((e) => e.code === "BROKEN_CORRECT_REF")).toBe(true);
  });

  it("rejects mismatched correct_option_id vs is_correct", () => {
    const q = makeValidQuestion();
    q.options[0].is_correct = true;
    q.correct_option_id = q.options[1].id;
    const result = validateDraft([q]);
    expect(result.errors.some((e) => e.code === "MISMATCH_CORRECT")).toBe(true);
  });

  it("rejects invalid difficulty_score", () => {
    const q = makeValidQuestion({ difficulty_score: 7 });
    const result = validateDraft([q]);
    expect(result.errors.some((e) => e.code === "INVALID_DIFFICULTY")).toBe(true);
  });

  it("warns on uneven option lengths", () => {
    const q = makeValidQuestion();
    q.options[0].text = "A";
    q.options[1].text = "Ein sehr sehr sehr sehr sehr langer Antworttext der deutlich länger ist";
    q.options[2].text = "B";
    q.options[3].text = "C";
    const result = validateDraft([q]);
    expect(result.warnings.some((w) => w.code === "UNEVEN_OPTION_LENGTH")).toBe(true);
  });

  it("warns on thin explanation", () => {
    const q = makeValidQuestion({ explanation: "Ja" });
    const result = validateDraft([q]);
    expect(result.warnings.some((w) => w.code === "THIN_EXPLANATION")).toBe(true);
  });

  it("detects internal duplicates", () => {
    const q1 = makeValidQuestion({ id: "q-1" });
    const q2 = makeValidQuestion({ id: "q-2" });
    const result = validateDraft([q1, q2]);
    expect(result.errors.some((e) => e.code === "INTERNAL_DUPLICATE")).toBe(true);
  });

  it("detects duplicates against existing questions", () => {
    const q = makeValidQuestion();
    const existing = [{ id: "q-old", prompt: "Was ist die Hauptstadt von Deutschland?", text: "" }];
    const result = validateDraft([q], existing);
    expect(result.warnings.some((w) => w.code === "EXISTING_DUPLICATE")).toBe(true);
  });

  it("warns about meta text in raw response", () => {
    const raw =
      '```json\n[{"id":"q-1","prompt":"T?","options":[{"id":"o1","text":"A","is_correct":true},{"id":"o2","text":"B","is_correct":false},{"id":"o3","text":"C","is_correct":false},{"id":"o4","text":"D","is_correct":false}],"correct_option_id":"o1","explanation":"Expl.","difficulty":"medium","difficulty_score":3,"category_id":"c1","points":1,"type":"multiple_choice"}]\n```\nHier noch etwas Text.';
    const result = normalizeDraft(raw);
    expect(result.ok).toBe(true);
    expect(result.metaDetected).toBe(true);
  });
});

describe("shuffleOptions", () => {
  it("preserves correct_option_id after shuffle", () => {
    const q = makeValidQuestion();
    const correctId = q.correct_option_id;
    const correctText = q.options.find((o) => o.id === correctId).text;

    for (let i = 0; i < 20; i++) {
      const shuffled = shuffleOptions(q);
      const newCorrectOpt = shuffled.options.find((o) => o.id === shuffled.correct_option_id);
      expect(newCorrectOpt).toBeDefined();
      expect(newCorrectOpt.text).toBe(correctText);
      expect(newCorrectOpt.is_correct).toBe(true);
    }
  });

  it("preserves all options", () => {
    const q = makeValidQuestion();
    const shuffled = shuffleOptions(q);
    const originalTexts = q.options.map((o) => o.text).sort();
    const shuffledTexts = shuffled.options.map((o) => o.text).sort();
    expect(shuffledTexts).toEqual(originalTexts);
  });
});

describe("filterFreeModels", () => {
  it("filters models with zero pricing", () => {
    const models = [
      { id: "paid-model", pricing: { prompt: "0.001", completion: "0.002" } },
      { id: "free-model", pricing: { prompt: "0", completion: "0" } },
      { id: "free-colon", id_include: "provider:free", pricing: { prompt: "0", completion: "0" } },
    ];
    const free = filterFreeModels(models);
    expect(free).toHaveLength(2);
    expect(free.map((m) => m.id)).toEqual(["free-model", "free-colon"]);
  });

  it("returns empty for empty input", () => {
    expect(filterFreeModels([])).toEqual([]);
    expect(filterFreeModels(null)).toEqual([]);
  });

  it("excludes models with only partial free pricing", () => {
    const models = [{ id: "partial", pricing: { prompt: "0", completion: "0.001" } }];
    expect(filterFreeModels(models)).toHaveLength(0);
  });
});

describe("extractJsonFromResponse", () => {
  it("parses clean JSON array", () => {
    const result = extractJsonFromResponse('[{"id":"q1"}]');
    expect(result).toEqual([{ id: "q1" }]);
  });

  it("parses JSON from markdown block", () => {
    const result = extractJsonFromResponse('Hier ist JSON:\n```json\n[{"id":"q1"}]\n```\nFertig.');
    expect(result).toEqual([{ id: "q1" }]);
  });

  it("returns null for non-JSON", () => {
    expect(extractJsonFromResponse("no json here")).toBeNull();
  });

  it("handles JSON with leading text", () => {
    const result = extractJsonFromResponse('Sure! [{"id":"q1"}]');
    expect(result).toEqual([{ id: "q1" }]);
  });
});

describe("buildDraftFilename", () => {
  it("builds correct filename pattern", () => {
    const name = buildDraftFilename("test-category");
    expect(name).toMatch(/^test-category-draft-\d{4}-\d{2}-\d{2}-\d{4}\.json$/);
  });
});

describe("ensureGeneratedDir", () => {
  it("returns path ending with generated", () => {
    const dir = ensureGeneratedDir();
    expect(dir).toMatch(/data\/quiz\/questions\/generated$/);
  });
});

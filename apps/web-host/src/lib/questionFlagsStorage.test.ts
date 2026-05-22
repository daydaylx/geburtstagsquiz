import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAllFlags,
  loadFlags,
  type QuestionFlag,
  removeFlag,
  saveFlag,
  updateFlag,
} from "./questionFlagsStorage.js";

const STORAGE_KEY = "geburtstagsquiz:host-question-flags:v1";

function makeFlag(overrides: Partial<QuestionFlag> = {}): QuestionFlag {
  return {
    questionId: "q1",
    questionIndex: 0,
    totalQuestionCount: 10,
    text: "Testfrage?",
    type: "multiple_choice",
    markedAt: "2026-05-22T12:00:00.000Z",
    markedDuringScreen: "question",
    reason: "unclear",
    note: "",
    ...overrides,
  };
}

let store: Record<string, string>;
const storageMock = {
  getItem: (key: string) => (store as Record<string, string>)[key] ?? null,
  setItem: (key: string, value: string) => {
    (store as Record<string, string>)[key] = value;
  },
  removeItem: (key: string) => {
    delete (store as Record<string, string>)[key];
  },
  clear: () => {
    store = {};
  },
  get length() {
    return Object.keys(store).length;
  },
  key: (_index: number) => null,
};

beforeEach(() => {
  store = {};
  vi.stubGlobal("window", { localStorage: storageMock });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadFlags", () => {
  it("returns empty array when storage is empty", () => {
    expect(loadFlags()).toEqual([]);
  });

  it("returns valid flags and filters invalid ones", () => {
    const valid = makeFlag();
    const invalid = { questionId: 123, text: "bad" };
    store[STORAGE_KEY] = JSON.stringify([valid, invalid]);
    const result = loadFlags();
    expect(result).toHaveLength(1);
    expect(result[0].questionId).toBe("q1");
  });

  it("returns empty array for non-array JSON", () => {
    store[STORAGE_KEY] = JSON.stringify({ not: "an array" });
    expect(loadFlags()).toEqual([]);
  });

  it("returns empty array for unparseable JSON", () => {
    store[STORAGE_KEY] = "not json{{{";
    expect(loadFlags()).toEqual([]);
  });

  it("returns empty array for null", () => {
    store[STORAGE_KEY] = "null";
    expect(loadFlags()).toEqual([]);
  });
});

describe("saveFlag", () => {
  it("persists a new flag", () => {
    const result = saveFlag(makeFlag());
    expect(result).toHaveLength(1);
    expect(result[0].questionId).toBe("q1");
    const stored = JSON.parse(store[STORAGE_KEY]);
    expect(stored).toHaveLength(1);
  });

  it("replaces existing flag with same questionId", () => {
    saveFlag(makeFlag());
    const result = saveFlag(makeFlag({ reason: "updated", note: "changed" }));
    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe("updated");
    expect(result[0].note).toBe("changed");
  });

  it("keeps multiple flags with different questionIds", () => {
    saveFlag(makeFlag({ questionId: "q1" }));
    saveFlag(makeFlag({ questionId: "q2" }));
    const result = loadFlags();
    expect(result).toHaveLength(2);
  });
});

describe("updateFlag", () => {
  it("merges partial fields into existing flag", () => {
    saveFlag(makeFlag());
    const result = updateFlag("q1", { reason: "wrong_answer", note: "falsch" });
    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe("wrong_answer");
    expect(result[0].note).toBe("falsch");
    expect(result[0].text).toBe("Testfrage?");
  });

  it("returns unchanged list for unknown questionId", () => {
    saveFlag(makeFlag());
    const result = updateFlag("unknown", { reason: "x" });
    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe("unclear");
  });
});

describe("removeFlag", () => {
  it("removes the targeted flag", () => {
    saveFlag(makeFlag({ questionId: "q1" }));
    saveFlag(makeFlag({ questionId: "q2" }));
    const result = removeFlag("q1");
    expect(result).toHaveLength(1);
    expect(result[0].questionId).toBe("q2");
  });

  it("returns unchanged list for unknown questionId", () => {
    saveFlag(makeFlag());
    const result = removeFlag("unknown");
    expect(result).toHaveLength(1);
  });
});

describe("clearAllFlags", () => {
  it("removes all flags from storage", () => {
    saveFlag(makeFlag({ questionId: "q1" }));
    saveFlag(makeFlag({ questionId: "q2" }));
    const result = clearAllFlags();
    expect(result).toEqual([]);
    expect(loadFlags()).toEqual([]);
  });
});

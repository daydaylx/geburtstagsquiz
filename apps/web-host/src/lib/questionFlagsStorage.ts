const STORAGE_KEY = "privatquiz:host-question-flags:v1";

export interface QuestionFlag {
  questionId: string;
  questionIndex: number;
  totalQuestionCount: number | null;
  text: string;
  type: string;
  options?: Array<{ id: string; label: string }>;
  items?: Array<{ id: string; label: string }>;
  unit?: string;
  correctAnswer?: unknown;
  explanation?: string | null;
  markedAt: string;
  markedDuringScreen: string;
  reason: string;
  note: string;
}

function isValidFlag(v: unknown): v is QuestionFlag {
  if (typeof v !== "object" || v === null) return false;
  const f = v as Record<string, unknown>;
  return (
    typeof f.questionId === "string" &&
    typeof f.questionIndex === "number" &&
    typeof f.text === "string" &&
    typeof f.markedAt === "string" &&
    typeof f.reason === "string" &&
    typeof f.note === "string"
  );
}

function persist(flags: QuestionFlag[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(flags));
  } catch (err) {
    console.warn("question-flags:save-failed", err);
  }
}

export function loadFlags(): QuestionFlag[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidFlag);
  } catch {
    return [];
  }
}

export function saveFlag(flag: QuestionFlag): QuestionFlag[] {
  const without = loadFlags().filter((f) => f.questionId !== flag.questionId);
  const next = [...without, flag];
  persist(next);
  return next;
}

export function updateFlag(questionId: string, partial: Partial<QuestionFlag>): QuestionFlag[] {
  const next = loadFlags().map((f) => (f.questionId === questionId ? { ...f, ...partial } : f));
  persist(next);
  return next;
}

export function removeFlag(questionId: string): QuestionFlag[] {
  const next = loadFlags().filter((f) => f.questionId !== questionId);
  persist(next);
  return next;
}

export function clearAllFlags(): QuestionFlag[] {
  persist([]);
  return [];
}

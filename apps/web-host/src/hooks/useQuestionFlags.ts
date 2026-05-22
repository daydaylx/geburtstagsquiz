import { useState } from "react";
import {
  clearAllFlags,
  loadFlags,
  type QuestionFlag,
  removeFlag,
  saveFlag,
  updateFlag,
} from "../lib/questionFlagsStorage.js";

export type { QuestionFlag };

export function useQuestionFlags() {
  const [flags, setFlags] = useState<QuestionFlag[]>(loadFlags);

  const isFlagged = (questionId: string) => flags.some((f) => f.questionId === questionId);
  const getFlag = (questionId: string) => flags.find((f) => f.questionId === questionId);

  const save = (flag: QuestionFlag) => {
    setFlags(saveFlag(flag));
  };

  const update = (questionId: string, partial: Partial<QuestionFlag>) => {
    setFlags(updateFlag(questionId, partial));
  };

  const remove = (questionId: string) => {
    setFlags(removeFlag(questionId));
  };

  const clearAll = () => {
    setFlags(clearAllFlags());
  };

  return { flags, isFlagged, getFlag, save, update, remove, clearAll };
}

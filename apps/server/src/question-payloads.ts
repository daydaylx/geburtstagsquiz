import { type QuestionControllerPayload, type QuestionShowPayload } from "@quiz/shared-protocol";
import { QuestionType, type Question } from "@quiz/shared-types";

import type { RoomRecord } from "./server-types.js";

function getAnswerDisplayLabel(index: number): string {
  return index < 26 ? String.fromCharCode(65 + index) : `${index + 1}`;
}

export function toQuestionShowPayload(
  room: RoomRecord,
  question: Question,
  gameState: QuestionShowPayload["gameState"],
): QuestionShowPayload {
  const questionIndex = room.currentQuestionIndex ?? 0;
  const totalQuestionCount = room.quiz?.questions.length ?? 0;
  const baseShowFields = {
    roomId: room.id,
    questionId: question.id,
    questionIndex,
    totalQuestionCount,
    text: question.text,
    durationMs: question.durationMs,
    gameState,
  };

  if (
    question.type === QuestionType.MultipleChoice ||
    question.type === QuestionType.Logic ||
    question.type === QuestionType.MajorityGuess
  ) {
    return {
      ...baseShowFields,
      type: question.type,
      options: question.options,
    };
  }

  if (question.type === QuestionType.Estimate) {
    return {
      ...baseShowFields,
      type: question.type,
      unit: question.unit,
      context: question.context,
    };
  }

  if (question.type === QuestionType.OpenText) {
    return {
      ...baseShowFields,
      type: question.type,
    };
  }

  return {
    ...baseShowFields,
    type: question.type,
    items: question.items,
  };
}

export function toQuestionControllerPayload(
  room: RoomRecord,
  question: Question,
  gameState: QuestionControllerPayload["gameState"],
): QuestionControllerPayload {
  const questionIndex = room.currentQuestionIndex ?? 0;
  const totalQuestionCount = room.quiz?.questions.length ?? 0;
  const baseControllerFields = {
    roomId: room.id,
    questionId: question.id,
    questionIndex,
    totalQuestionCount,
    durationMs: question.durationMs,
    gameState,
  };
  const showText = room.settings.showAnswerTextOnPlayerDevices;
  const toControllerOption = (option: { id: string; label: string }, index: number) => ({
    id: option.id,
    label: getAnswerDisplayLabel(index),
    ...(showText ? { text: option.label } : {}),
  });

  if (
    question.type === QuestionType.MultipleChoice ||
    question.type === QuestionType.Logic ||
    question.type === QuestionType.MajorityGuess
  ) {
    return {
      ...baseControllerFields,
      type: question.type,
      options: question.options.map(toControllerOption),
    };
  }

  if (question.type === QuestionType.Estimate) {
    return {
      ...baseControllerFields,
      type: question.type,
      unit: question.unit,
    };
  }

  if (question.type === QuestionType.OpenText) {
    return {
      ...baseControllerFields,
      type: question.type,
    };
  }

  return {
    ...baseControllerFields,
    type: question.type,
    items: question.items.map(toControllerOption),
  };
}

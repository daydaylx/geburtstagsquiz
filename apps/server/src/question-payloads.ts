import { type QuestionControllerPayload, type QuestionShowPayload } from "@quiz/shared-protocol";
import { QuestionType, type Question } from "@quiz/shared-types";

import type { RoomRecord } from "./server-types.js";

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

  if (question.type === QuestionType.MultipleChoice || question.type === QuestionType.Logic) {
    return {
      ...baseShowFields,
      type: question.type,
      options: question.options,
    };
  }

  if (question.type === QuestionType.Estimate || question.type === QuestionType.MajorityGuess) {
    return {
      ...baseShowFields,
      type: question.type,
      unit: question.unit,
      context: question.context,
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
  const toControllerOption = (option: { id: string; label: string }) => ({
    id: option.id,
    label: option.id,
    ...(showText ? { text: option.label } : {}),
  });

  if (question.type === QuestionType.MultipleChoice || question.type === QuestionType.Logic) {
    return {
      ...baseControllerFields,
      type: question.type,
      options: question.options.map(toControllerOption),
    };
  }

  if (question.type === QuestionType.Estimate || question.type === QuestionType.MajorityGuess) {
    return {
      ...baseControllerFields,
      type: question.type,
      unit: question.unit,
    };
  }

  return {
    ...baseControllerFields,
    type: question.type,
    items: question.items.map(toControllerOption),
  };
}

import { type QuestionControllerPayload, type QuestionShowPayload } from "@quiz/shared-protocol";
import { QuestionType, type Question } from "@quiz/shared-types";

import type { RoomRecord } from "./server-types.js";

function getAnswerDisplayLabel(index: number): string {
  return index < 26 ? String.fromCharCode(65 + index) : `${index + 1}`;
}

export function getTotalQuestionCount(room: RoomRecord): number {
  return room.quiz?.questions.filter((question) => !question.isDemoQuestion).length ?? 0;
}

export function getVisibleQuestionIndex(room: RoomRecord): number {
  if (!room.quiz || room.currentQuestionIndex === null) {
    return 0;
  }

  const currentQuestion = room.quiz.questions[room.currentQuestionIndex];
  if (currentQuestion?.isDemoQuestion) {
    return 0;
  }

  return room.quiz.questions
    .slice(0, room.currentQuestionIndex)
    .filter((question) => !question.isDemoQuestion).length;
}

export function toQuestionShowPayload(
  room: RoomRecord,
  question: Question,
  gameState: QuestionShowPayload["gameState"],
): QuestionShowPayload {
  const questionIndex = getVisibleQuestionIndex(room);
  const totalQuestionCount = getTotalQuestionCount(room);
  const baseShowFields = {
    roomId: room.id,
    questionId: question.id,
    questionIndex,
    totalQuestionCount,
    text: question.text,
    durationMs: question.durationMs,
    gameState,
    ...(question.isDemoQuestion ? { isDemoQuestion: true } : {}),
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
  const questionIndex = getVisibleQuestionIndex(room);
  const totalQuestionCount = getTotalQuestionCount(room);
  const baseControllerFields = {
    roomId: room.id,
    questionId: question.id,
    questionIndex,
    totalQuestionCount,
    durationMs: question.durationMs,
    gameState,
    ...(question.isDemoQuestion ? { isDemoQuestion: true } : {}),
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

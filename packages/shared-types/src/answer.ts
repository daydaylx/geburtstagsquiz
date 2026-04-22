export interface OptionAnswer {
  type: "option";
  value: string;
}

export type Answer = OptionAnswer;

export type CorrectAnswer = OptionAnswer;

export interface SubmittedAnswer {
  playerId: string;
  questionId: string;
  answer: Answer;
  submittedAtMs: number;
  requestId?: string;
}

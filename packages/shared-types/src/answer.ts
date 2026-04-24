export interface OptionAnswer {
  type: "option";
  value: string;
}

export interface NumberAnswer {
  type: "number";
  value: number;
}

export interface RankingAnswer {
  type: "ranking";
  value: string[];
}

export type Answer = OptionAnswer | NumberAnswer | RankingAnswer;

export type CorrectAnswer = OptionAnswer | NumberAnswer | RankingAnswer;

export interface SubmittedAnswer {
  playerId: string;
  questionId: string;
  answer: Answer;
  submittedAtMs: number;
  requestId?: string;
}

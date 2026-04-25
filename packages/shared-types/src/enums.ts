export enum RoomState {
  Created = "created",
  Waiting = "waiting",
  InGame = "in_game",
  Completed = "completed",
  Closed = "closed",
}

export enum GameState {
  Idle = "idle",
  QuestionActive = "question_active",
  AnswerLocked = "answer_locked",
  Revealing = "revealing",
  Scoreboard = "scoreboard",
  Completed = "completed",
}

export enum PlayerState {
  Connected = "connected",
  Ready = "ready",
  Answering = "answering",
  Answered = "answered",
  Disconnected = "disconnected",
  Reconnecting = "reconnecting",
}

export enum QuestionType {
  MultipleChoice = "multiple_choice",
  Estimate = "estimate",
  MajorityGuess = "majority_guess",
  Ranking = "ranking",
  Logic = "logic",
  OpenText = "open_text",
}

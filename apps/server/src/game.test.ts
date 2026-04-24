import { describe, expect, it } from "vitest";
import { PlayerState, QuestionType, type Player, type Question } from "@quiz/shared-types";

import { getAnswerProgress, getEveningQuestions } from "./game.js";

function makePlayer(id: string, state: PlayerState): Player {
  return {
    id,
    name: id,
    sessionId: `session-${id}`,
    state,
    score: 0,
  };
}

function makeQuestion(id: string, type: QuestionType): Question {
  if (type === QuestionType.Estimate || type === QuestionType.MajorityGuess) {
    return {
      id,
      type,
      text: id,
      correctValue: 1,
      unit: "x",
      context: "test",
      durationMs: 10_000,
      points: 1,
    };
  }

  if (type === QuestionType.Ranking) {
    return {
      id,
      type,
      text: id,
      items: [
        { id: "A", label: "A" },
        { id: "B", label: "B" },
      ],
      correctOrder: ["A", "B"],
      durationMs: 10_000,
      points: 1,
    };
  }

  return {
    id,
    type,
    text: id,
    options: [
      { id: "A", label: "A" },
      { id: "B", label: "B" },
    ],
    correctOptionId: "A",
    durationMs: 10_000,
    points: 1,
  };
}

describe("getAnswerProgress", () => {
  it("counts answers only from currently connected players", () => {
    const currentAnswers = new Map([
      ["p1", { playerId: "p1", questionId: "q1", answer: { type: "option" as const, value: "A" }, submittedAtMs: 1 }],
      ["p2", { playerId: "p2", questionId: "q1", answer: { type: "option" as const, value: "A" }, submittedAtMs: 1 }],
    ]);

    expect(
      getAnswerProgress({
        players: [
          makePlayer("p1", PlayerState.Answered),
          makePlayer("p2", PlayerState.Disconnected),
          makePlayer("p3", PlayerState.Answering),
        ],
        currentAnswers,
      }),
    ).toEqual({
      answeredCount: 1,
      totalEligiblePlayers: 2,
    });
  });
});

describe("getEveningQuestions", () => {
  it("keeps the first six questions per supported question type", () => {
    const questions = [
      ...Array.from({ length: 8 }, (_, index) =>
        makeQuestion(`mc-${index}`, QuestionType.MultipleChoice),
      ),
      ...Array.from({ length: 7 }, (_, index) => makeQuestion(`logic-${index}`, QuestionType.Logic)),
      ...Array.from({ length: 6 }, (_, index) =>
        makeQuestion(`estimate-${index}`, QuestionType.Estimate),
      ),
      ...Array.from({ length: 6 }, (_, index) =>
        makeQuestion(`majority-${index}`, QuestionType.MajorityGuess),
      ),
      ...Array.from({ length: 9 }, (_, index) =>
        makeQuestion(`ranking-${index}`, QuestionType.Ranking),
      ),
    ];

    const selected = getEveningQuestions(questions);

    expect(selected).toHaveLength(30);
    expect(selected.map((question) => question.id)).toEqual([
      "mc-0",
      "mc-1",
      "mc-2",
      "mc-3",
      "mc-4",
      "mc-5",
      "logic-0",
      "logic-1",
      "logic-2",
      "logic-3",
      "logic-4",
      "logic-5",
      "estimate-0",
      "estimate-1",
      "estimate-2",
      "estimate-3",
      "estimate-4",
      "estimate-5",
      "majority-0",
      "majority-1",
      "majority-2",
      "majority-3",
      "majority-4",
      "majority-5",
      "ranking-0",
      "ranking-1",
      "ranking-2",
      "ranking-3",
      "ranking-4",
      "ranking-5",
    ]);
  });
});

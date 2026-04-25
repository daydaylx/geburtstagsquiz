import { describe, expect, it } from "vitest";
import { PlayerState, QuestionType, type Player, type Question } from "@quiz/shared-types";

import { getAnswerProgress, getEveningQuestions } from "./game.js";
import { QUESTION_DURATION_MS } from "./config.js";

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
      [
        "p1",
        {
          playerId: "p1",
          questionId: "q1",
          answer: { type: "option" as const, value: "A" },
          submittedAtMs: 1,
        },
      ],
      [
        "p2",
        {
          playerId: "p2",
          questionId: "q1",
          answer: { type: "option" as const, value: "A" },
          submittedAtMs: 1,
        },
      ],
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

  it("returns zeros when no players are eligible", () => {
    expect(
      getAnswerProgress({
        players: [makePlayer("p1", PlayerState.Disconnected)],
        currentAnswers: new Map(),
      }),
    ).toEqual({
      answeredCount: 0,
      totalEligiblePlayers: 0,
    });
  });

  it("returns zeros when there are no players", () => {
    expect(
      getAnswerProgress({
        players: [],
        currentAnswers: new Map(),
      }),
    ).toEqual({
      answeredCount: 0,
      totalEligiblePlayers: 0,
    });
  });
});

describe("getEveningQuestions", () => {
  it("handles empty question list", () => {
    expect(getEveningQuestions([])).toEqual([]);
  });

  it("selects six questions per type and sets QUESTION_DURATION_MS", () => {
    const questions = [
      ...Array.from({ length: 8 }, (_, i) => makeQuestion(`mc-${i}`, QuestionType.MultipleChoice)),
      ...Array.from({ length: 7 }, (_, i) => makeQuestion(`logic-${i}`, QuestionType.Logic)),
      ...Array.from({ length: 6 }, (_, i) => makeQuestion(`estimate-${i}`, QuestionType.Estimate)),
      ...Array.from({ length: 6 }, (_, i) =>
        makeQuestion(`majority-${i}`, QuestionType.MajorityGuess),
      ),
      ...Array.from({ length: 9 }, (_, i) => makeQuestion(`ranking-${i}`, QuestionType.Ranking)),
    ];

    const selected = getEveningQuestions(questions);

    expect(selected).toHaveLength(30);
    expect(selected.every((q) => q.durationMs === QUESTION_DURATION_MS)).toBe(true);
    expect(questions.every((q) => q.durationMs === 10_000)).toBe(true);

    expect(selected.filter((q) => q.type === QuestionType.MultipleChoice)).toHaveLength(6);
    expect(selected.filter((q) => q.type === QuestionType.Logic)).toHaveLength(6);
    expect(selected.filter((q) => q.type === QuestionType.Estimate)).toHaveLength(6);
    expect(selected.filter((q) => q.type === QuestionType.MajorityGuess)).toHaveLength(6);
    expect(selected.filter((q) => q.type === QuestionType.Ranking)).toHaveLength(6);
  });

  it("does not produce duplicate question IDs", () => {
    const questions = [
      ...Array.from({ length: 10 }, (_, i) => makeQuestion(`mc-${i}`, QuestionType.MultipleChoice)),
      ...Array.from({ length: 10 }, (_, i) => makeQuestion(`logic-${i}`, QuestionType.Logic)),
      ...Array.from({ length: 10 }, (_, i) => makeQuestion(`estimate-${i}`, QuestionType.Estimate)),
      ...Array.from({ length: 10 }, (_, i) =>
        makeQuestion(`majority-${i}`, QuestionType.MajorityGuess),
      ),
      ...Array.from({ length: 10 }, (_, i) => makeQuestion(`ranking-${i}`, QuestionType.Ranking)),
    ];

    const selected = getEveningQuestions(questions);
    const ids = selected.map((q) => q.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("does not mutate the original question array", () => {
    const questions = Array.from({ length: 8 }, (_, i) =>
      makeQuestion(`mc-${i}`, QuestionType.MultipleChoice),
    );
    const originalOrder = questions.map((q) => q.id);

    getEveningQuestions(questions);

    expect(questions.map((q) => q.id)).toEqual(originalOrder);
    expect(questions.every((q) => q.durationMs === 10_000)).toBe(true);
  });

  it("uses all available questions when fewer than six exist per type", () => {
    const questions = [
      ...Array.from({ length: 3 }, (_, i) => makeQuestion(`mc-${i}`, QuestionType.MultipleChoice)),
      ...Array.from({ length: 2 }, (_, i) => makeQuestion(`logic-${i}`, QuestionType.Logic)),
    ];

    const selected = getEveningQuestions(questions);

    expect(selected.filter((q) => q.type === QuestionType.MultipleChoice)).toHaveLength(3);
    expect(selected.filter((q) => q.type === QuestionType.Logic)).toHaveLength(2);
    expect(selected.filter((q) => q.type === QuestionType.Estimate)).toHaveLength(0);
  });

  it("produces a deterministic result with a fixed random function", () => {
    const questions = Array.from({ length: 10 }, (_, i) =>
      makeQuestion(`mc-${i}`, QuestionType.MultipleChoice),
    );
    let seed = 42;
    const seededRandom = () => {
      seed = (seed * 1664525 + 1013904223) & 0xffffffff;
      return (seed >>> 0) / 0xffffffff;
    };

    const run1 = getEveningQuestions(questions, seededRandom);
    seed = 42;
    const run2 = getEveningQuestions(questions, seededRandom);

    expect(run1.map((q) => q.id)).toEqual(run2.map((q) => q.id));
  });
});

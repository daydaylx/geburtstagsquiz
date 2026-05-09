import { describe, expect, it } from "vitest";
import {
  PlayerState,
  QuestionType,
  type Player,
  type Question,
  type RoundResult,
  type ScoreboardEntry,
  type SubmittedAnswer,
} from "@quiz/shared-types";

import {
  buildFinalStats,
  buildScoreChanges,
  shouldShowScoreboardAfterCurrentQuestion,
} from "./game-scoreboard.js";
import type { RoomRecord } from "./server-types.js";

function makeMCQuestion(id: string): Question {
  return {
    id,
    type: QuestionType.MultipleChoice,
    text: id,
    options: [{ id: "A", label: "A" }],
    correctOptionId: "A",
    durationMs: 90_000,
    points: 1,
  };
}

function makeQuiz(questions: Question[]) {
  return { id: "test", title: "Test", categories: [], questions };
}

function makePlayer(id: string, score = 0): Player {
  return { id, name: id, sessionId: `session-${id}`, state: PlayerState.Ready, score };
}

function makeRoom(
  overrides: {
    quiz?: RoomRecord["quiz"];
    currentQuestionIndex?: number | null;
    players?: Player[];
    completedRoundResults?: RoundResult[];
    completedAnswers?: SubmittedAnswer[];
  } = {},
): RoomRecord {
  return {
    players: [],
    quiz: null,
    currentQuestionIndex: null,
    completedRoundResults: [],
    completedAnswers: [],
    ...overrides,
  } as unknown as RoomRecord;
}

describe("shouldShowScoreboardAfterCurrentQuestion", () => {
  it("returns false when no quiz is loaded", () => {
    const room = makeRoom();
    expect(shouldShowScoreboardAfterCurrentQuestion(room)).toBe(false);
  });

  it("returns false for a demo question", () => {
    const demo: Question = { ...makeMCQuestion("__demo"), isDemoQuestion: true };
    const room = makeRoom({ quiz: makeQuiz([demo]), currentQuestionIndex: 0 });
    expect(shouldShowScoreboardAfterCurrentQuestion(room)).toBe(false);
  });

  it("returns true after the 5th non-demo question (not last)", () => {
    const questions = Array.from({ length: 6 }, (_, i) => makeMCQuestion(`q${i}`));
    const room = makeRoom({ quiz: makeQuiz(questions), currentQuestionIndex: 4 });
    expect(shouldShowScoreboardAfterCurrentQuestion(room)).toBe(true);
  });

  it("returns false after the 4th non-demo question", () => {
    const questions = Array.from({ length: 6 }, (_, i) => makeMCQuestion(`q${i}`));
    const room = makeRoom({ quiz: makeQuiz(questions), currentQuestionIndex: 3 });
    expect(shouldShowScoreboardAfterCurrentQuestion(room)).toBe(false);
  });

  it("returns false for the last question even at a 5-interval", () => {
    // exactly 5 questions → currentIndex 4 is both the 5th interval AND the last
    const questions = Array.from({ length: 5 }, (_, i) => makeMCQuestion(`q${i}`));
    const room = makeRoom({ quiz: makeQuiz(questions), currentQuestionIndex: 4 });
    expect(shouldShowScoreboardAfterCurrentQuestion(room)).toBe(false);
  });

  it("counts demo question as invisible when computing the interval", () => {
    // demo at index 0, then 11 regulars; index 10 = 10th non-demo, not last
    const demo: Question = { ...makeMCQuestion("__demo"), isDemoQuestion: true };
    const questions = [demo, ...Array.from({ length: 11 }, (_, i) => makeMCQuestion(`q${i}`))];
    const room = makeRoom({ quiz: makeQuiz(questions), currentQuestionIndex: 10 });
    expect(shouldShowScoreboardAfterCurrentQuestion(room)).toBe(true);
  });
});

describe("buildScoreChanges", () => {
  it("computes deltas and ranks for players who earned points", () => {
    const previous: ScoreboardEntry[] = [
      { playerId: "p1", name: "Alice", score: 10 },
      { playerId: "p2", name: "Bob", score: 5 },
    ];
    const next: ScoreboardEntry[] = [
      { playerId: "p1", name: "Alice", score: 13 },
      { playerId: "p2", name: "Bob", score: 5 },
    ];

    const changes = buildScoreChanges(previous, next);
    const alice = changes.find((c) => c.playerId === "p1");

    expect(alice?.delta).toBe(3);
    expect(alice?.previousScore).toBe(10);
    expect(alice?.score).toBe(13);
    expect(alice?.rank).toBe(1);
    expect(alice?.previousRank).toBe(1);
  });

  it("excludes players with no delta and no rank change", () => {
    const scoreboard: ScoreboardEntry[] = [
      { playerId: "p1", name: "Alice", score: 10 },
      { playerId: "p2", name: "Bob", score: 5 },
    ];

    const changes = buildScoreChanges(scoreboard, scoreboard);

    expect(changes).toHaveLength(0);
  });

  it("includes a player whose rank changed even with zero delta", () => {
    const previous: ScoreboardEntry[] = [
      { playerId: "p1", name: "Alice", score: 10 },
      { playerId: "p2", name: "Bob", score: 5 },
    ];
    const next: ScoreboardEntry[] = [
      { playerId: "p2", name: "Bob", score: 10 },
      { playerId: "p1", name: "Alice", score: 10 },
    ];

    const changes = buildScoreChanges(previous, next);
    const alice = changes.find((c) => c.playerId === "p1");

    expect(alice).toBeDefined();
    expect(alice?.delta).toBe(0);
    expect(alice?.previousRank).toBe(1);
    expect(alice?.rank).toBe(2);
  });

  it("treats a new player as starting from score 0 and last rank", () => {
    const previous: ScoreboardEntry[] = [];
    const next: ScoreboardEntry[] = [{ playerId: "p1", name: "Alice", score: 5 }];

    const changes = buildScoreChanges(previous, next);
    const alice = changes.find((c) => c.playerId === "p1");

    expect(alice?.previousScore).toBe(0);
    expect(alice?.delta).toBe(5);
    expect(alice?.rank).toBe(1);
  });
});

describe("buildFinalStats", () => {
  it("returns undefined when no rounds completed", () => {
    const room = makeRoom();
    expect(buildFinalStats(room)).toBeUndefined();
  });

  it("identifies the player with the most correct answers", () => {
    const room = makeRoom({
      players: [makePlayer("p1"), makePlayer("p2")],
      completedRoundResults: [
        {
          questionId: "q1",
          correctAnswer: { type: "option", value: "A" },
          playerResults: [
            {
              playerId: "p1",
              answer: { type: "option", value: "A" },
              isCorrect: true,
              pointsEarned: 1,
            },
            {
              playerId: "p2",
              answer: { type: "option", value: "B" },
              isCorrect: false,
              pointsEarned: 0,
            },
          ],
        },
        {
          questionId: "q2",
          correctAnswer: { type: "option", value: "A" },
          playerResults: [
            {
              playerId: "p1",
              answer: { type: "option", value: "A" },
              isCorrect: true,
              pointsEarned: 1,
            },
            {
              playerId: "p2",
              answer: { type: "option", value: "A" },
              isCorrect: true,
              pointsEarned: 1,
            },
          ],
        },
      ],
      completedAnswers: [],
    });

    const stats = buildFinalStats(room);

    expect(stats?.mostCorrect?.playerId).toBe("p1");
    expect(stats?.mostCorrect?.count).toBe(2);
  });

  it("identifies the player who answered first", () => {
    const room = makeRoom({
      players: [makePlayer("p1"), makePlayer("p2")],
      completedRoundResults: [
        {
          questionId: "q1",
          correctAnswer: { type: "option", value: "A" },
          playerResults: [
            {
              playerId: "p1",
              answer: { type: "option", value: "A" },
              isCorrect: true,
              pointsEarned: 1,
            },
          ],
        },
      ],
      completedAnswers: [
        {
          playerId: "p1",
          questionId: "q1",
          answer: { type: "option", value: "A" },
          submittedAtMs: 200,
        },
        {
          playerId: "p2",
          questionId: "q1",
          answer: { type: "option", value: "B" },
          submittedAtMs: 100,
        },
      ],
    });

    const stats = buildFinalStats(room);

    expect(stats?.fastestAnswer?.playerId).toBe("p2");
    expect(stats?.fastestAnswer?.submittedAtMs).toBe(100);
  });
});

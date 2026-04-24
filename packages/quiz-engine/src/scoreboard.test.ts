import { describe, expect, it } from "vitest";

import { createInitialScoreboard, applyRoundResultToScoreboard } from "./scoreboard.js";
import type { RoundResult } from "@quiz/shared-types";

describe("createInitialScoreboard", () => {
  it("creates entries for all players with score 0", () => {
    const players = [
      { id: "p1", name: "Alice" },
      { id: "p2", name: "Bob" },
    ];

    const scoreboard = createInitialScoreboard(players);

    expect(scoreboard).toHaveLength(2);
    expect(scoreboard[0]).toEqual({ playerId: "p1", name: "Alice", score: 0 });
    expect(scoreboard[1]).toEqual({ playerId: "p2", name: "Bob", score: 0 });
  });

  it("returns empty scoreboard for no players", () => {
    expect(createInitialScoreboard([])).toEqual([]);
  });
});

describe("applyRoundResultToScoreboard", () => {
  it("adds points correctly to existing scoreboard", () => {
    const players = [
      { id: "p1", name: "Alice" },
      { id: "p2", name: "Bob" },
    ];
    const previous = createInitialScoreboard(players);
    const roundResult: RoundResult = {
      questionId: "q1",
      correctAnswer: { type: "option", value: "A" },
      playerResults: [
        {
          playerId: "p1",
          answer: { type: "option", value: "A" },
          isCorrect: true,
          pointsEarned: 10,
        },
        {
          playerId: "p2",
          answer: { type: "option", value: "B" },
          isCorrect: false,
          pointsEarned: 0,
        },
      ],
    };

    const updated = applyRoundResultToScoreboard(players, previous, roundResult);

    expect(updated).toHaveLength(2);
    expect(updated.find((e) => e.playerId === "p1")?.score).toBe(10);
    expect(updated.find((e) => e.playerId === "p2")?.score).toBe(0);
  });

  it("accumulates points across multiple rounds", () => {
    const players = [{ id: "p1", name: "Alice" }];
    let scoreboard = createInitialScoreboard(players);

    const round1: RoundResult = {
      questionId: "q1",
      correctAnswer: { type: "option", value: "A" },
      playerResults: [
        {
          playerId: "p1",
          answer: { type: "option", value: "A" },
          isCorrect: true,
          pointsEarned: 10,
        },
      ],
    };
    scoreboard = applyRoundResultToScoreboard(players, scoreboard, round1);

    const round2: RoundResult = {
      questionId: "q2",
      correctAnswer: { type: "option", value: "B" },
      playerResults: [
        {
          playerId: "p1",
          answer: { type: "option", value: "B" },
          isCorrect: true,
          pointsEarned: 10,
        },
      ],
    };
    scoreboard = applyRoundResultToScoreboard(players, scoreboard, round2);

    expect(scoreboard[0].score).toBe(20);
  });

  it("throws on missing player entry", () => {
    const players = [{ id: "p1", name: "Alice" }];
    const scoreboard = createInitialScoreboard(players);
    const roundResult: RoundResult = {
      questionId: "q1",
      correctAnswer: { type: "option", value: "A" },
      playerResults: [{ playerId: "p999", answer: null, isCorrect: false, pointsEarned: 0 }],
    };

    expect(() => applyRoundResultToScoreboard(players, scoreboard, roundResult)).toThrow();
  });

  it("adds missing players from the players list with score 0", () => {
    const initialPlayers = [{ id: "p1", name: "Alice" }];
    const scoreboard = createInitialScoreboard(initialPlayers);
    
    const currentPlayers = [
      { id: "p1", name: "Alice" },
      { id: "p2", name: "Bob" },
    ];
    
    const roundResult: RoundResult = {
      questionId: "q1",
      correctAnswer: { type: "option", value: "A" },
      playerResults: [
        {
          playerId: "p1",
          answer: { type: "option", value: "A" },
          isCorrect: true,
          pointsEarned: 10,
        },
      ],
    };

    const updated = applyRoundResultToScoreboard(currentPlayers, scoreboard, roundResult);

    expect(updated).toHaveLength(2);
    const bob = updated.find((e) => e.playerId === "p2");
    expect(bob).toBeDefined();
    expect(bob?.score).toBe(0);
    expect(bob?.name).toBe("Bob");
  });
});

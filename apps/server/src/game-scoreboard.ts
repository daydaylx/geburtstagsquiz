import type { GameFinalStats, ScoreboardEntry, ScoreChange } from "@quiz/shared-types";
import { getSortedScoreboard } from "./room-selectors.js";
import type { RoomRecord } from "./server-types.js";

const SCOREBOARD_INTERVAL = 5;

export function isLastQuestion(room: RoomRecord): boolean {
  return (
    !!room.quiz && room.currentQuestionIndex !== null && room.currentQuestionIndex + 1 >= room.quiz.questions.length
  );
}

export function shouldShowScoreboardAfterCurrentQuestion(room: RoomRecord): boolean {
  if (!room.quiz || room.currentQuestionIndex === null) {
    return false;
  }

  const currentQuestion = room.quiz.questions[room.currentQuestionIndex];
  if (!currentQuestion || currentQuestion.isDemoQuestion || isLastQuestion(room)) {
    return false;
  }

  const answeredQuestionNumber = getAnsweredVisibleQuestionNumber(room);
  return answeredQuestionNumber > 0 && answeredQuestionNumber % SCOREBOARD_INTERVAL === 0;
}

export function buildScoreChanges(
  previousScoreboard: ScoreboardEntry[],
  nextScoreboard: ScoreboardEntry[],
): ScoreChange[] {
  const previousByPlayerId = new Map(
    previousScoreboard.map((entry, index) => [entry.playerId, { score: entry.score, rank: index + 1 }]),
  );

  return nextScoreboard
    .map((entry, index) => {
      const previous = previousByPlayerId.get(entry.playerId) ?? {
        score: 0,
        rank: nextScoreboard.length,
      };

      return {
        playerId: entry.playerId,
        name: entry.name,
        previousScore: previous.score,
        score: entry.score,
        delta: Math.max(0, entry.score - previous.score),
        previousRank: previous.rank,
        rank: index + 1,
      };
    })
    .filter((change) => change.delta > 0 || change.previousRank !== change.rank);
}

export function buildFinalStats(room: RoomRecord): GameFinalStats | undefined {
  const completedResults = room.completedRoundResults;
  if (!completedResults.length) {
    return undefined;
  }

  const playerById = new Map(room.players.map((player) => [player.id, player]));
  const correctCounts = new Map<string, number>();
  let fastest: { playerId: string; submittedAtMs: number } | null = null;

  for (const result of completedResults) {
    for (const playerResult of result.playerResults) {
      if (playerResult.isCorrect) {
        correctCounts.set(playerResult.playerId, (correctCounts.get(playerResult.playerId) ?? 0) + 1);
      }
    }
  }

  for (const submittedAnswer of room.completedAnswers) {
    if (!fastest || submittedAnswer.submittedAtMs < fastest.submittedAtMs) {
      fastest = {
        playerId: submittedAnswer.playerId,
        submittedAtMs: submittedAnswer.submittedAtMs,
      };
    }
  }

  const mostCorrectEntry = [...correctCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const scoreboard = getSortedScoreboard(room);
  const gaps = scoreboard.slice(1).map((entry, index) => Math.abs(scoreboard[index].score - entry.score));
  const closestGap = gaps.length ? Math.min(...gaps) : undefined;

  return {
    ...(mostCorrectEntry && playerById.get(mostCorrectEntry[0])
      ? {
          mostCorrect: {
            playerId: mostCorrectEntry[0],
            name: playerById.get(mostCorrectEntry[0])!.name,
            count: mostCorrectEntry[1],
          },
        }
      : {}),
    ...(fastest && playerById.get(fastest.playerId)
      ? {
          fastestAnswer: {
            playerId: fastest.playerId,
            name: playerById.get(fastest.playerId)!.name,
            submittedAtMs: fastest.submittedAtMs,
          },
        }
      : {}),
    ...(closestGap !== undefined ? { closestGap: { points: closestGap } } : {}),
  };
}

function getAnsweredVisibleQuestionNumber(room: RoomRecord): number {
  if (!room.quiz || room.currentQuestionIndex === null) {
    return 0;
  }

  const currentQuestion = room.quiz.questions[room.currentQuestionIndex];
  if (!currentQuestion || currentQuestion.isDemoQuestion) {
    return 0;
  }

  return room.quiz.questions.slice(0, room.currentQuestionIndex + 1).filter((question) => !question.isDemoQuestion)
    .length;
}

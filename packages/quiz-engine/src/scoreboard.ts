import type { Player, RoundResult, Scoreboard, ScoreboardEntry } from "@quiz/shared-types";

type ScoreboardPlayer = Pick<Player, "id" | "name">;

export function createInitialScoreboard(players: ScoreboardPlayer[]): Scoreboard {
  return players.map((player) => ({
    playerId: player.id,
    name: player.name,
    score: 0,
  }));
}

export function applyRoundResultToScoreboard(
  players: ScoreboardPlayer[],
  previousScoreboard: Scoreboard,
  roundResult: RoundResult,
): Scoreboard {
  const scoreboardEntries = new Map<string, ScoreboardEntry>(
    previousScoreboard.map((entry) => [entry.playerId, { ...entry }]),
  );

  for (const player of players) {
    const existingEntry = scoreboardEntries.get(player.id);

    scoreboardEntries.set(player.id, {
      playerId: player.id,
      name: player.name,
      score: existingEntry?.score ?? 0,
    });
  }

  for (const result of roundResult.playerResults) {
    const existingEntry = scoreboardEntries.get(result.playerId);

    if (!existingEntry) {
      throw new Error(`Missing scoreboard entry for player ${result.playerId}`);
    }

    scoreboardEntries.set(result.playerId, {
      ...existingEntry,
      score: existingEntry.score + result.pointsEarned,
    });
  }

  return [...scoreboardEntries.values()];
}

import { PlayerState, type Question, type ScoreboardEntry } from "@quiz/shared-types";

import type { RoomRecord } from "./server-types.js";

export function getCurrentQuestion(room: RoomRecord): Question | null {
  if (!room.quiz || room.currentQuestionIndex === null) {
    return null;
  }

  return room.quiz.questions[room.currentQuestionIndex] ?? null;
}

export function getConnectedPlayers(room: Pick<RoomRecord, "players">) {
  return room.players.filter((player) => player.state !== PlayerState.Disconnected);
}

export function getSortedScoreboard(room: Pick<RoomRecord, "players">): ScoreboardEntry[] {
  return getConnectedPlayers(room)
    .map((player) => ({
      playerId: player.id,
      name: player.name,
      score: player.score,
    }))
    .sort((a, b) => b.score - a.score);
}

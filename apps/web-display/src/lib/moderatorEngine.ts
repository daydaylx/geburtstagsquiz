import type { ModeratorFrequency, ScoreboardEntry, ScoreChange } from "@quiz/shared-types";

export type ModeratorCategory =
  | "intro"
  | "next_question"
  | "all_wrong"
  | "all_correct"
  | "single_correct"
  | "leader_change"
  | "close_race"
  | "comeback"
  | "scoreboard"
  | "final_questions"
  | "last_question"
  | "winner"
  | "time_low"
  | "reveal_intro"
  | "filler";

// Lower number = higher priority
export const MODERATOR_PRIORITY: Record<ModeratorCategory, number> = {
  winner: 1,
  last_question: 2,
  leader_change: 3,
  time_low: 3,
  all_wrong: 4,
  single_correct: 5,
  all_correct: 6,
  final_questions: 7,
  close_race: 8,
  comeback: 8,
  scoreboard: 9,
  reveal_intro: 10,
  next_question: 11,
  intro: 1,
  filler: 12,
};

// Probability of playing for important events (winner, leader_change, etc.)
const PROB_IMPORTANT: Record<ModeratorFrequency, number> = {
  off: 0,
  low: 0.9,
  medium: 1.0,
  high: 1.0,
};

// Probability of playing for generic events (next_question, scoreboard, etc.)
const PROB_GENERIC: Record<ModeratorFrequency, number> = {
  off: 0,
  low: 0.2,
  medium: 0.4,
  high: 0.7,
};

function roll(prob: number): boolean {
  return Math.random() < prob;
}

export interface ModeratorEngine {
  onGameStarted: () => ModeratorCategory | null;
  onQuestionShow: (questionIndex: number, totalQuestions: number, freq: ModeratorFrequency) => ModeratorCategory | null;
  onQuestionReveal: (correctCount: number, totalCount: number, freq: ModeratorFrequency) => ModeratorCategory | null;
  onScoreUpdate: (
    scoreboard: ScoreboardEntry[],
    scoreChanges: ScoreChange[],
    freq: ModeratorFrequency,
  ) => ModeratorCategory | null;
  onGameFinished: () => ModeratorCategory | null;
  onTimerTick: (remainingMs: number, freq: ModeratorFrequency) => ModeratorCategory | null;
  reset: () => void;
}

export function createModeratorEngine(): ModeratorEngine {
  let introPlayed = false;
  let winnerPlayed = false;
  let timeLowPlayedForCurrentQuestion = false;
  let previousLeaderId: string | null = null;

  function onGameStarted(): ModeratorCategory | null {
    if (introPlayed) return null;
    introPlayed = true;
    return "intro";
  }

  function onQuestionShow(
    questionIndex: number,
    totalQuestions: number,
    freq: ModeratorFrequency,
  ): ModeratorCategory | null {
    timeLowPlayedForCurrentQuestion = false;

    if (freq === "off") return null;

    const isLast = questionIndex === totalQuestions - 1;
    const isFinalStretch = questionIndex >= totalQuestions - 3 && !isLast;

    if (isLast) {
      return roll(PROB_IMPORTANT[freq]) ? "last_question" : null;
    }
    if (isFinalStretch) {
      return roll(PROB_IMPORTANT[freq]) ? "final_questions" : null;
    }
    return roll(PROB_GENERIC[freq]) ? "next_question" : null;
  }

  function onQuestionReveal(
    correctCount: number,
    totalCount: number,
    freq: ModeratorFrequency,
  ): ModeratorCategory | null {
    if (freq === "off") return null;

    if (totalCount === 0) return null;

    if (correctCount === 0) {
      return roll(PROB_IMPORTANT[freq]) ? "all_wrong" : null;
    }
    if (correctCount === totalCount) {
      return roll(PROB_GENERIC[freq]) ? "all_correct" : null;
    }
    if (correctCount === 1) {
      return roll(PROB_GENERIC[freq]) ? "single_correct" : null;
    }
    if (roll(PROB_GENERIC[freq] * 0.5)) {
      return "reveal_intro";
    }
    return null;
  }

  function onScoreUpdate(
    scoreboard: ScoreboardEntry[],
    scoreChanges: ScoreChange[],
    freq: ModeratorFrequency,
  ): ModeratorCategory | null {
    if (freq === "off") return null;
    if (scoreboard.length === 0) return null;

    const newLeaderId = scoreboard[0].playerId;
    const leaderChanged = previousLeaderId !== null && newLeaderId !== previousLeaderId;
    previousLeaderId = newLeaderId;

    if (leaderChanged && roll(PROB_IMPORTANT[freq])) {
      return "leader_change";
    }

    const isCloseRace = scoreboard.length >= 2 && scoreboard[0].score - scoreboard[1].score <= 2;
    if (isCloseRace && roll(PROB_GENERIC[freq])) {
      return "close_race";
    }

    const hasComeback = scoreChanges.some((c) => c.previousRank - c.rank >= 2);
    if (hasComeback && roll(PROB_GENERIC[freq])) {
      return "comeback";
    }

    if (roll(PROB_GENERIC[freq] * 0.6)) {
      return "scoreboard";
    }

    return null;
  }

  function onGameFinished(): ModeratorCategory | null {
    if (winnerPlayed) return null;
    winnerPlayed = true;
    return "winner";
  }

  function onTimerTick(remainingMs: number, freq: ModeratorFrequency): ModeratorCategory | null {
    if (freq === "off") return null;
    if (timeLowPlayedForCurrentQuestion) return null;
    if (remainingMs > 10_000 || remainingMs <= 0) return null;

    timeLowPlayedForCurrentQuestion = true;
    return roll(PROB_GENERIC[freq]) ? "time_low" : null;
  }

  function reset(): void {
    introPlayed = false;
    winnerPlayed = false;
    timeLowPlayedForCurrentQuestion = false;
    previousLeaderId = null;
  }

  return {
    onGameStarted,
    onQuestionShow,
    onQuestionReveal,
    onScoreUpdate,
    onGameFinished,
    onTimerTick,
    reset,
  };
}

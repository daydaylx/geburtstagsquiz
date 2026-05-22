import type { ScoreUpdatePayload } from "@quiz/shared-protocol";
import type { ModeratorFrequency } from "@quiz/shared-types";

export type ModeratorCategory = "intro" | "question" | "countdown" | "reveal" | "scoreboard" | "outro" | "filler";

export const MODERATOR_PRIORITY: Record<ModeratorCategory, number> = {
  intro: 80,
  outro: 90,
  scoreboard: 60,
  reveal: 70,
  question: 50,
  countdown: 85,
  filler: 10,
};

export interface ModeratorEngine {
  onGameStarted(): ModeratorCategory | null;
  onQuestionShow(
    questionIndex: number,
    totalQuestionCount: number,
    frequency: ModeratorFrequency,
  ): ModeratorCategory | null;
  onTimerTick(remainingMs: number, frequency: ModeratorFrequency): ModeratorCategory | null;
  onQuestionReveal(correctCount: number, totalCount: number, frequency: ModeratorFrequency): ModeratorCategory | null;
  onScoreUpdate(
    scoreboard: ScoreUpdatePayload["scoreboard"],
    scoreChanges: ScoreUpdatePayload["scoreChanges"],
    frequency: ModeratorFrequency,
  ): ModeratorCategory | null;
  onGameFinished(): ModeratorCategory | null;
  reset(): void;
}

export function createModeratorEngine(): ModeratorEngine {
  let countdownTriggered = false;

  return {
    onGameStarted() {
      countdownTriggered = false;
      return "intro";
    },
    onQuestionShow(_questionIndex, _totalQuestionCount, frequency) {
      countdownTriggered = false;
      if (frequency === "off" || frequency === "low") return null;
      return "question";
    },
    onTimerTick(remainingMs, frequency) {
      if (frequency !== "high") return null;
      if (remainingMs <= 10_000 && !countdownTriggered) {
        countdownTriggered = true;
        return "countdown";
      }
      return null;
    },
    onQuestionReveal(_correctCount, _totalCount, frequency) {
      if (frequency === "off") return null;
      return "reveal";
    },
    onScoreUpdate(_scoreboard, _scoreChanges, frequency) {
      if (frequency === "off" || frequency === "low") return null;
      return "scoreboard";
    },
    onGameFinished() {
      return "outro";
    },
    reset() {
      countdownTriggered = false;
    },
  };
}

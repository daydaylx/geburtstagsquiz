import { QuestionType } from "@quiz/shared-types";
import type { UseHostSessionReturn } from "../hooks/useHostSession.js";
import { getAnswerDisplayLabel } from "../lib/labels.js";

export function HostQuestionStage({
  session: s,
  currentQuestionNumber,
  effectiveTotalQuestionCount,
  timerSeconds,
  isTimerWarning,
  isTimerUrgent,
  answerProgressPercent,
}: {
  session: UseHostSessionReturn;
  currentQuestionNumber: number;
  effectiveTotalQuestionCount: number | null;
  timerSeconds: number;
  isTimerWarning: boolean;
  isTimerUrgent: boolean;
  answerProgressPercent: number;
}) {
  if (!s.question) return null;

  return (
    <div className="host-panel-content">
      <div className="host-stage-head">
        <p className="host-section-label">
          {s.question.isDemoQuestion
            ? "Testfrage"
            : `Frage ${currentQuestionNumber}${effectiveTotalQuestionCount ? ` / ${effectiveTotalQuestionCount}` : ""}`}
        </p>
      </div>

      {/* Timer – dominant */}
      <div className="host-timer-block">
        <div
          className="host-timer-display"
          data-urgent={isTimerUrgent ? "true" : undefined}
          data-warning={isTimerWarning ? "true" : undefined}
        >
          {timerSeconds}
        </div>
        <span className="host-timer-unit">Sekunden</span>
      </div>

      {/* Answer progress – directly below timer */}
      <div className="host-progress-block" style={{ marginTop: "0" }}>
        <div className="host-bar-meta">
          <span className="host-section-label host-section-label--compact">Antworten</span>
          <strong>
            {s.answerProgress?.answeredCount || 0} / {s.answerProgress?.totalEligiblePlayers || 0}
            {s.answerProgress && s.answerProgress.totalEligiblePlayers - s.answerProgress.answeredCount > 0 && (
              <span className="host-pending-count">
                {" "}
                · {s.answerProgress.totalEligiblePlayers - s.answerProgress.answeredCount} offen
              </span>
            )}
          </strong>
        </div>
        <div
          className="host-progress-bar"
          role="progressbar"
          aria-valuenow={Math.round(answerProgressPercent)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="host-progress-fill" style={{ width: `${answerProgressPercent}%` }} />
        </div>
      </div>

      <h3 className="host-question-text">{s.question.text}</h3>

      {(s.question.type === QuestionType.MultipleChoice ||
        s.question.type === QuestionType.Logic ||
        s.question.type === QuestionType.MajorityGuess) && (
        <div className="host-options-grid">
          {s.question.options.map((opt, index) => (
            <div className="host-option-card" key={opt.id}>
              <span className="host-option-id">{getAnswerDisplayLabel(index)}</span>
              <span className="host-option-label">{opt.label}</span>
            </div>
          ))}
        </div>
      )}
      {s.question.type === QuestionType.Estimate && (
        <div className="host-estimate-display">Schätzungen laufen... ({s.question.unit})</div>
      )}
      {s.question.type === QuestionType.OpenText && <div className="host-estimate-display">Texteingaben laufen...</div>}
      {s.question.type === QuestionType.Ranking && (
        <div className="host-ranking-list">
          {s.question.items.map((item, index) => (
            <div className="host-ranking-item" key={item.id}>
              <span className="host-option-id">{getAnswerDisplayLabel(index)}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      )}

      {s.answerProgress?.totalEligiblePlayers === 0 && (
        <p className="host-zero-players-hint">
          Keine Spieler verbunden – warte auf Reconnect oder gehe manuell weiter.
        </p>
      )}
    </div>
  );
}

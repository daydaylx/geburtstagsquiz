import { QuestionType } from "@quiz/shared-types";
import type { UseHostSessionReturn } from "../hooks/useHostSession.js";
import { getAnswerDisplayLabel } from "../lib/labels.js";

export function HostRevealStage({
  session: s,
  correctRoundCount,
  wrongRoundCount,
  missingRoundCount,
  nextReadyLabel,
  nextReadyPercent,
}: {
  session: UseHostSessionReturn;
  correctRoundCount: number;
  wrongRoundCount: number;
  missingRoundCount: number;
  nextReadyLabel: string;
  nextReadyPercent: number;
}) {
  if (!s.question) return null;

  return (
    <div className="host-panel-content">
      <p className="host-section-label">Auflösung läuft</p>
      <h3 className="host-question-text">{s.question.text}</h3>
      {(s.question.type === QuestionType.MultipleChoice ||
        s.question.type === QuestionType.Logic ||
        s.question.type === QuestionType.MajorityGuess) && (
        <div className="host-options-grid host-options-grid--reveal">
          {s.question.options.map((opt, index) => {
            const isCorrectAnswer =
              (s.revealedAnswer?.type === "option" && s.revealedAnswer.value === opt.id) ||
              (s.revealedAnswer?.type === "options" && s.revealedAnswer.value.includes(opt.id));
            return (
              <div className="host-option-card" data-state={isCorrectAnswer ? "correct" : "dimmed"} key={opt.id}>
                <span className="host-option-id">{getAnswerDisplayLabel(index)}</span>
                <span className="host-option-label">{opt.label}</span>
              </div>
            );
          })}
        </div>
      )}
      {s.question.type === QuestionType.Estimate && s.revealedAnswer?.type === "number" && (
        <div className="host-estimate-display host-estimate-display--reveal">
          <span>Richtig: </span>
          <strong className="host-estimate-correct-value">
            {s.revealedAnswer.value} {s.question.unit}
          </strong>
          {s.revealEstimateContext && <span className="host-estimate-context">({s.revealEstimateContext})</span>}
        </div>
      )}
      {s.question.type === QuestionType.OpenText && s.revealedAnswer?.type === "text" && (
        <div className="host-estimate-display host-estimate-display--reveal">
          <span>Richtig: </span>
          <strong className="host-estimate-correct-value">{s.revealedAnswer.value}</strong>
        </div>
      )}
      {s.question.type === QuestionType.Ranking &&
        s.revealedAnswer?.type === "ranking" &&
        (() => {
          const q = s.question!;
          return (
            <div className="host-ranking-list">
              {s.revealedAnswer.value.map((id, i) => {
                const itemIndex = q.items.findIndex((x) => x.id === id);
                const item = itemIndex >= 0 ? q.items[itemIndex] : undefined;
                return (
                  <div className="host-ranking-item host-ranking-item--reveal" key={id}>
                    <span className="host-ranking-position">{i + 1}.</span>
                    <span className="host-option-id">{itemIndex >= 0 ? getAnswerDisplayLabel(itemIndex) : id}</span>
                    <span>{item?.label ?? id}</span>
                  </div>
                );
              })}
            </div>
          );
        })()}
      {s.revealExplanation && <p className="host-explanation">{s.revealExplanation}</p>}
      <div className="host-round-summary">
        <div className="host-round-summary-card" data-state="correct">
          <p className="host-control-label">Richtig</p>
          <p>{correctRoundCount}</p>
        </div>
        <div className="host-round-summary-card" data-state="wrong">
          <p className="host-control-label">Falsch</p>
          <p>{wrongRoundCount}</p>
        </div>
        <div className="host-round-summary-card" data-state="missing">
          <p className="host-control-label">Keine Antwort</p>
          <p>{missingRoundCount}</p>
        </div>
      </div>
      <div className="host-progress-block">
        <div className="host-bar-meta">
          <span className="host-section-label host-section-label--compact">Bereit</span>
          <strong>{nextReadyLabel}</strong>
        </div>
        <div
          className="host-progress-bar"
          role="progressbar"
          aria-valuenow={Math.round(nextReadyPercent)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="host-progress-fill" style={{ width: `${nextReadyPercent}%` }} />
        </div>
      </div>
      {s.gamePlanDraft?.revealMode === "manual_with_fallback" && (
        <p className="host-reveal-fallback-hint">Auto-weiter in ~30s falls kein Klick.</p>
      )}
      {s.nextQuestionReadyProgress?.totalEligiblePlayers === 0 && (
        <p className="host-zero-players-hint">
          Keine Spieler verbunden – warte auf Reconnect oder gehe manuell weiter.
        </p>
      )}
    </div>
  );
}

import { QuestionType } from "@quiz/shared-types";

import type { UsePlayerSessionReturn } from "../hooks/usePlayerSession.js";
import {
  formatControllerAnswer,
  getOptionAnswerLabel,
  getQuestionKindLabel,
} from "../lib/helpers.js";

interface PlayerQuestionScreenProps {
  session: UsePlayerSessionReturn;
}

export function PlayerQuestionScreen({ session }: PlayerQuestionScreenProps) {
  if (!session.question) {
    return null;
  }

  return (
    <>
      <div
        className="player-card player-controller-card"
        data-question-type={session.question.type}
        data-status={session.answerStatus}
      >
        <span className="player-kicker">
          {session.question.isDemoQuestion
            ? "Testfrage"
            : `${getQuestionKindLabel(session.question.type)} · Frage ${
                session.question.questionIndex + 1
              } / ${session.question.totalQuestionCount}`}
        </span>
        <h2 className="player-controller-title">
          {session.answerStatus === "accepted" ? "Antwort gespeichert" : "Schau auf den Bildschirm"}
        </h2>
        <p className="player-controller-copy">
          {session.answerStatus === "accepted"
            ? "Warte auf die Auflösung."
            : "Die Frage steht auf dem TV."}
        </p>
        {session.answerStatus === "submitting" && (
          <div className="player-controller-status" data-state="submitting">
            Wird gespeichert…
          </div>
        )}
        {session.answerStatus === "accepted" && (
          <div className="player-controller-status" data-state="saved">
            {session.selectedOptionId && (
              <span>
                ✓ {getOptionAnswerLabel(session.selectedOptionId, session.question)} gewählt
              </span>
            )}
            {!session.selectedOptionId && session.estimateValue && (
              <span>
                ✓ Schätzung: {session.estimateValue}{" "}
                {session.question.type === QuestionType.Estimate && session.question.unit}
              </span>
            )}
            {!session.selectedOptionId && session.textAnswerValue && (
              <span>✓ Antwort gespeichert</span>
            )}
            {!session.selectedOptionId && session.rankingOrder.length > 0 && (
              <span>✓ Reihenfolge gespeichert</span>
            )}
          </div>
        )}
        {session.answerStatus === "locked" && (
          <div className="player-controller-status" data-state="locked">
            Zeit ist um
          </div>
        )}
        {session.answerStatus === "rejected" && (
          <div className="player-controller-status" data-state="error">
            Antwort nicht angekommen – nochmal tippen
          </div>
        )}
      </div>

      {(session.question.type === QuestionType.MultipleChoice ||
        session.question.type === QuestionType.Logic ||
        session.question.type === QuestionType.MajorityGuess) && (
        <div className="player-controller-options" data-status={session.answerStatus}>
          {session.question.options.map((opt, index) => (
            <button
              className="player-controller-option"
              data-option-index={index}
              data-state={session.selectedOptionId === opt.id ? "selected" : "idle"}
              disabled={session.answerStatus !== "idle"}
              key={opt.id}
              onClick={() => session.handleSubmitAnswer(opt.id)}
              type="button"
            >
              <span className="player-controller-option-id">{opt.label}</span>
              {opt.text && <span className="player-controller-option-text">{opt.text}</span>}
            </button>
          ))}
        </div>
      )}

      {session.question.type === QuestionType.Estimate && (
        <form
          className="player-estimate-area"
          onSubmit={(e) => {
            e.preventDefault();
            if (session.answerStatus === "idle" && session.estimateValue !== "") {
              session.handleSubmitEstimate(parseFloat(session.estimateValue));
            }
          }}
        >
          <input
            className="player-estimate-input"
            disabled={session.answerStatus !== "idle"}
            inputMode="decimal"
            onChange={(e) => session.setEstimateValue(e.target.value)}
            placeholder={`${session.question.unit} eingeben...`}
            step="any"
            type="number"
            value={session.estimateValue}
          />
          <button
            className="player-primary-button"
            disabled={session.answerStatus !== "idle" || session.estimateValue === ""}
            type="submit"
          >
            Schätzen
          </button>
        </form>
      )}

      {session.question.type === QuestionType.OpenText && (
        <form
          className="player-estimate-area"
          onSubmit={(e) => {
            e.preventDefault();
            if (session.answerStatus === "idle" && session.textAnswerValue.trim() !== "") {
              session.handleSubmitText(session.textAnswerValue);
            }
          }}
        >
          <input
            className="player-estimate-input"
            disabled={session.answerStatus !== "idle"}
            onChange={(e) => session.setTextAnswerValue(e.target.value)}
            placeholder="Antwort eingeben..."
            type="text"
            value={session.textAnswerValue}
          />
          <button
            className="player-primary-button"
            disabled={session.answerStatus !== "idle" || session.textAnswerValue.trim() === ""}
            type="submit"
          >
            Antworten
          </button>
        </form>
      )}

      {session.question.type === QuestionType.Ranking && (
        <PlayerRankingController session={session} />
      )}
    </>
  );
}

const CONFETTI_COLORS = ["#00e676", "#f6c76a", "#00d4ff", "#c084fc", "#ff6b6b"];

export function PlayerConfetti({ count }: { count: number }) {
  return (
    <div className="player-confetti" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div
          className="player-confetti-piece"
          key={i}
          style={{
            left: `${5 + (i * 90) / count + Math.sin(i * 1.7) * 8}%`,
            animationDuration: `${1.4 + (i % 5) * 0.25}s`,
            animationDelay: `${(i % 4) * 0.09}s`,
            background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            transform: `rotate(${i * 37}deg)`,
          }}
        />
      ))}
    </div>
  );
}

export function PlayerRevealScreen({ session }: PlayerQuestionScreenProps) {
  return (
    <>
      {session.selfRevealState === "correct" && <PlayerConfetti count={14} />}
      <div className="player-feedback" data-state={session.selfRevealState}>
        {session.selfRevealLabel}
      </div>
      <div className="player-card">
        <span className="player-kicker">Auflösung</span>
        <h2 className="player-title">Schau auf den Bildschirm</h2>
        <p className="player-points-earned">
          {session.ownRoundResult?.pointsEarned ?? 0} Punkte verdient.
        </p>
        {session.ownRoundResult?.detail?.exactPositions !== undefined && (
          <p className="player-muted-copy player-muted-copy--compact">
            {session.ownRoundResult.detail.exactPositions} /{" "}
            {session.ownRoundResult.detail.totalPositions ?? "?"} Positionen richtig
            {session.ownRoundResult.detail.bonusPoints
              ? `, ${session.ownRoundResult.detail.bonusPoints} Bonus`
              : ""}
          </p>
        )}
        <div className="player-result-lines">
          <div>
            <span>Deine Antwort</span>
            <strong>
              {formatControllerAnswer(
                session.ownRoundResult?.answer ?? null,
                session.question,
                session.question && session.question.type === QuestionType.Estimate
                  ? session.question.unit
                  : undefined,
              )}
            </strong>
          </div>
          <div>
            <span>Richtig</span>
            <strong>
              {formatControllerAnswer(
                session.correctAnswer,
                session.question,
                session.question && session.question.type === QuestionType.Estimate
                  ? session.question.unit
                  : undefined,
              )}
            </strong>
          </div>
        </div>
        {session.revealExplanation && (
          <p className="player-explanation">{session.revealExplanation}</p>
        )}
      </div>
      <button
        className="player-primary-button player-ready-button"
        disabled={session.isReadyForNext}
        onClick={session.handleReadyForNextQuestion}
        type="button"
      >
        {session.isReadyForNext ? "Warten…" : "Ich bin bereit"}
      </button>
    </>
  );
}

function PlayerRankingController({ session }: PlayerQuestionScreenProps) {
  const question = session.question;
  if (!question || question.type !== QuestionType.Ranking) {
    return null;
  }

  const remaining = question.items.filter((item) => !session.rankingOrder.includes(item.id));

  return (
    <div className="player-ranking-area">
      <p className="player-ranking-instruction">
        Tippe die Elemente in der richtigen Reihenfolge an.
        {remaining.length > 0 && (
          <span className="player-ranking-remaining"> Noch {remaining.length} auswählen.</span>
        )}
      </p>
      {remaining.length > 0 && (
        <>
          <p className="player-ranking-section-label">Verfügbar</p>
          <div className="player-ranking-pool">
            {remaining.map((item) => (
              <button
                className="player-ranking-item"
                disabled={session.answerStatus !== "idle"}
                key={item.id}
                onClick={() => session.setRankingOrder([...session.rankingOrder, item.id])}
                type="button"
              >
                <span>{item.label}</span>
                {item.text && <small>{item.text}</small>}
              </button>
            ))}
          </div>
        </>
      )}
      <p className="player-ranking-section-label">Deine Reihenfolge</p>
      <div className="player-ranking-chosen">
        {question.items.map((_, i) => {
          const filledId = session.rankingOrder[i];
          const item = filledId ? question.items.find((entry) => entry.id === filledId) : undefined;
          return (
            <div className="player-ranking-slot" data-filled={item ? "true" : undefined} key={i}>
              <span className="player-ranking-pos">{i + 1}.</span>
              {item ? (
                <>
                  <span className="player-ranking-slot-label">{item.label}</span>
                  {item.text && <small>{item.text}</small>}
                  {session.answerStatus === "idle" && (
                    <button
                      className="player-ranking-remove"
                      onClick={() =>
                        session.setRankingOrder(
                          session.rankingOrder.filter((entry) => entry !== filledId),
                        )
                      }
                      type="button"
                    >
                      ✕
                    </button>
                  )}
                </>
              ) : (
                <span className="player-ranking-slot-empty">Tippe ein Element</span>
              )}
            </div>
          );
        })}
      </div>
      <div className="player-ranking-actions">
        {session.rankingOrder.length > 0 && session.answerStatus === "idle" && (
          <button
            className="player-ranking-reset"
            onClick={() => session.setRankingOrder([])}
            type="button"
          >
            Zurücksetzen
          </button>
        )}
        <button
          className="player-primary-button player-ranking-submit"
          disabled={
            session.rankingOrder.length < question.items.length || session.answerStatus !== "idle"
          }
          onClick={() => session.handleSubmitRanking(session.rankingOrder)}
          type="button"
        >
          Reihenfolge bestätigen
        </button>
      </div>
    </div>
  );
}

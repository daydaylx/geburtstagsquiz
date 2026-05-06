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
      <div className="player-card player-controller-card" data-status={session.answerStatus}>
        <span className="player-kicker">
          {session.question.isDemoQuestion
            ? "Testfrage"
            : `${getQuestionKindLabel(session.question.type)} · Frage ${
                session.question.questionIndex + 1
              } / ${session.question.totalQuestionCount}`}
        </span>
        <h2 className="player-controller-title">
          {session.answerStatus === "accepted"
            ? "Antwort gespeichert"
            : "Schau auf den Bildschirm vorne"}
        </h2>
        <p className="player-controller-copy">
          {session.answerStatus === "accepted"
            ? "Warte auf die Auflösung."
            : "Die Frage und Antworttexte stehen vorne auf dem Hauptbildschirm."}
        </p>
        {session.answerStatus === "submitting" && (
          <div className="player-controller-status" data-state="submitting">
            Sende Antwort...
          </div>
        )}
        {session.answerStatus === "accepted" && (
          <div className="player-controller-status" data-state="saved">
            {session.selectedOptionId && (
              <span>
                Du hast {getOptionAnswerLabel(session.selectedOptionId, session.question)} gewählt.
              </span>
            )}
            {!session.selectedOptionId && session.estimateValue && (
              <span>
                Deine Schätzung: {session.estimateValue}{" "}
                {session.question.type === QuestionType.Estimate && session.question.unit}
              </span>
            )}
            {!session.selectedOptionId && session.textAnswerValue && (
              <span>Deine Antwort: {session.textAnswerValue}</span>
            )}
            {!session.selectedOptionId && session.rankingOrder.length > 0 && (
              <span>
                Deine Reihenfolge:{" "}
                {session.rankingOrder
                  .map((id) => getOptionAnswerLabel(id, session.question))
                  .join(" > ")}
              </span>
            )}
          </div>
        )}
        {session.answerStatus === "locked" && (
          <div className="player-controller-status" data-state="locked">
            Zeit abgelaufen
          </div>
        )}
        {session.answerStatus === "rejected" && (
          <div className="player-controller-status" data-state="error">
            Antwort nicht angenommen
          </div>
        )}
      </div>

      {(session.question.type === QuestionType.MultipleChoice ||
        session.question.type === QuestionType.Logic ||
        session.question.type === QuestionType.MajorityGuess) && (
        <div className="player-controller-options" data-status={session.answerStatus}>
          {session.question.options.map((opt) => (
            <button
              className="player-controller-option"
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
        <div className="player-estimate-area">
          <input
            className="player-estimate-input"
            disabled={session.answerStatus !== "idle"}
            onChange={(e) => session.setEstimateValue(e.target.value)}
            placeholder={`${session.question.unit} eingeben...`}
            step="any"
            type="number"
            value={session.estimateValue}
          />
          <button
            className="player-primary-button"
            disabled={session.answerStatus !== "idle" || session.estimateValue === ""}
            onClick={() => session.handleSubmitEstimate(parseFloat(session.estimateValue))}
            type="button"
          >
            Schätzen
          </button>
        </div>
      )}

      {session.question.type === QuestionType.OpenText && (
        <div className="player-estimate-area">
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
            onClick={() => session.handleSubmitText(session.textAnswerValue)}
            type="button"
          >
            Antworten
          </button>
        </div>
      )}

      {session.question.type === QuestionType.Ranking && (
        <PlayerRankingController session={session} />
      )}
    </>
  );
}

export function PlayerRevealScreen({ session }: PlayerQuestionScreenProps) {
  return (
    <>
      <div className="player-feedback" data-state={session.selfRevealState}>
        {session.selfRevealLabel}
      </div>
      <div className="player-card">
        <span className="player-kicker">Auflösung</span>
        <h2 className="player-title">Schau auf den Bildschirm vorne</h2>
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
        {session.isReadyForNext ? "Warten auf andere..." : "Bereit für nächste Frage"}
      </button>
    </>
  );
}

function PlayerRankingController({ session }: PlayerQuestionScreenProps) {
  const question = session.question;
  if (!question || question.type !== QuestionType.Ranking) {
    return null;
  }

  return (
    <div className="player-ranking-area">
      <p className="player-ranking-section-label">
        Einordnen – tippe in der richtigen Reihenfolge an
      </p>
      <div className="player-ranking-pool">
        {question.items
          .filter((item) => !session.rankingOrder.includes(item.id))
          .map((item) => (
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
      {session.rankingOrder.length > 0 && (
        <>
          <p className="player-ranking-section-label">Deine Reihenfolge</p>
          <div className="player-ranking-chosen">
            {session.rankingOrder.map((id, i) => {
              const item = question.items.find((entry) => entry.id === id)!;
              return (
                <div className="player-ranking-slot" key={id}>
                  <span className="player-ranking-pos">{i + 1}.</span>
                  <span>{item.label}</span>
                  {item.text && <small>{item.text}</small>}
                  {session.answerStatus === "idle" && (
                    <button
                      className="player-ranking-remove"
                      onClick={() =>
                        session.setRankingOrder(session.rankingOrder.filter((entry) => entry !== id))
                      }
                      type="button"
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
      <button
        className="player-primary-button player-ranking-submit"
        disabled={session.rankingOrder.length < question.items.length || session.answerStatus !== "idle"}
        onClick={() => session.handleSubmitRanking(session.rankingOrder)}
        type="button"
      >
        Reihenfolge bestätigen
      </button>
    </div>
  );
}

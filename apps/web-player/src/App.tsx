import { type ConnectionState } from "./hooks/useWebSocket.js";
import {
  formatControllerAnswer,
  getOptionAnswerLabel,
  getQuestionKindLabel,
} from "./lib/helpers.js";
import { useWebSocket } from "./hooks/useWebSocket.js";
import { usePlayerSession } from "./hooks/usePlayerSession.js";
import { normalizeJoinCode } from "@quiz/shared-utils";
import { QuestionType } from "@quiz/shared-types";

function getConnectionLabel(connectionState: ConnectionState): string {
  switch (connectionState) {
    case "connecting":
      return "Verbinde...";
    case "reconnecting":
      return "Re-connect...";
    case "connected":
      return "Online";
    default:
      return "Offline";
  }
}

export function App() {
  const { connectionState, sendEvent, onMessage, notifyConnected } = useWebSocket();
  const session = usePlayerSession({ sendEvent, onMessage, notifyConnected });

  return (
    <main className="player-shell" data-answer-status={session.answerStatus} data-screen={session.screen}>
      <header className="player-header">
        <div className="player-status" data-state={connectionState}>
          {getConnectionLabel(connectionState)}
        </div>
        {session.screen === "question" && session.remainingMs > 0 && (
          <div
            className="player-timer-mini"
            data-urgent={session.isTimerUrgent ? "true" : undefined}
            data-warning={session.isTimerWarning ? "true" : undefined}
          >
            {session.timerSeconds}s
          </div>
        )}
      </header>

      {session.notice && (
        <div className="player-notice" data-kind={session.notice.kind}>
          {session.notice.text}
        </div>
      )}

      <div key={session.screen} className="player-main">
        {session.screen === "join" && (
          <div className="player-card">
            <span className="player-kicker">Willkommen</span>
            <h1 className="player-title">Mitspielen</h1>
            <div className="player-join-form">
              <input
                autoCapitalize="characters"
                className="player-input"
                maxLength={6}
                onChange={(e) => session.setJoinCode(normalizeJoinCode(e.target.value))}
                placeholder="Raumcode"
                value={session.joinCode}
              />
              <input
                autoCapitalize="words"
                className="player-input"
                maxLength={20}
                onChange={(e) => session.setPlayerName(e.target.value)}
                placeholder="Dein Name"
                value={session.playerName}
              />
              <button
                className="player-primary-button"
                disabled={session.isJoining || session.joinCode.length !== 6 || !session.playerName}
                onClick={session.handleJoin}
                type="button"
              >
                {session.isJoining ? "Beitreten..." : "Los geht's"}
              </button>
            </div>
          </div>
        )}

        {session.screen === "lobby" && (
          <>
            <div className="player-card">
              <span className="player-kicker">Lobby</span>
              <h1 className="player-title">{session.playerName || "Spieler"}</h1>
              <p className="player-muted-copy">
                Warte auf das Quiz. Sobald es startet, geht es hier automatisch weiter.
              </p>
            </div>
            <div className="player-scoreboard-list">
              <div className="player-scoreboard-item">
                <span>Andere Spieler</span>
                <strong>{session.lobby?.playerCount ?? 0}</strong>
              </div>
            </div>
          </>
        )}

        {session.screen === "question" && session.question && (
          <>
            <div className="player-card player-controller-card" data-status={session.answerStatus}>
              <span className="player-kicker">
                {session.question.isDemoQuestion
                  ? "Testfrage"
                  : `${getQuestionKindLabel(session.question.type)} · Frage ${session.question.questionIndex + 1} / ${session.question.totalQuestionCount}`}
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
                    <span>Du hast {getOptionAnswerLabel(session.selectedOptionId, session.question)} gewählt.</span>
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
                      {session.rankingOrder.map((id) => getOptionAnswerLabel(id, session.question)).join(" > ")}
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
                    key={opt.id}
                    className="player-controller-option"
                    data-state={session.selectedOptionId === opt.id ? "selected" : "idle"}
                    disabled={session.answerStatus !== "idle"}
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

            {session.question.type === QuestionType.Ranking && (() => {
              const q = session.question!;
              return (
              <div className="player-ranking-area">
                <p className="player-ranking-section-label">
                  Einordnen – tippe in der richtigen Reihenfolge an
                </p>
                <div className="player-ranking-pool">
                  {q.items
                    .filter((item) => !session.rankingOrder.includes(item.id))
                    .map((item) => (
                      <button
                        key={item.id}
                        className="player-ranking-item"
                        disabled={session.answerStatus !== "idle"}
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
                        const item = q.items.find((x) => x.id === id)!;
                        return (
                          <div key={id} className="player-ranking-slot">
                            <span className="player-ranking-pos">{i + 1}.</span>
                            <span>{item.label}</span>
                            {item.text && <small>{item.text}</small>}
                            {session.answerStatus === "idle" && (
                              <button
                                className="player-ranking-remove"
                                onClick={() =>
                                  session.setRankingOrder(session.rankingOrder.filter((x) => x !== id))
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
                  disabled={session.rankingOrder.length < q.items.length || session.answerStatus !== "idle"}
                  onClick={() => session.handleSubmitRanking(session.rankingOrder)}
                  type="button"
                >
                  Reihenfolge bestätigen
                </button>
              </div>
              );
            })()}
          </>
        )}

        {session.screen === "reveal" && (
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
              {session.revealExplanation && <p className="player-explanation">{session.revealExplanation}</p>}
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
        )}

        {session.screen === "scoreboard" && (
          <>
            {session.ownScoreboardEntry && (
              <div className="player-my-rank">
                <div className="player-my-rank-label">Dein Platz</div>
                <div className="player-my-rank-value">{session.ownScoreboardPlacement + 1}.</div>
                <div className="player-my-rank-score">{session.ownScoreboardEntry.score} Punkte</div>
              </div>
            )}
            <div className="player-card">
              <span className="player-kicker">Zwischenstand</span>
              <h2 className="player-title">Gesamtrangliste vorne</h2>
              <p className="player-muted-copy player-muted-copy--compact">
                Warte auf die nächste Frage und schau auf den Bildschirm vorne.
              </p>
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
        )}

        {session.screen === "finished" && (
          <div className="player-card player-finished-card">
            <span className="player-kicker">Quiz beendet</span>
            <h1 className="player-title">Vielen Dank!</h1>
            <div className="player-my-rank-value player-final-rank">
              {session.ownFinalPlacement >= 0 ? `#${session.ownFinalPlacement + 1}` : "-"}
            </div>
            <button className="player-primary-button" onClick={() => window.location.reload()}>
              Nochmal spielen
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

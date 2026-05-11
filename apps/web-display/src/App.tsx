import { QuestionType } from "@quiz/shared-types";
import { useWebSocket, type ConnectionState } from "@quiz/shared-hooks";
import { DisplayRevealScreen } from "./components/DisplayRevealScreen.js";
import { DisplayLobbyScreen } from "./components/DisplayLobbyScreen.js";
import { DisplayScoreboardScreen } from "./components/DisplayScoreboardScreen.js";
import { DisplayFinishedScreen } from "./components/DisplayFinishedScreen.js";
import { getAnswerDisplayLabel, getQuestionTypeLabel } from "./lib/labels.js";
import { useDisplaySession } from "./hooks/useDisplaySession.js";

function getConnectionLabel(state: ConnectionState): string {
  switch (state) {
    case "connecting":
      return "Verbinde...";
    case "reconnecting":
      return "Neuverbindung...";
    case "connected":
      return "Online";
  }
}

export function App() {
  const { connectionState, sendEvent, onMessage, notifyConnected } = useWebSocket();
  const s = useDisplaySession({ sendEvent, onMessage, notifyConnected, connectionState });

  const timerSeconds = Math.ceil(s.remainingMs / 1000);
  const isTimerUrgent = s.remainingMs > 0 && timerSeconds <= 5;
  const isTimerWarning = s.remainingMs > 0 && timerSeconds <= 10 && timerSeconds > 5;

  const RING_R = 42;
  const RING_C = 2 * Math.PI * RING_R;
  const ringOffset = s.totalMs > 0 ? RING_C * (1 - s.remainingMs / s.totalMs) : 0;

  const correctCount = s.roundResults.filter((r) => r.isCorrect).length;
  const wrongCount = s.roundResults.filter((r) => !r.isCorrect && r.answer !== null).length;
  const noneCount = s.roundResults.filter((r) => r.answer === null).length;
  const visibleReadyProgress =
    s.question &&
    s.nextQuestionReadyProgress &&
    s.nextQuestionReadyProgress.questionId === s.question.questionId
      ? s.nextQuestionReadyProgress
      : null;
  const readyProgressAllReady =
    !!visibleReadyProgress &&
    visibleReadyProgress.totalEligiblePlayers > 0 &&
    visibleReadyProgress.readyCount >= visibleReadyProgress.totalEligiblePlayers;
  const readyProgressPercent =
    visibleReadyProgress && visibleReadyProgress.totalEligiblePlayers > 0
      ? Math.round(
          (visibleReadyProgress.readyCount / visibleReadyProgress.totalEligiblePlayers) * 100,
        )
      : 0;

  return (
    <div className="display-shell">
      <div className="display-topbar">
        <span className="display-brand">Quiz Display</span>
        <span className="display-conn" data-state={connectionState}>
          {getConnectionLabel(connectionState)}
        </span>
      </div>

      <div className="display-main">
        {s.preCountdown !== null && s.displayShowLevel === "high" && (
          <div className="display-pre-countdown" aria-live="assertive">
            <div className="display-countdown-number" key={s.preCountdown}>
              {s.preCountdown === 0 ? "Los!" : s.preCountdown}
            </div>
          </div>
        )}

        {s.screen === "setup" && (
          <div className="display-setup">
            <div className="display-setup-hero">
              <p className="display-setup-label">Geburtstags-Quiz</p>
              <h1>Display wartet auf Host</h1>
              <p className="display-setup-hint">
                Öffne das Display-Fenster über den Host-Controller und zieh es auf den HDMI-TV.
              </p>
            </div>
            <div className="display-setup-steps">
              <div className="display-setup-step">
                <span className="display-setup-step-num">1</span>
                <span>Host lokal öffnen</span>
              </div>
              <div className="display-setup-step-arrow">→</div>
              <div className="display-setup-step">
                <span className="display-setup-step-num">2</span>
                <span>Raum erstellen</span>
              </div>
              <div className="display-setup-step-arrow">→</div>
              <div className="display-setup-step">
                <span className="display-setup-step-num">3</span>
                <span>Display öffnen</span>
              </div>
            </div>
            {s.canCreateRoomFromDisplay && (
              <button
                className="display-create-btn"
                disabled={s.isCreatingRoom || connectionState !== "connected"}
                onClick={s.handleCreateRoom}
                type="button"
              >
                {s.isCreatingRoom ? "Erstelle Raum…" : "Fallback-Raum erstellen"}
              </button>
            )}
            {s.notice && (
              <div className="display-notice-block">
                <p className="display-notice">{s.notice}</p>
                {s.canRetryConnect && (
                  <button
                    className="display-retry-btn"
                    disabled={connectionState !== "connected"}
                    onClick={s.handleRetryConnect}
                    type="button"
                  >
                    Erneut versuchen
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {s.screen === "lobby" && <DisplayLobbyScreen session={s} />}

        {s.screen === "question" && s.question && (
          <div className="display-question" key={s.question.questionId} data-fading={s.isFadingOut || undefined}>
            <div className="display-question-meta">
              Frage {s.question.questionIndex + 1} / {s.question.totalQuestionCount}
              <span className="display-question-type">
                {" · "}
                {getQuestionTypeLabel(s.question.type)}
              </span>
            </div>
            <h2 className="display-question-text">{s.question.text}</h2>

            {"options" in s.question && (
              <ul
                className={`display-options${s.question.options.some((o) => o.label.length > 40) ? " display-options--long" : ""}`}
              >
                {s.question.options.map((opt, index) => (
                  <li key={opt.id} className="display-option" data-option-index={index}>
                    <span className="display-option-label">{getAnswerDisplayLabel(index)}</span>
                    <span className="display-option-text">{opt.label}</span>
                  </li>
                ))}
              </ul>
            )}

            {"items" in s.question && (
              <ul
                className={`display-options${s.question.items.some((item) => item.label.length > 40) ? " display-options--long" : ""}`}
              >
                {s.question.items.map((item, idx) => (
                  <li key={item.id} className="display-option">
                    <span className="display-option-label">{idx + 1}.</span>
                    <span className="display-option-text">{item.label}</span>
                  </li>
                ))}
              </ul>
            )}

            {s.question.type === QuestionType.Estimate && (
              <p className="display-estimate-context">
                {s.question.context} ({s.question.unit})
              </p>
            )}

            {s.question.type === QuestionType.OpenText && (
              <p className="display-estimate-context">Freitextantwort</p>
            )}

            <div className="display-footer">
              <div className="display-timer-wrap">
                <svg className="display-timer-svg" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r={RING_R} className="display-timer-track" />
                  <circle
                    cx="50"
                    cy="50"
                    r={RING_R}
                    className="display-timer-fill"
                    data-urgent={isTimerUrgent ? "true" : undefined}
                    data-warning={isTimerWarning ? "true" : undefined}
                    style={{ strokeDasharray: RING_C, strokeDashoffset: ringOffset }}
                  />
                </svg>
                <span
                  className="display-timer-label"
                  data-urgent={isTimerUrgent ? "true" : undefined}
                  data-warning={isTimerWarning ? "true" : undefined}
                >
                  {s.remainingMs > 0 ? timerSeconds : "—"}
                </span>
              </div>
              {s.answerProgress && (
                <div className="display-answer-progress">
                  <span>
                    {s.answerProgress.answeredCount} / {s.answerProgress.totalEligiblePlayers}{" "}
                    geantwortet
                  </span>
                  {s.answerProgress.totalEligiblePlayers > 0 && (
                    <div className="display-progress-bar">
                      <div
                        className="display-progress-fill"
                        style={{
                          width: `${(s.answerProgress.answeredCount / s.answerProgress.totalEligiblePlayers) * 100}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {s.screen === "reveal" && s.question && (
          <DisplayRevealScreen
            correctCount={correctCount}
            noneCount={noneCount}
            readyProgressAllReady={readyProgressAllReady}
            readyProgressPercent={readyProgressPercent}
            session={s}
            visibleReadyProgress={visibleReadyProgress}
            wrongCount={wrongCount}
          />
        )}

        {s.screen === "scoreboard" && (
          <DisplayScoreboardScreen
            session={s}
            readyProgressAllReady={readyProgressAllReady}
            readyProgressPercent={readyProgressPercent}
            visibleReadyProgress={visibleReadyProgress}
          />
        )}

        {s.screen === "finished" && <DisplayFinishedScreen session={s} />}
      </div>
    </div>
  );
}

import { QuestionType } from "@quiz/shared-types";
import { useWebSocket, type ConnectionState } from "@quiz/shared-hooks";
import { DisplayRevealScreen } from "./components/DisplayRevealScreen.js";
import { getAnswerDisplayLabel, getQuestionTypeLabel } from "./lib/labels.js";
import { useDisplaySession } from "./hooks/useDisplaySession.js";

const CONFETTI_COLORS = ["#ff6b6b", "#ffd500", "#00d4ff", "#00e676", "#c061cb"];

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
              <h1>Quiz Display</h1>
              <p className="display-setup-hint">
                Dieser Bildschirm ist das Spielfeld – stell ihn gut sichtbar für alle auf.
              </p>
            </div>
            <div className="display-setup-steps">
              <div className="display-setup-step">
                <span className="display-setup-step-num">1</span>
                <span>Quizraum erstellen</span>
              </div>
              <div className="display-setup-step-arrow">→</div>
              <div className="display-setup-step">
                <span className="display-setup-step-num">2</span>
                <span>QR-Code zeigen, Spieler beitreten lassen</span>
              </div>
              <div className="display-setup-step-arrow">→</div>
              <div className="display-setup-step">
                <span className="display-setup-step-num">3</span>
                <span>Host-Gerät verbinden &amp; Quiz starten</span>
              </div>
            </div>
            <button
              className="display-create-btn"
              disabled={s.isCreatingRoom || connectionState !== "connected"}
              onClick={s.handleCreateRoom}
              type="button"
            >
              {s.isCreatingRoom ? "Erstelle Raum…" : "Quizraum erstellen"}
            </button>
            {s.notice && <p className="display-notice">{s.notice}</p>}
          </div>
        )}

        {s.screen === "lobby" && s.roomInfo && (
          <div
            className={`display-lobby ${s.hostPaired ? "display-lobby--host-paired" : "display-lobby--pre-host"}`}
          >
            <div className="display-qr-block display-qr-block--primary">
              <h2>Beitreten</h2>
              {s.playerQrUrl && <img src={s.playerQrUrl} alt="Player-QR-Code" />}
              <code className="display-join-code">{s.roomInfo.joinCode}</code>
            </div>

            {!s.hostPaired && (
              <div className="display-qr-block display-qr-block--host">
                <h2>Host pairen</h2>
                {s.hostQrUrl && <img src={s.hostQrUrl} alt="Host-QR-Code" />}
                <p className="display-host-pending">Warte auf Host…</p>
              </div>
            )}

            {s.hostPaired && (
              <div className="display-host-connected">
                <span className="display-host-connected-dot" aria-hidden="true" />
                Host verbunden
              </div>
            )}

            <div className="display-player-count">
              <span className="display-player-count-number">{s.lobby?.playerCount ?? 0}</span>{" "}
              Spieler
            </div>
          </div>
        )}

        {s.screen === "question" && s.question && (
          <div className="display-question" data-fading={s.isFadingOut || undefined}>
            <div className="display-question-meta">
              Frage {s.question.questionIndex + 1} / {s.question.totalQuestionCount}
              <span className="display-question-type">
                {" · "}
                {getQuestionTypeLabel(s.question.type)}
              </span>
            </div>
            <h2 className="display-question-text">{s.question.text}</h2>

            {"options" in s.question && (
              <div
                className={`display-options${s.question.options.some((o) => o.label.length > 40) ? " display-options--long" : ""}`}
              >
                {s.question.options.map((opt, index) => (
                  <div key={opt.id} className="display-option" data-option-index={index}>
                    <span className="display-option-label">{getAnswerDisplayLabel(index)}</span>
                    <span className="display-option-text">{opt.label}</span>
                  </div>
                ))}
              </div>
            )}

            {"items" in s.question && (
              <div
                className={`display-options${s.question.items.some((item) => item.label.length > 40) ? " display-options--long" : ""}`}
              >
                {s.question.items.map((item, idx) => (
                  <div key={item.id} className="display-option">
                    <span className="display-option-label">{idx + 1}.</span>
                    <span className="display-option-text">{item.label}</span>
                  </div>
                ))}
              </div>
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

        {s.screen === "scoreboard" && s.scoreboard && (
          <div className="display-scoreboard" data-fading={s.isFadingOut || undefined}>
            <h2>Zwischenstand</h2>
            <ol className="display-scoreboard-list">
              {(() => {
                const highestScore = s.scoreboard.scoreboard[0]?.score ?? 0;
                const maxScore = Math.max(highestScore, s.question?.totalQuestionCount ?? 10, 10);
                return s.scoreboard.scoreboard.slice(0, 8).map((entry, i) => {
                  const change = s.scoreChanges.find((c) => c.playerId === entry.playerId);
                  const rankDelta = change ? change.previousRank - change.rank : 0;
                  const progressPercent = Math.min(
                    100,
                    Math.max(0, (entry.score / maxScore) * 100),
                  );
                  return (
                    <li
                      key={entry.playerId}
                      className="display-scoreboard-entry"
                      data-rank={i + 1}
                      data-changed={change && change.delta > 0 ? "true" : undefined}
                    >
                      <span className="display-rank">{i + 1}.</span>
                      {rankDelta !== 0 && (
                        <span
                          className="display-rank-change"
                          data-direction={rankDelta > 0 ? "up" : "down"}
                        >
                          {rankDelta > 0 ? `▲${rankDelta}` : `▼${Math.abs(rankDelta)}`}
                        </span>
                      )}
                      <span className="display-name">{entry.name}</span>
                      <div
                        className="display-progress-track"
                        style={{ "--progress": `${progressPercent}%` } as React.CSSProperties}
                      >
                        <span className="display-progress-label">Start</span>
                        <div className="display-progress-bar">
                          <div className="display-progress-fill" />
                          <div className="display-progress-marker" />
                        </div>
                        <span className="display-progress-label">Ziel</span>
                      </div>
                      {change && change.delta > 0 && (
                        <span className="display-score-delta">+{change.delta}</span>
                      )}
                      <span className="display-score">{entry.score}</span>
                    </li>
                  );
                });
              })()}
            </ol>
            {visibleReadyProgress && (
              <div
                className="display-ready-block"
                data-all-ready={readyProgressAllReady ? "true" : undefined}
              >
                <div className="display-ready-label">
                  {readyProgressAllReady
                    ? "Alle bereit!"
                    : `${visibleReadyProgress.readyCount} / ${visibleReadyProgress.totalEligiblePlayers} bereit`}
                </div>
                <div className="display-ready-track">
                  <div
                    className="display-ready-fill"
                    style={{ width: `${readyProgressPercent}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {s.screen === "finished" &&
          s.finalResult &&
          (() => {
            const fr = s.finalResult!;
            return (
              <div className="display-finished" data-fading={s.isFadingOut || undefined}>
                <h1>Quiz beendet!</h1>

                <div className="display-podium">
                  {[1, 0, 2].map((rankIndex) => {
                    const entry = fr.finalScoreboard[rankIndex];
                    if (!entry) return null;
                    return (
                      <div
                        key={rankIndex}
                        className={`display-podium-entry display-podium-entry--${rankIndex + 1}`}
                      >
                        <div className="display-podium-rank-badge">{rankIndex + 1}</div>
                        <div className="display-podium-name">{entry.name}</div>
                        <div className="display-podium-score">{entry.score} Pkt</div>
                      </div>
                    );
                  })}
                </div>

                {fr.finalScoreboard.length > 3 && (
                  <ol className="display-scoreboard-list">
                    {fr.finalScoreboard.slice(3, 8).map((entry, i) => (
                      <li
                        key={entry.playerId}
                        className="display-scoreboard-entry"
                        data-rank={i + 4}
                      >
                        <span className="display-rank">{i + 4}.</span>
                        <span className="display-name">{entry.name}</span>
                        <span className="display-score">{entry.score}</span>
                      </li>
                    ))}
                  </ol>
                )}

                {fr.finalStats && (
                  <div className="display-final-stats">
                    {fr.finalStats.mostCorrect && (
                      <div className="display-final-stat">
                        <span className="display-final-stat-label">Meiste richtig</span>
                        <span className="display-final-stat-value">
                          {fr.finalStats.mostCorrect.name} · {fr.finalStats.mostCorrect.count}×
                        </span>
                      </div>
                    )}
                    {fr.finalStats.fastestAnswer && (
                      <div className="display-final-stat">
                        <span className="display-final-stat-label">Schnellste Antwort</span>
                        <span className="display-final-stat-value">
                          {fr.finalStats.fastestAnswer.name}
                        </span>
                      </div>
                    )}
                    {fr.finalStats.closestGap && (
                      <div className="display-final-stat">
                        <span className="display-final-stat-label">Knappster Abstand</span>
                        <span className="display-final-stat-value">
                          {fr.finalStats.closestGap.points} Punkte
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {s.displayShowLevel !== "minimal" && (
                  <div className="display-confetti" aria-hidden="true">
                    {Array.from({ length: 30 }).map((_, i) => (
                      <div
                        key={i}
                        className="display-confetti-piece"
                        style={{
                          left: `${(i * 3.37) % 100}%`,
                          animationDelay: `${(i * 0.12) % 1.8}s`,
                          animationDuration: `${2.8 + ((i * 0.07) % 1.5)}s`,
                          background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
      </div>
    </div>
  );
}

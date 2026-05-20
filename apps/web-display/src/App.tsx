import { type ConnectionState, useWebSocket } from "@quiz/shared-hooks";
import { DisplayFinishedScreen } from "./components/DisplayFinishedScreen.js";
import { DisplayLobbyScreen } from "./components/DisplayLobbyScreen.js";
import { DisplayQuestionScreen } from "./components/DisplayQuestionScreen.js";
import { DisplayRevealScreen } from "./components/DisplayRevealScreen.js";
import { DisplayScoreboardScreen } from "./components/DisplayScoreboardScreen.js";
import { useDisplaySession } from "./hooks/useDisplaySession.js";
import { getQuestionTypeLabel } from "./lib/labels.js";

function getConnectionLabel(state: ConnectionState): string {
  switch (state) {
    case "connecting":
      return "Verbinde...";
    case "reconnecting":
      return "Neuverbindung...";
    case "connectionerror":
      return "Server nicht erreichbar";
    case "connected":
      return "Online";
    case "disconnected":
      return "Getrennt";
  }
}

function getConnectionOverlayCopy(state: ConnectionState): { title: string; detail: string } | null {
  switch (state) {
    case "connecting":
      return {
        title: "Verbindung wird hergestellt",
        detail: "Das Display wartet auf den Quiz-Server.",
      };
    case "reconnecting":
      return {
        title: "Verbindung unterbrochen",
        detail:
          "Das Display verbindet sich automatisch wieder. Bitte Server oder Netzwerk nicht neu laden, wenn der Host noch läuft.",
      };
    case "connectionerror":
      return {
        title: "Server nicht erreichbar",
        detail:
          "Bitte im Host prüfen, ob quiz.sh oder der Server noch läuft. Das Display versucht weiter, sich zu verbinden.",
      };
    case "disconnected":
      return {
        title: "Display getrennt",
        detail: "Die Verbindung wurde beendet. Bitte das Display-Fenster über den Host erneut öffnen.",
      };
    case "connected":
      return null;
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
    s.question && s.nextQuestionReadyProgress && s.nextQuestionReadyProgress.questionId === s.question.questionId
      ? s.nextQuestionReadyProgress
      : null;
  const readyProgressAllReady =
    !!visibleReadyProgress &&
    visibleReadyProgress.totalEligiblePlayers > 0 &&
    visibleReadyProgress.readyCount >= visibleReadyProgress.totalEligiblePlayers;
  const readyProgressPercent =
    visibleReadyProgress && visibleReadyProgress.totalEligiblePlayers > 0
      ? Math.round((visibleReadyProgress.readyCount / visibleReadyProgress.totalEligiblePlayers) * 100)
      : 0;
  const connectionOverlay = getConnectionOverlayCopy(connectionState);
  const showConnectionOverlay =
    !!connectionOverlay && (connectionState !== "connecting" || s.screen !== "setup" || !!s.roomInfo);

  return (
    <div
      className="display-shell"
      data-screen={s.screen}
      data-question-type={s.screen === "question" && s.question ? s.question.type : undefined}
    >
      <div className="display-topbar">
        <span className="display-brand">QUIZ</span>
        {(s.screen === "question" || s.screen === "reveal") && s.question && (
          <div className="display-topbar-meta">
            <span>
              Frage {s.question.questionIndex + 1} / {s.question.totalQuestionCount}
            </span>
            <span className="display-topbar-divider" aria-hidden="true" />
            <span className="display-topbar-type">{getQuestionTypeLabel(s.question.type)}</span>
            <span className="display-topbar-divider" aria-hidden="true" />
            <span className="display-topbar-status">{s.screen === "question" ? "Aktiv" : "Auflösung"}</span>
          </div>
        )}
        <div className="display-topbar-actions">
          {s.showModeratorAudioUnlock && (
            <button className="display-audio-unlock" onClick={s.handleEnableModeratorAudio} type="button">
              {s.moderatorAudioStatus.audioBlocked ? "Audio freigeben" : "Audio aktivieren"}
            </button>
          )}
          <span
            className="display-conn-dot"
            data-state={connectionState}
            role="status"
            aria-label={getConnectionLabel(connectionState)}
          />
        </div>
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
                <span>Host öffnen</span>
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
          <DisplayQuestionScreen
            isTimerUrgent={isTimerUrgent}
            isTimerWarning={isTimerWarning}
            ringCircumference={RING_C}
            ringOffset={ringOffset}
            session={s}
            timerSeconds={timerSeconds}
          />
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

      {showConnectionOverlay && connectionOverlay && (
        <div className="display-connection-overlay" data-state={connectionState} role="status">
          <div className="display-connection-panel">
            <span className="display-connection-kicker">{getConnectionLabel(connectionState)}</span>
            <h2>{connectionOverlay.title}</h2>
            <p>{connectionOverlay.detail}</p>
          </div>
        </div>
      )}
    </div>
  );
}

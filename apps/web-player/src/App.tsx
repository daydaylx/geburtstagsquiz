import { useWebSocket, type ConnectionState } from "@quiz/shared-hooks";
import { usePlayerSession } from "./hooks/usePlayerSession.js";
import { PlayerQuestionScreen, PlayerRevealScreen } from "./components/PlayerQuestionScreen.js";
import { PlayerJoinScreen } from "./components/PlayerJoinScreen.js";
import { PlayerLobbyScreen } from "./components/PlayerLobbyScreen.js";
import { PlayerScoreboardScreen } from "./components/PlayerScoreboardScreen.js";
import { PlayerFinishedScreen } from "./components/PlayerFinishedScreen.js";

function getConnectionLabel(connectionState: ConnectionState): string {
  switch (connectionState) {
    case "connecting":
      return "Verbinde...";
    case "reconnecting":
      return "Neuverbindung...";
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
    <main
      className="player-shell"
      data-answer-status={session.answerStatus}
      data-screen={session.screen}
    >
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
        <div className="player-notice" data-kind={session.notice.kind} role="alert">
          {session.notice.text}
        </div>
      )}

      {connectionState !== "connected" && session.screen !== "join" && (
        <div className="player-reconnect-overlay">
          <div className="player-reconnect-card">
            <div className="player-reconnect-spinner" />
            <span className="player-reconnect-text">Verbindung wird hergestellt…</span>
          </div>
        </div>
      )}

      <div key={session.screen} className="player-main">
        {session.screen === "join" && <PlayerJoinScreen session={session} />}
        {session.screen === "lobby" && <PlayerLobbyScreen session={session} />}
        {session.screen === "question" && session.question && (
          <PlayerQuestionScreen session={session} />
        )}
        {session.screen === "reveal" && <PlayerRevealScreen session={session} />}
        {session.screen === "scoreboard" && <PlayerScoreboardScreen session={session} />}
        {session.screen === "finished" && <PlayerFinishedScreen session={session} />}
      </div>
    </main>
  );
}

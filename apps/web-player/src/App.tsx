import { useWebSocket, type ConnectionState } from "@quiz/shared-hooks";
import { usePlayerSession } from "./hooks/usePlayerSession.js";
import { normalizeJoinCode } from "@quiz/shared-utils";
import {
  PlayerQuestionScreen,
  PlayerRevealScreen,
  PlayerConfetti,
} from "./components/PlayerQuestionScreen.js";

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
        <div className="player-notice" data-kind={session.notice.kind}>
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
        {session.screen === "join" && (
          <div className="player-card">
            <span className="player-kicker">Willkommen</span>
            <h1 className="player-title">Mitspielen</h1>
            <form
              className="player-join-form"
              onSubmit={(e) => {
                e.preventDefault();
                session.handleJoin();
              }}
            >
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
                type="submit"
              >
                {session.isJoining ? "Beitreten…" : "Spielen"}
              </button>
            </form>
          </div>
        )}

        {session.screen === "lobby" && (
          <>
            <div className="player-card">
              <span className="player-kicker">Lobby</span>
              <h1 className="player-title">{session.playerName || "Spieler"}</h1>
              {session.categories.length > 0 ? (
                <p className="player-muted-copy">
                  Wähle eine Kategorie – die meisten Stimmen gewinnen.
                </p>
              ) : (
                <p className="player-muted-copy">
                  Warte auf das Quiz. Sobald es startet, geht es hier automatisch weiter.
                </p>
              )}
            </div>

            {session.categories.length > 0 && (
              <div className="player-category-list">
                {(() => {
                  const maxVotes = Math.max(
                    1,
                    ...session.categories.map((c) => session.votes[c.id] ?? 0),
                  );
                  return session.categories.map((cat) => {
                    const voteCount = session.votes[cat.id] ?? 0;
                    const isMyVote = session.myVote === cat.id;
                    const pct = Math.round((voteCount / maxVotes) * 100);
                    return (
                      <button
                        key={cat.id}
                        className="player-category-item"
                        data-selected={isMyVote ? "true" : undefined}
                        onClick={() => session.handleCategoryVote(cat.id)}
                        type="button"
                      >
                        <div className="player-category-item-row">
                          <span className="player-category-name">{cat.name}</span>
                          {voteCount > 0 && (
                            <span className="player-category-votes">{voteCount}</span>
                          )}
                        </div>
                        {voteCount > 0 && (
                          <div className="player-category-bar-track">
                            <div className="player-category-bar" style={{ width: `${pct}%` }} />
                          </div>
                        )}
                      </button>
                    );
                  });
                })()}
              </div>
            )}

            <div className="player-scoreboard-list">
              <div className="player-scoreboard-item">
                <span>Andere Spieler</span>
                <strong>{session.lobby?.playerCount ?? 0}</strong>
              </div>
            </div>
          </>
        )}

        {session.screen === "question" && session.question && (
          <PlayerQuestionScreen session={session} />
        )}

        {session.screen === "reveal" && <PlayerRevealScreen session={session} />}

        {session.screen === "scoreboard" && (
          <>
            {session.ownScoreboardEntry && (
              <div className="player-my-rank">
                <div className="player-my-rank-label">Dein Platz</div>
                <div className="player-my-rank-value">{session.ownScoreboardPlacement + 1}.</div>
                <div className="player-my-rank-score">
                  {session.ownScoreboardEntry.score} Punkte
                </div>
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
              {session.isReadyForNext ? "Warten…" : "Weiter"}
            </button>
          </>
        )}

        {session.screen === "finished" && (
          <>
            {session.ownFinalPlacement >= 0 && session.ownFinalPlacement <= 2 && (
              <PlayerConfetti count={20} />
            )}
            <div className="player-card player-finished-card">
              <span className="player-kicker">Quiz beendet</span>
              <div className="player-finished-trophy" aria-hidden="true">
                {session.ownFinalPlacement === 0
                  ? "🏆"
                  : session.ownFinalPlacement === 1
                    ? "🥈"
                    : session.ownFinalPlacement === 2
                      ? "🥉"
                      : "🎉"}
              </div>
              <h1 className="player-title">
                {session.ownFinalPlacement === 0
                  ? "Gewonnen!"
                  : session.ownFinalPlacement === 1
                    ? "Platz 2 – Stark!"
                    : session.ownFinalPlacement === 2
                      ? "Platz 3 – Gut!"
                      : "Vielen Dank!"}
              </h1>
              <div className="player-my-rank-value player-final-rank">
                {session.ownFinalPlacement >= 0 ? `#${session.ownFinalPlacement + 1}` : "-"}
              </div>
              <button className="player-primary-button" onClick={() => window.location.reload()}>
                Nochmal spielen
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

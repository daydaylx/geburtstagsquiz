import type { UsePlayerSessionReturn } from "../hooks/usePlayerSession.js";
import { PlayerConfetti } from "./PlayerQuestionScreen.js";

export function PlayerFinishedScreen({ session: s }: { session: UsePlayerSessionReturn }) {
  return (
    <>
      {s.ownFinalPlacement >= 0 && s.ownFinalPlacement <= 2 && <PlayerConfetti count={20} />}
      <div className="player-card player-finished-card">
        <span className="player-kicker">Quiz beendet</span>
        <div className="player-finished-trophy" aria-hidden="true">
          {s.ownFinalPlacement === 0
            ? "🏆"
            : s.ownFinalPlacement === 1
              ? "🥈"
              : s.ownFinalPlacement === 2
                ? "🥉"
                : "🎉"}
        </div>
        <h1 className="player-title">
          {s.ownFinalPlacement === 0
            ? "Gewonnen!"
            : s.ownFinalPlacement === 1
              ? "Platz 2 – Stark!"
              : s.ownFinalPlacement === 2
                ? "Platz 3 – Gut!"
                : "Vielen Dank!"}
        </h1>
        <div className="player-my-rank-value player-final-rank">
          {s.ownFinalPlacement >= 0 ? `#${s.ownFinalPlacement + 1}` : "-"}
        </div>
        {s.waitingForRestart ? (
          <div className="player-restart-waiting">
            <span className="player-restart-waiting-text">
              Du wartest auf den Host. Sobald der Host neu startet, kommst du automatisch zurück in die Lobby.
            </span>
            <button type="button" className="player-secondary-button" onClick={s.handleCancelRestart}>
              Zurück zum Beitritt
            </button>
          </div>
        ) : (
          <div className="player-restart-section">
            <button type="button" className="player-primary-button" onClick={s.handlePlayAgain}>
              Auf neues Spiel warten
            </button>
            <span className="player-restart-hint">Nur der Host kann ein neues Spiel starten.</span>
          </div>
        )}
      </div>
    </>
  );
}

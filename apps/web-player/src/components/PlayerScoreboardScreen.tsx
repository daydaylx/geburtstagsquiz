import type { UsePlayerSessionReturn } from "../hooks/usePlayerSession.js";

export function PlayerScoreboardScreen({ session: s }: { session: UsePlayerSessionReturn }) {
  return (
    <>
      {s.ownScoreboardEntry && (
        <div className="player-my-rank">
          <div className="player-my-rank-label">Dein Platz</div>
          <div className="player-my-rank-value">{s.ownScoreboardPlacement + 1}.</div>
          <div className="player-my-rank-score">
            {s.ownScoreboardEntry.score} Punkte
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
        disabled={s.isReadyForNext}
        onClick={s.handleReadyForNextQuestion}
        type="button"
      >
        {s.isReadyForNext ? "Warten…" : "Weiter"}
      </button>
    </>
  );
}

import type { UsePlayerSessionReturn } from "../hooks/usePlayerSession.js";

export function PlayerLobbyScreen({ session: s }: { session: UsePlayerSessionReturn }) {
  return (
    <>
      <div className="player-card">
        <span className="player-kicker">Lobby</span>
        <h1 className="player-title">{s.playerName || "Spieler"}</h1>
        {s.categories.length > 0 ? (
          <p className="player-muted-copy">Wähle eine Kategorie – die meisten Stimmen gewinnen.</p>
        ) : (
          <p className="player-muted-copy">Warte auf das Quiz. Sobald es startet, geht es hier automatisch weiter.</p>
        )}
      </div>

      {s.categories.length > 0 && (
        <div className="player-category-list">
          {(() => {
            const maxVotes = Math.max(1, ...s.categories.map((c) => s.votes[c.id] ?? 0));
            return s.categories.map((cat) => {
              const voteCount = s.votes[cat.id] ?? 0;
              const isMyVote = s.myVote === cat.id;
              const pct = Math.round((voteCount / maxVotes) * 100);
              return (
                <button
                  key={cat.id}
                  className="player-category-item"
                  data-selected={isMyVote ? "true" : undefined}
                  onClick={() => s.handleCategoryVote(cat.id)}
                  type="button"
                >
                  <div className="player-category-item-row">
                    <span className="player-category-name">{cat.name}</span>
                    {voteCount > 0 && <span className="player-category-votes">{voteCount}</span>}
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
          <strong>{s.lobby?.playerCount ?? 0}</strong>
        </div>
      </div>
    </>
  );
}

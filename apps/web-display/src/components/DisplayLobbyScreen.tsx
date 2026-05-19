import type { UseDisplaySessionReturn } from "../hooks/useDisplaySession.js";

export function DisplayLobbyScreen({ session: s }: { session: UseDisplaySessionReturn }) {
  if (!s.roomInfo) return null;

  return (
    <div className={`display-lobby ${s.hostPaired ? "display-lobby--host-paired" : "display-lobby--pre-host"}`}>
      <div className="display-qr-block display-qr-block--primary">
        <h2>Beitreten</h2>
        {s.playerQrUrl ? (
          <img src={s.playerQrUrl} alt="Player-QR-Code" />
        ) : (
          <div className="display-qr-error">
            <p>QR-Code nicht verfügbar</p>
            <button className="display-retry-btn" onClick={s.handleRetryQr} type="button">
              Erneut generieren
            </button>
          </div>
        )}
        <code className="display-join-code">{s.roomInfo.joinCode}</code>
      </div>

      {!s.hostPaired && (
        <div className="display-qr-block display-qr-block--host">
          <h2>Host pairen</h2>
          <p className="display-host-pending">Warte auf Host…</p>
        </div>
      )}

      {s.hostPaired && (
        <div className="display-host-connected">
          <span className="display-host-connected-dot" aria-hidden="true" />
          Host verbunden
        </div>
      )}

      <div className="display-player-section">
        <div className="display-player-count">
          <span className="display-player-count-number">{s.lobby?.playerCount ?? 0}</span>
          <span className="display-player-count-label">Spieler</span>
        </div>
        {s.lobby && s.lobby.players.length > 0 && (
          <div className="display-player-grid">
            {s.lobby.players.map((p) => (
              <div key={p.playerId} className="display-player-pill" data-connected={p.connected ? "true" : undefined}>
                {p.name}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

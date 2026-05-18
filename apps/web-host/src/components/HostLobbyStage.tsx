import type { UseHostSessionReturn } from "../hooks/useHostSession.js";
import { getPlayerJoinUrl } from "../lib/helpers.js";
import { HostGamePlanBuilder } from "./HostGamePlanBuilder.js";

export function HostLobbyStage({
  session: s,
  connectedPlayerCount,
}: {
  session: UseHostSessionReturn;
  connectedPlayerCount: number;
}) {
  if (!s.roomInfo) return null;

  const playerJoinUrl = getPlayerJoinUrl(s.roomInfo.joinCode);

  return (
    <div className="host-lobby-layout">
      <div className="host-lobby-info-bar">
        <div className="host-lobby-info-code">
          <p className="host-section-label host-section-label--muted">Raum</p>
          <p className="host-join-code">{s.roomInfo.joinCode}</p>
        </div>
        {s.qrCodeDataUrl && (
          <div className="host-lobby-info-qr">
            <img alt="Join QR" src={s.qrCodeDataUrl} />
          </div>
        )}
        {playerJoinUrl && (
          <div className="host-lobby-info-url">
            <p className="host-join-url">{playerJoinUrl}</p>
            <button
              className="host-copy-url-button"
              onClick={() =>
                navigator.clipboard.writeText(playerJoinUrl).catch(() => {
                  /* clipboard not available */
                })
              }
              title="Link kopieren"
              type="button"
            >
              Link kopieren
            </button>
          </div>
        )}
        <div className="host-lobby-info-display">
          <span className="host-control-label">Display</span>
          <strong>{s.displayConnected ? "Verbunden" : "Nicht verbunden"}</strong>
          {!s.displayConnected && s.displayConnectToken && (
            <button
              className="host-action-button host-action-button--secondary"
              onClick={s.handleOpenDisplay}
              type="button"
            >
              Display öffnen
            </button>
          )}
        </div>
      </div>

      <div className="host-lobby-columns">
        <div className="host-lobby-players">
          <div className="host-section-head">
            <p className="host-section-label">Spieler</p>
            <span className="host-online-count">{connectedPlayerCount} online</span>
          </div>
          <div className="host-player-list">
            {(s.lobby?.players ?? []).length === 0 && (
              <div className="host-player-list-empty">Noch niemand beigetreten</div>
            )}
            {(s.lobby?.players ?? []).map((p) => (
              <div className="host-player-item" key={p.playerId}>
                <div className="host-player-meta">
                  <div className="host-player-status-dot" data-connected={p.connected} />
                  <span className="host-player-name">{p.name}</span>
                </div>
                <div className="host-player-actions">
                  <span className="host-player-score">{p.score}</span>
                  {s.confirmRemovePlayerId === p.playerId ? (
                    <>
                      <button
                        className="host-small-danger-button"
                        onClick={() => {
                          s.handleRemovePlayer(p.playerId);
                          s.setConfirmRemovePlayerId(null);
                        }}
                        type="button"
                      >
                        Sicher?
                      </button>
                      <button
                        className="host-small-cancel-button"
                        onClick={() => s.setConfirmRemovePlayerId(null)}
                        type="button"
                      >
                        ✕
                      </button>
                    </>
                  ) : (
                    <button
                      className="host-small-danger-button"
                      onClick={() => s.setConfirmRemovePlayerId(p.playerId)}
                      type="button"
                    >
                      Entfernen
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="host-lobby-plan">
          <HostGamePlanBuilder session={s} />
          <div className="host-card host-lobby-handheld-toggle">
            <label className="host-toggle-row">
              <input
                checked={s.showAnswerTextOnPlayerDevices}
                onChange={(event) => s.handleAnswerTextSettingChange(event.target.checked)}
                type="checkbox"
              />
              <span className="host-toggle-track" />
              <span className="host-toggle-copy">
                <strong>Antworttexte auf Handys</strong>
                <small>{s.showAnswerTextOnPlayerDevices ? "An" : "Aus"}</small>
              </span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

import type { UseHostSessionReturn } from "../hooks/useHostSession.js";
import { HostGamePlanBuilder } from "./HostGamePlanBuilder.js";

export function HostLobbyStage({
  session: s,
  connectedPlayerCount,
}: {
  session: UseHostSessionReturn;
  connectedPlayerCount: number;
}) {
  if (!s.roomInfo) return null;

  return (
    <div className="host-panel-content host-lobby-stage">
      <p className="host-section-label host-section-label--compact">Status</p>
      <h2 className="host-stage-title">{s.displayConnected ? "Verbunden mit TV-Display" : "Warte auf TV-Display"}</h2>
      {!s.displayConnected && s.displayConnectToken && (
        <button
          className="host-action-button host-action-button--secondary"
          onClick={s.handleOpenDisplay}
          type="button"
        >
          Display öffnen
        </button>
      )}
      <p className="host-lobby-hint">
        {s.displayConnected
          ? "Warte auf Spieler... Die Spieler können über den QR-Code am Host oder Fernseher beitreten."
          : "Klicke auf 'Display öffnen' und ziehe das Fenster auf den HDMI-TV."}
      </p>
      <div className="host-lobby-stats">
        <div className="host-stat-card">
          <span className="host-stat-value">{connectedPlayerCount}</span>
          <span className="host-stat-label">Spieler bereit</span>
        </div>
        <div className="host-stat-card">
          <span className="host-stat-value">{s.gamePlanDraft?.questionCount ?? "-"}</span>
          <span className="host-stat-label">Fragen</span>
        </div>
      </div>
      <HostGamePlanBuilder session={s} />
    </div>
  );
}

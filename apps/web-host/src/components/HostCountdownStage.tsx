import type { UseHostSessionReturn } from "../hooks/useHostSession.js";

export function HostCountdownStage({ session: s }: { session: UseHostSessionReturn }) {
  return (
    <div className="host-panel-content host-countdown-panel">
      <p className="host-section-label">Nächste Frage</p>
      <div className="host-countdown-number">{s.countdownSeconds > 0 ? s.countdownSeconds : "Frage!"}</div>
      <p className="host-lobby-hint">Timer startet gleich auf dem TV.</p>
    </div>
  );
}

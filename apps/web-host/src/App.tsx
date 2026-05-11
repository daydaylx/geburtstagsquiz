import { type ConnectionState, useWebSocket } from "@quiz/shared-hooks";
import { HostCountdownStage } from "./components/HostCountdownStage.js";
import { HostLobbyStage } from "./components/HostLobbyStage.js";
import { HostQuestionStage } from "./components/HostQuestionStage.js";
import { HostRevealStage } from "./components/HostRevealStage.js";
import { HostScoreboardStage } from "./components/HostScoreboardStage.js";
import { useHostSession } from "./hooks/useHostSession.js";
import { getPlayerJoinUrl } from "./lib/helpers.js";

const FLOW_STEPS = ["Lobby", "Kategorien", "Frage", "Auflösung", "Endstand"] as const;

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
  const urlParams = new URLSearchParams(window.location.search);
  const { connectionState, sendEvent, onMessage, notifyConnected, closeSocket } = useWebSocket();
  const s = useHostSession({ sendEvent, onMessage, notifyConnected, closeSocket, connectionState });

  const connectedPlayerCount = s.lobby?.players.filter((p) => p.connected).length ?? 0;
  const timerSeconds = Math.ceil((s.remainingMs ?? 0) / 1000);
  const isTimerWarning = s.remainingMs > 0 && timerSeconds <= 10;
  const isTimerUrgent = s.remainingMs > 0 && timerSeconds <= 5;
  const answerProgressPercent =
    s.answerProgress && s.answerProgress.totalEligiblePlayers > 0
      ? (s.answerProgress.answeredCount / s.answerProgress.totalEligiblePlayers) * 100
      : 0;

  const latestScoreboard = s.finalResult?.finalScoreboard ?? s.scoreboard?.scoreboard ?? [];
  const correctRoundCount = s.roundResults.filter((r) => r.isCorrect).length;
  const wrongRoundCount = s.roundResults.filter((r) => !r.isCorrect && r.answer !== null).length;
  const missingRoundCount = s.roundResults.filter((r) => r.answer === null).length;
  const nextReadyLabel = s.nextQuestionReadyProgress
    ? `${s.nextQuestionReadyProgress.readyCount} / ${s.nextQuestionReadyProgress.totalEligiblePlayers} bereit`
    : "Warte auf Bereitmeldungen";
  const nextReadyPercent =
    s.nextQuestionReadyProgress && s.nextQuestionReadyProgress.totalEligiblePlayers > 0
      ? (s.nextQuestionReadyProgress.readyCount / s.nextQuestionReadyProgress.totalEligiblePlayers) * 100
      : 0;
  const latestScoreChanges = s.scoreboard?.scoreChanges ?? [];

  const effectiveTotalQuestionCount =
    s.totalQuestionCount ?? s.question?.totalQuestionCount ?? s.finalResult?.totalQuestionCount ?? null;
  const currentQuestionNumber = s.currentQuestionIndex !== null ? s.currentQuestionIndex + 1 : 0;
  const visibleQuestionNumber = s.screen === "finished" ? effectiveTotalQuestionCount || 0 : currentQuestionNumber;
  const questionProgressPercent = effectiveTotalQuestionCount
    ? (visibleQuestionNumber / effectiveTotalQuestionCount) * 100
    : 0;
  const canManuallyShowScoreboard =
    s.screen === "reveal" &&
    !!s.question &&
    !s.question.isDemoQuestion &&
    effectiveTotalQuestionCount !== null &&
    currentQuestionNumber < effectiveTotalQuestionCount;
  const playerJoinUrl = s.roomInfo?.joinCode ? getPlayerJoinUrl(s.roomInfo.joinCode) : null;

  const currentFlowStepIndex =
    s.screen === "finished"
      ? 4
      : s.screen === "scoreboard" || s.screen === "reveal"
        ? 3
        : s.screen === "question" || s.screen === "countdown"
          ? 2
          : 1;

  const renderStagePanel = () => {
    if (s.screen === "lobby" && s.roomInfo) {
      return <HostLobbyStage session={s} connectedPlayerCount={connectedPlayerCount} />;
    }

    if (s.screen === "countdown") {
      return <HostCountdownStage session={s} />;
    }

    if (s.screen === "question" && s.question) {
      return (
        <HostQuestionStage
          session={s}
          currentQuestionNumber={currentQuestionNumber}
          effectiveTotalQuestionCount={effectiveTotalQuestionCount}
          timerSeconds={timerSeconds}
          isTimerWarning={isTimerWarning}
          isTimerUrgent={isTimerUrgent}
          answerProgressPercent={answerProgressPercent}
        />
      );
    }

    if (s.screen === "reveal" && s.question) {
      return (
        <HostRevealStage
          session={s}
          correctRoundCount={correctRoundCount}
          wrongRoundCount={wrongRoundCount}
          missingRoundCount={missingRoundCount}
          nextReadyLabel={nextReadyLabel}
          nextReadyPercent={nextReadyPercent}
        />
      );
    }

    if (s.screen === "scoreboard" || s.screen === "finished") {
      return (
        <HostScoreboardStage
          session={s}
          latestScoreboard={latestScoreboard}
          latestScoreChanges={latestScoreChanges}
          nextReadyLabel={nextReadyLabel}
        />
      );
    }

    return <div className="host-empty">Warte auf Server...</div>;
  };

  const primaryActionLabel =
    s.screen === "lobby"
      ? "Quiz starten"
      : s.screen === "question"
        ? "Frage schließen"
        : s.screen === "reveal"
          ? "Weiter"
          : s.screen === "scoreboard"
            ? "Nächste Frage"
            : s.screen === "finished"
              ? "Neues Spiel"
              : "Warten...";
  const isPrimaryDisabled =
    s.screen === "lobby"
      ? connectionState !== "connected" || connectedPlayerCount === 0 || !s.gamePlanDraft || !s.catalog
      : s.screen === "question"
        ? false
        : s.screen === "reveal" || s.screen === "scoreboard"
          ? false
          : s.screen !== "finished";

  const startBlockReason =
    s.screen === "lobby" && isPrimaryDisabled
      ? connectionState !== "connected"
        ? "Nicht verbunden mit Server"
        : !s.catalog
          ? "Warte auf Fragenkatalog..."
          : !s.gamePlanDraft
            ? "Spielplan wird geladen..."
            : "Mindestens 1 Spieler benötigt"
      : null;

  return (
    <main className="host-shell" data-screen={s.screen}>
      <header className="host-header">
        <div className="host-brand">
          <h1 className="host-title">Geburtstagsquiz</h1>
          <div className="host-status" data-state={connectionState}>
            {getConnectionLabel(connectionState)}
          </div>
        </div>
        {s.notice && (
          <div className="host-notice" data-kind={s.notice.kind} role="alert">
            {s.notice.text}
          </div>
        )}
        {s.lobby !== null && !s.lobby.displayConnected && (
          <div className="host-notice" data-kind="error">
            Display nicht verbunden – Spieler sehen den TV-Screen nicht.
          </div>
        )}
      </header>

      {s.screen === "start" && !s.roomInfo ? (
        <section className="host-panel host-start-panel">
          <div className="host-start-container">
            {urlParams.get("hostToken") ? (
              <>
                <h2 className="host-stage-title host-stage-title--hero">
                  {s.isConnectingHost ? "Verbindung wird hergestellt..." : "Warte auf Host-Verbindung"}
                </h2>
                <p className="host-start-hint">Der Server koppelt dein Gerät gerade als Spielleiter.</p>
              </>
            ) : (
              <>
                <h2 className="host-stage-title host-stage-title--hero">Geburtstagsquiz</h2>
                <p className="host-start-hint">Erstelle einen Raum, dann öffne das Display-Fenster auf dem HDMI-TV.</p>
                <button
                  className="host-action-button host-action-button--primary"
                  disabled={s.isConnectingHost}
                  onClick={s.handleCreateRoom}
                  type="button"
                >
                  {s.isConnectingHost ? "Erstelle Raum..." : "Raum erstellen"}
                </button>
              </>
            )}
          </div>
        </section>
      ) : s.roomInfo ? (
        <>
          <section className="host-dashboard">
            <aside className="host-sidebar-col">
              <div className="host-card host-card--dark">
                <p className="host-section-label host-section-label--muted">Raum</p>
                <p className="host-join-code">{s.roomInfo.joinCode}</p>
                {s.qrCodeDataUrl && (
                  <div className="host-qr-mini">
                    <img alt="Join QR" src={s.qrCodeDataUrl} />
                  </div>
                )}
                {playerJoinUrl && (
                  <div className="host-join-url-row">
                    <p className="host-join-url host-join-url--sidebar">{playerJoinUrl}</p>
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
                <div className="host-display-status-row">
                  <span className="host-control-label">Display</span>
                  <strong>{s.displayConnected ? "Verbunden" : "Nicht verbunden"}</strong>
                </div>
                {!s.displayConnected && s.displayConnectToken && (
                  <button
                    className="host-action-button host-action-button--secondary host-display-open-sidebar"
                    onClick={s.handleOpenDisplay}
                    type="button"
                  >
                    Display öffnen
                  </button>
                )}
              </div>
              <div className="host-panel host-side-panel">
                <div className="host-panel-content">
                  <p className="host-section-label">Ablauf</p>
                  <div className="host-flow-list">
                    {FLOW_STEPS.map((step, index) => (
                      <div
                        className="host-flow-item"
                        data-state={
                          index < currentFlowStepIndex
                            ? "done"
                            : index === currentFlowStepIndex
                              ? "current"
                              : "upcoming"
                        }
                        key={step}
                      >
                        <span className="host-flow-index">{index + 1}</span>
                        <strong>{step}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </aside>

            <section className="host-panel host-stage-panel">
              <div key={s.screen} className="host-stage-animate">
                {renderStagePanel()}
              </div>
            </section>

            <aside className="host-sidebar-col">
              <div className="host-panel host-side-panel">
                <div className="host-panel-content">
                  <div className="host-section-head">
                    <p className="host-section-label">Spieler</p>
                    <span className="host-online-count">{connectedPlayerCount} online</span>
                  </div>
                  <div className="host-player-list">
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
              </div>
              <div className="host-card">
                <p className="host-section-label">Handy-Controller</p>
                <label className="host-toggle-row">
                  <input
                    checked={s.showAnswerTextOnPlayerDevices}
                    disabled={s.screen !== "lobby"}
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
            </aside>
          </section>

          <footer className="host-controls">
            <div className="host-control-info">
              <div className="host-control-metric">
                <span className="host-control-label">Status</span>
                <span className="host-control-value">
                  {s.screen === "finished" ? "Beendet" : s.screen === "lobby" ? "Lobby offen" : "Quiz läuft"}
                </span>
              </div>
              <div className="host-control-metric">
                <span className="host-control-label">Fortschritt</span>
                <span className="host-control-value">
                  {effectiveTotalQuestionCount
                    ? `Frage ${visibleQuestionNumber} / ${effectiveTotalQuestionCount}`
                    : "Warten..."}
                </span>
                <div
                  className="host-progress-bar host-progress-bar--compact"
                  role="progressbar"
                  aria-valuenow={Math.round(questionProgressPercent)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div className="host-progress-fill" style={{ width: `${questionProgressPercent}%` }} />
                </div>
              </div>
            </div>
            {["countdown", "question", "reveal", "scoreboard"].includes(s.screen) && (
              <div className="host-fallback-actions">
                {canManuallyShowScoreboard && (
                  <button className="host-secondary-button" onClick={s.handleShowScoreboard} type="button">
                    Scoreboard anzeigen
                  </button>
                )}
                {s.confirmFinishNow ? (
                  <>
                    <button
                      className="host-secondary-button host-secondary-button--danger"
                      onClick={() => {
                        s.handleFinishNow();
                        s.setConfirmFinishNow(false);
                      }}
                      type="button"
                    >
                      Wirklich beenden?
                    </button>
                    <button
                      className="host-small-cancel-button"
                      onClick={() => s.setConfirmFinishNow(false)}
                      type="button"
                    >
                      ✕
                    </button>
                  </>
                ) : (
                  <button className="host-secondary-button" onClick={() => s.setConfirmFinishNow(true)} type="button">
                    Spiel beenden
                  </button>
                )}
              </div>
            )}
            <button
              className="host-primary-button"
              disabled={isPrimaryDisabled}
              onClick={
                s.screen === "lobby"
                  ? s.handleStartGame
                  : s.screen === "question"
                    ? s.handleForceCloseQuestion
                    : s.screen === "reveal"
                      ? s.handleAdvanceQuestion
                      : s.screen === "scoreboard"
                        ? s.handleAdvanceQuestion
                        : s.handleRestartInfo
              }
              type="button"
            >
              {primaryActionLabel}
            </button>
            {startBlockReason && <p className="host-start-block-reason">{startBlockReason}</p>}
          </footer>
        </>
      ) : null}
    </main>
  );
}

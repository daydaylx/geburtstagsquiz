import { type ConnectionState, useWebSocket } from "@quiz/shared-hooks";
import { useEffect, useEffectEvent, useState } from "react";
import { HostCountdownStage } from "./components/HostCountdownStage.js";
import { HostLobbyStage } from "./components/HostLobbyStage.js";
import { HostQuestionStage } from "./components/HostQuestionStage.js";
import { HostRevealStage } from "./components/HostRevealStage.js";
import { HostScoreboardStage } from "./components/HostScoreboardStage.js";
import { QuestionFlagDialog } from "./components/QuestionFlagDialog.js";
import { useHostSession } from "./hooks/useHostSession.js";
import { useQuestionFlags } from "./hooks/useQuestionFlags.js";

const FLOW_STEPS = ["Lobby", "Kategorien", "Frage", "Auflösung", "Endstand"] as const;

const PHASE_LABELS: Record<string, string> = {
  lobby: "Lobby",
  countdown: "Start",
  question: "Frage läuft",
  reveal: "Auflösung",
  scoreboard: "Zwischenstand",
  finished: "Endstand",
};

function getConnectionLabel(connectionState: ConnectionState): string {
  switch (connectionState) {
    case "connecting":
      return "Verbinde...";
    case "reconnecting":
      return "Neuverbindung...";
    case "connectionerror":
      return "Server nicht erreichbar";
    case "connected":
      return "Online";
    case "disconnected":
      return "Getrennt";
  }
}

export function App() {
  const urlParams = new URLSearchParams(window.location.search);
  const { connectionState, sendEvent, onMessage, notifyConnected, closeSocket } = useWebSocket();
  const s = useHostSession({ sendEvent, onMessage, notifyConnected, closeSocket, connectionState });
  const questionFlags = useQuestionFlags();
  const [flagDialogQuestionId, setFlagDialogQuestionId] = useState<string | null>(null);

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
  const currentFlowStepIndex =
    s.screen === "finished"
      ? 4
      : s.screen === "scoreboard" || s.screen === "reveal"
        ? 3
        : s.screen === "question" || s.screen === "countdown"
          ? 2
          : 1;

  const primaryActionHandler =
    s.screen === "question"
      ? s.handleForceCloseQuestion
      : s.screen === "reveal"
        ? s.handleAdvanceQuestion
        : s.screen === "scoreboard"
          ? s.handleAdvanceQuestion
          : s.screen === "finished"
            ? s.handleRestartInfo
            : s.handleStartGame;

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

  const enrichFlagOnReveal = useEffectEvent(
    (
      screen: string,
      question: typeof s.question,
      revealedAnswer: typeof s.revealedAnswer,
      revealExplanation: typeof s.revealExplanation,
    ) => {
      if (screen !== "reveal" || !question) return;
      if (!questionFlags.isFlagged(question.questionId)) return;
      questionFlags.update(question.questionId, {
        correctAnswer: revealedAnswer ?? undefined,
        explanation: revealExplanation ?? undefined,
      });
    },
  );

  // Enrich flagged question with correctAnswer/explanation once reveal arrives
  useEffect(() => {
    enrichFlagOnReveal(s.screen, s.question, s.revealedAnswer, s.revealExplanation);
  }, [s.screen, s.question, s.revealedAnswer, s.revealExplanation]);

  // Keyboard shortcut: Space = primary action
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code !== "Space") return;
      if (isPrimaryDisabled) return;
      e.preventDefault();
      primaryActionHandler();
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [isPrimaryDisabled, primaryActionHandler]);

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
          isFlagged={questionFlags.isFlagged(s.question.questionId)}
          onFlagClick={() => setFlagDialogQuestionId(s.question!.questionId)}
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
          isFlagged={questionFlags.isFlagged(s.question.questionId)}
          onFlagClick={() => setFlagDialogQuestionId(s.question!.questionId)}
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
          flags={questionFlags.flags}
          onFlagRemove={questionFlags.remove}
          onFlagClearAll={questionFlags.clearAll}
        />
      );
    }

    return <div className="host-empty">Warte auf Server...</div>;
  };

  return (
    <main className="host-shell" data-screen={s.screen}>
      <header className="host-header">
        <div className="host-brand">
          <h1 className="host-title">Geburtstagsquiz</h1>
          <div className="host-status" data-state={connectionState}>
            {getConnectionLabel(connectionState)}
          </div>
        </div>

        {/* Phase badge – center slot */}
        {s.screen !== "start" && PHASE_LABELS[s.screen] && (
          <div className="host-header-phase">{PHASE_LABELS[s.screen]}</div>
        )}

        {/* Right slot: notices + flag count */}
        <div className="host-header-right">
          {questionFlags.flags.length > 0 && (
            <div className="host-flag-count" title="Markierte Fragen">
              ⚑ {questionFlags.flags.length}
            </div>
          )}
          {s.notice && (
            <div className="host-notice" data-kind={s.notice.kind} role="alert">
              {s.notice.text}
            </div>
          )}
          {s.lobby !== null && !s.lobby.displayConnected && (
            <div className="host-notice" data-kind="error">
              Display nicht verbunden
            </div>
          )}
        </div>
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
        s.screen === "lobby" ? (
          <>
            <div key={s.screen} className="host-stage-animate">
              <HostLobbyStage session={s} connectedPlayerCount={connectedPlayerCount} />
            </div>
            <footer className="host-controls host-controls--lobby">
              <button
                className="host-primary-button"
                disabled={isPrimaryDisabled}
                onClick={s.handleStartGame}
                type="button"
              >
                {primaryActionLabel}
              </button>
              {startBlockReason && <p className="host-start-block-reason">{startBlockReason}</p>}
            </footer>
          </>
        ) : (
          <>
            <section className="host-dashboard">
              <aside className="host-sidebar-col">
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
                          <span className="host-flow-index">{index < currentFlowStepIndex ? "✓" : index + 1}</span>
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
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </aside>
            </section>

            <footer className="host-controls">
              <div className="host-control-info">
                <div className="host-control-metric">
                  <span className="host-control-label">Status</span>
                  <span className="host-control-value">{s.screen === "finished" ? "Beendet" : "Quiz läuft"}</span>
                </div>
                <div className="host-control-metric">
                  <span className="host-control-label">Fortschritt</span>
                  <span className="host-control-value">
                    {effectiveTotalQuestionCount ? `${visibleQuestionNumber} / ${effectiveTotalQuestionCount}` : "—"}
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
                      Scoreboard
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
                      Beenden
                    </button>
                  )}
                </div>
              )}
              <button
                className="host-primary-button"
                disabled={isPrimaryDisabled}
                onClick={primaryActionHandler}
                type="button"
              >
                {primaryActionLabel}
              </button>
            </footer>
          </>
        )
      ) : null}
      {flagDialogQuestionId && s.question && s.question.questionId === flagDialogQuestionId && (
        <QuestionFlagDialog
          existingFlag={questionFlags.getFlag(flagDialogQuestionId)}
          onSave={(reason, note) => {
            const q = s.question!;
            questionFlags.save({
              questionId: q.questionId,
              questionIndex: q.questionIndex,
              totalQuestionCount: q.totalQuestionCount,
              text: q.text,
              type: q.type,
              options: "options" in q ? q.options : undefined,
              items: "items" in q ? q.items : undefined,
              unit: "unit" in q ? q.unit : undefined,
              correctAnswer: s.revealedAnswer ?? undefined,
              explanation: s.revealExplanation ?? undefined,
              markedAt: new Date().toISOString(),
              markedDuringScreen: s.screen,
              reason,
              note,
            });
            setFlagDialogQuestionId(null);
          }}
          onRemove={() => {
            questionFlags.remove(flagDialogQuestionId);
            setFlagDialogQuestionId(null);
          }}
          onClose={() => setFlagDialogQuestionId(null)}
        />
      )}
    </main>
  );
}

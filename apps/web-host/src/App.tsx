import { QuestionType, type DisplayShowLevel, type GamePlanPresetId, type RevealMode } from "@quiz/shared-types";
import { isLoopbackHostname } from "@quiz/shared-utils";

import { getPublicHost, getPlayerJoinUrl } from "./lib/helpers.js";
import { useWebSocket, type ConnectionState } from "./hooks/useWebSocket.js";
import {
  useHostSession,
  buildPresetGamePlan,
  buildCustomGamePlan,
} from "./hooks/useHostSession.js";

const FLOW_STEPS = ["Lobby", "Kategorien", "Frage", "Auflösung", "Endstand"] as const;
const PRESET_IDS: GamePlanPresetId[] = [
  "quick_dirty",
  "normal_evening",
  "full_evening",
  "chaos_party",
];
const QUESTION_COUNT_CHOICES = [10, 15, 20, 25, 30] as const;
const TIMER_CHOICES = [20_000, 30_000, 45_000, 60_000, 90_000] as const;
const REVEAL_CHOICES: Array<{ label: string; value: number; mode: RevealMode }> = [
  { label: "Bis alle bereit", value: 30_000, mode: "manual_with_fallback" },
];

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

function getAnswerDisplayLabel(index: number): string {
  return index < 26 ? String.fromCharCode(65 + index) : `${index + 1}`;
}

function getPresetLabel(presetId: GamePlanPresetId): string {
  switch (presetId) {
    case "quick_dirty":
      return "Kurz & dreckig";
    case "normal_evening":
      return "Normaler Abendmodus";
    case "full_evening":
      return "Voller Quizabend";
    case "chaos_party":
      return "Chaos-/Party-Modus";
  }
}

function getPresetHint(presetId: GamePlanPresetId): string {
  switch (presetId) {
    case "quick_dirty":
      return "12 Fragen, schnell, wenig Frust.";
    case "normal_evening":
      return "20 Fragen, gemischt, Geburtstags-Default.";
    case "full_evening":
      return "30 Fragen, langer Mix.";
    case "chaos_party":
      return "18 Fragen, Tempo und Lacher.";
  }
}

function getQuestionTypeLabel(type: QuestionType): string {
  switch (type) {
    case QuestionType.MultipleChoice:
      return "Multiple Choice";
    case QuestionType.Estimate:
      return "Schätzfragen";
    case QuestionType.MajorityGuess:
      return "Mehrheitsfragen";
    case QuestionType.Ranking:
      return "Ranking";
    case QuestionType.Logic:
      return "Denkfragen";
    case QuestionType.OpenText:
      return "Freitext";
  }
}

function getShowLevelLabel(level: DisplayShowLevel): string {
  switch (level) {
    case "minimal":
      return "Minimal";
    case "normal":
      return "Normal";
    case "high":
      return "High";
  }
}

export function App() {
  const urlParams = new URLSearchParams(window.location.search);
  const { connectionState, sendEvent, onMessage, notifyConnected, closeSocket } = useWebSocket();
  const s = useHostSession({ sendEvent, onMessage, notifyConnected, closeSocket, connectionState });

  const loopback = isLoopbackHostname(getPublicHost());
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
      ? (s.nextQuestionReadyProgress.readyCount / s.nextQuestionReadyProgress.totalEligiblePlayers) *
        100
      : 0;
  const latestScoreChanges = s.scoreboard?.scoreChanges ?? [];

  const effectiveTotalQuestionCount =
    s.totalQuestionCount ?? s.question?.totalQuestionCount ?? s.finalResult?.totalQuestionCount ?? null;
  const currentQuestionNumber = s.currentQuestionIndex !== null ? s.currentQuestionIndex + 1 : 0;
  const visibleQuestionNumber =
    s.screen === "finished" ? effectiveTotalQuestionCount || 0 : currentQuestionNumber;
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
      return (
        <div className="host-panel-content host-lobby-stage">
          <p className="host-section-label host-section-label--compact">Status</p>
          <h2 className="host-stage-title">Verbunden mit TV-Display</h2>
          <p className="host-lobby-hint">
            Warte auf Spieler... Die Spieler können über den QR-Code am Fernseher beitreten.
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
          {s.catalog && s.gamePlanDraft ? (
            <div className="host-plan-builder">
              <div className="host-section-head">
                <p className="host-section-label">Spielplan</p>
                <span className="host-online-count">{s.catalog.totalQuestions} Fragen verfügbar</span>
              </div>
              <div className="host-preset-grid">
                {PRESET_IDS.map((presetId) => (
                  <button
                    className="host-preset-button"
                    data-active={s.selectedPlanMode === presetId ? "true" : undefined}
                    key={presetId}
                    onClick={() => {
                      s.setSelectedPlanMode(presetId);
                      s.handlePlanDraftChange(
                        buildPresetGamePlan(
                          presetId,
                          s.catalog!,
                          s.gamePlanDraft!.showAnswerTextOnPlayerDevices,
                        ),
                      );
                    }}
                    type="button"
                  >
                    <strong>{getPresetLabel(presetId)}</strong>
                    <small>{getPresetHint(presetId)}</small>
                  </button>
                ))}
                <button
                  className="host-preset-button"
                  data-active={s.selectedPlanMode === "custom" ? "true" : undefined}
                  onClick={() => {
                    s.setSelectedPlanMode("custom");
                    s.handlePlanDraftChange(
                      buildCustomGamePlan(s.catalog!, s.gamePlanDraft!.showAnswerTextOnPlayerDevices),
                    );
                  }}
                  type="button"
                >
                  <strong>Freie Auswahl</strong>
                  <small>Fragen, Kategorien und Typen selbst setzen.</small>
                </button>
              </div>

              {s.selectedPlanMode === "custom" && (
                <div className="host-custom-plan">
                  <div className="host-choice-row">
                    <span>Fragen</span>
                    <div className="host-segmented">
                      {QUESTION_COUNT_CHOICES.map((count) => (
                        <button
                          data-active={s.gamePlanDraft!.questionCount === count ? "true" : undefined}
                          key={count}
                          onClick={() =>
                            s.handlePlanDraftChange({ ...s.gamePlanDraft!, questionCount: count })
                          }
                          type="button"
                        >
                          {count}
                        </button>
                      ))}
                    </div>
                    <input
                      className="host-small-number-input"
                      max={s.catalog!.maxQuestionCount}
                      min={5}
                      onChange={(event) => {
                        const nextCount = Math.max(
                          5,
                          Math.min(s.catalog!.maxQuestionCount, Number(event.target.value) || 5),
                        );
                        s.handlePlanDraftChange({ ...s.gamePlanDraft!, questionCount: nextCount });
                      }}
                      type="number"
                      value={s.gamePlanDraft!.questionCount}
                    />
                  </div>
                  <div className="host-choice-row">
                    <span>Timer</span>
                    <div className="host-segmented">
                      {TIMER_CHOICES.map((timerMs) => (
                        <button
                          data-active={s.gamePlanDraft!.timerMs === timerMs ? "true" : undefined}
                          key={timerMs}
                          onClick={() => s.handlePlanDraftChange({ ...s.gamePlanDraft!, timerMs })}
                          type="button"
                        >
                          {timerMs / 1000}s
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="host-choice-row">
                    <span>Reveal</span>
                    <div className="host-segmented">
                      {REVEAL_CHOICES.map((choice) => (
                        <button
                          data-active={
                            s.gamePlanDraft!.revealDurationMs === choice.value &&
                            s.gamePlanDraft!.revealMode === choice.mode
                              ? "true"
                              : undefined
                          }
                          key={`${choice.mode}-${choice.value}`}
                          onClick={() =>
                            s.handlePlanDraftChange({
                              ...s.gamePlanDraft!,
                              revealDurationMs: choice.value,
                              revealMode: choice.mode,
                            })
                          }
                          type="button"
                        >
                          {choice.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="host-choice-row">
                    <span>Show</span>
                    <div className="host-segmented">
                      {(["minimal", "normal", "high"] as const).map((displayShowLevel) => (
                        <button
                          data-active={
                            s.gamePlanDraft!.displayShowLevel === displayShowLevel ? "true" : undefined
                          }
                          key={displayShowLevel}
                          onClick={() =>
                            s.handlePlanDraftChange({ ...s.gamePlanDraft!, displayShowLevel })
                          }
                          type="button"
                        >
                          {getShowLevelLabel(displayShowLevel)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="host-checkbox-pill host-checkbox-pill--wide">
                    <input
                      checked={s.gamePlanDraft!.enableDemoQuestion}
                      onChange={(event) =>
                        s.handlePlanDraftChange({
                          ...s.gamePlanDraft!,
                          enableDemoQuestion: event.target.checked,
                        })
                      }
                      type="checkbox"
                    />
                    <span>Demo-/Testfrage vor dem echten Spiel</span>
                  </label>
                  <div className="host-checkbox-grid">
                    {s.catalog!.categories.map((category) => (
                      <label className="host-checkbox-pill" key={category.id}>
                        <input
                          checked={s.gamePlanDraft!.categoryIds.includes(category.id)}
                          onChange={(event) => {
                            const categoryIds = event.target.checked
                              ? [...s.gamePlanDraft!.categoryIds, category.id]
                              : s.gamePlanDraft!.categoryIds.filter((id) => id !== category.id);
                            s.handlePlanDraftChange({ ...s.gamePlanDraft!, categoryIds });
                          }}
                          type="checkbox"
                        />
                        <span>{category.name}</span>
                      </label>
                    ))}
                  </div>
                  <div className="host-checkbox-grid host-checkbox-grid--types">
                    {s.catalog!.questionTypes.map((entry) => (
                      <label className="host-checkbox-pill" key={entry.type}>
                        <input
                          checked={s.gamePlanDraft!.questionTypes.includes(entry.type)}
                          onChange={(event) => {
                            const questionTypes = event.target.checked
                              ? [...s.gamePlanDraft!.questionTypes, entry.type]
                              : s.gamePlanDraft!.questionTypes.filter((type) => type !== entry.type);
                            s.handlePlanDraftChange({ ...s.gamePlanDraft!, questionTypes });
                          }}
                          type="checkbox"
                        />
                        <span>
                          {getQuestionTypeLabel(entry.type)} ({entry.count})
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="host-plan-summary">
                <span>{s.gamePlanDraft.questionCount} Fragen</span>
                <span>{s.gamePlanDraft.timerMs / 1000}s Timer</span>
                <span>
                  {s.gamePlanDraft.revealMode === "manual_with_fallback"
                    ? "Manuelles Reveal"
                    : `${s.gamePlanDraft.revealDurationMs / 1000}s Reveal`}
                </span>
                <span>Show: {getShowLevelLabel(s.gamePlanDraft.displayShowLevel)}</span>
                <span>Demo: {s.gamePlanDraft.enableDemoQuestion ? "an" : "aus"}</span>
              </div>
            </div>
          ) : (
            <div className="host-estimate-display">Lade Fragenkatalog...</div>
          )}
        </div>
      );
    }

    if (s.screen === "countdown") {
      return (
        <div className="host-panel-content host-countdown-panel">
          <p className="host-section-label">Nächste Frage</p>
          <div className="host-countdown-number">
            {s.countdownSeconds > 0 ? s.countdownSeconds : "Frage!"}
          </div>
          <p className="host-lobby-hint">Timer startet gleich auf dem TV.</p>
        </div>
      );
    }

    if (s.screen === "question" && s.question) {
      return (
        <div className="host-panel-content">
          <div className="host-stage-head">
            <p className="host-section-label">
              {s.question.isDemoQuestion
                ? "Testfrage"
                : `Frage ${currentQuestionNumber}${effectiveTotalQuestionCount ? ` / ${effectiveTotalQuestionCount}` : ""}`}
            </p>
            <div
              className="host-timer-shell"
              data-urgent={isTimerUrgent ? "true" : undefined}
              data-warning={isTimerWarning ? "true" : undefined}
            >
              <div className="host-timer">{timerSeconds}s</div>
            </div>
          </div>
          <h3 className="host-question-text">{s.question.text}</h3>
          {(s.question.type === QuestionType.MultipleChoice ||
            s.question.type === QuestionType.Logic ||
            s.question.type === QuestionType.MajorityGuess) && (
            <div className="host-options-grid">
              {s.question.options.map((opt, index) => (
                <div className="host-option-card" key={opt.id}>
                  <span className="host-option-id">{getAnswerDisplayLabel(index)}</span>
                  <span className="host-option-label">{opt.label}</span>
                </div>
              ))}
            </div>
          )}
          {s.question.type === QuestionType.Estimate && (
            <div className="host-estimate-display">
              Schätzungen laufen... ({s.question.unit} · {s.question.context})
            </div>
          )}
          {s.question.type === QuestionType.OpenText && (
            <div className="host-estimate-display">Texteingaben laufen...</div>
          )}
          {s.question.type === QuestionType.Ranking && (
            <div className="host-ranking-list">
              {s.question.items.map((item, index) => (
                <div className="host-ranking-item" key={item.id}>
                  <span className="host-option-id">{getAnswerDisplayLabel(index)}</span>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          )}
          <div className="host-progress-block">
            <div className="host-bar-meta">
              <span className="host-section-label host-section-label--compact">Antworten</span>
              <strong>
                {s.answerProgress?.answeredCount || 0} / {s.answerProgress?.totalEligiblePlayers || 0}
                {s.answerProgress &&
                  s.answerProgress.totalEligiblePlayers - s.answerProgress.answeredCount > 0 && (
                    <span className="host-pending-count">
                      {" "}
                      · {s.answerProgress.totalEligiblePlayers - s.answerProgress.answeredCount} noch
                      offen
                    </span>
                  )}
              </strong>
            </div>
            <div className="host-progress-bar">
              <div className="host-progress-fill" style={{ width: `${answerProgressPercent}%` }} />
            </div>
          </div>
        </div>
      );
    }

    if (s.screen === "reveal" && s.question) {
      return (
        <div className="host-panel-content">
          <p className="host-section-label">Auflösung läuft</p>
          <h3 className="host-question-text">{s.question.text}</h3>
          {(s.question.type === QuestionType.MultipleChoice ||
            s.question.type === QuestionType.Logic ||
            s.question.type === QuestionType.MajorityGuess) && (
            <div className="host-options-grid host-options-grid--reveal">
              {s.question.options.map((opt, index) => {
                const isCorrectAnswer =
                  (s.revealedAnswer?.type === "option" && s.revealedAnswer.value === opt.id) ||
                  (s.revealedAnswer?.type === "options" && s.revealedAnswer.value.includes(opt.id));
                return (
                  <div
                    className="host-option-card"
                    data-state={isCorrectAnswer ? "correct" : "dimmed"}
                    key={opt.id}
                  >
                    <span className="host-option-id">{getAnswerDisplayLabel(index)}</span>
                    <span className="host-option-label">{opt.label}</span>
                  </div>
                );
              })}
            </div>
          )}
          {s.question.type === QuestionType.Estimate && s.revealedAnswer?.type === "number" && (
            <div className="host-estimate-display host-estimate-display--reveal">
              <span>Richtig: </span>
              <strong className="host-estimate-correct-value">
                {s.revealedAnswer.value} {s.question.unit}
              </strong>
              <span className="host-estimate-context">({s.question.context})</span>
            </div>
          )}
          {s.question.type === QuestionType.OpenText && s.revealedAnswer?.type === "text" && (
            <div className="host-estimate-display host-estimate-display--reveal">
              <span>Richtig: </span>
              <strong className="host-estimate-correct-value">{s.revealedAnswer.value}</strong>
            </div>
          )}
          {s.question.type === QuestionType.Ranking && s.revealedAnswer?.type === "ranking" && (() => {
            const q = s.question!;
            return (
            <div className="host-ranking-list">
              {s.revealedAnswer.value.map((id, i) => {
                const itemIndex = q.items.findIndex((x) => x.id === id);
                const item = itemIndex >= 0 ? q.items[itemIndex] : undefined;
                return (
                  <div className="host-ranking-item host-ranking-item--reveal" key={id}>
                    <span className="host-ranking-position">{i + 1}.</span>
                    <span className="host-option-id">
                      {itemIndex >= 0 ? getAnswerDisplayLabel(itemIndex) : id}
                    </span>
                    <span>{item?.label ?? id}</span>
                  </div>
                );
              })}
            </div>
            );
          })()}
          {s.revealExplanation && <p className="host-explanation">{s.revealExplanation}</p>}
          <div className="host-round-summary">
            <div className="host-round-summary-card" data-state="correct">
              <p className="host-control-label">Richtig</p>
              <p>{correctRoundCount}</p>
            </div>
            <div className="host-round-summary-card" data-state="wrong">
              <p className="host-control-label">Falsch</p>
              <p>{wrongRoundCount}</p>
            </div>
            <div className="host-round-summary-card" data-state="missing">
              <p className="host-control-label">Keine Antwort</p>
              <p>{missingRoundCount}</p>
            </div>
          </div>
          <div className="host-progress-block">
            <div className="host-bar-meta">
              <span className="host-section-label host-section-label--compact">Bereit</span>
              <strong>{nextReadyLabel}</strong>
            </div>
            <div className="host-progress-bar">
              <div className="host-progress-fill" style={{ width: `${nextReadyPercent}%` }} />
            </div>
          </div>
        </div>
      );
    }

    if (s.screen === "scoreboard" || s.screen === "finished") {
      return (
        <div className="host-panel-content">
          <p className="host-section-label">
            {s.screen === "finished" ? "Endstand" : `Zwischenstand (${nextReadyLabel})`}
          </p>
          <div
            className="host-scoreboard-list"
            data-final={s.screen === "finished" ? "true" : undefined}
          >
            {latestScoreboard.map((entry, index) => {
              const gap =
                index > 0 && latestScoreboard[0] ? latestScoreboard[0].score - entry.score : 0;
              return (
                <article
                  className="host-scoreboard-item"
                  data-placement={index < 3 ? String(index + 1) : undefined}
                  key={entry.playerId}
                >
                  <div className="host-scoreboard-main">
                    <span className="host-scoreboard-rank">{index + 1}.</span>
                    <span className="host-scoreboard-name">{entry.name}</span>
                  </div>
                  <div className="host-scoreboard-score">
                    {entry.score}
                    {gap > 0 && <span className="host-score-gap">−{gap}</span>}
                  </div>
                </article>
              );
            })}
          </div>
          {s.screen === "scoreboard" && latestScoreChanges.length > 0 && (
            <div className="host-score-change-list">
              {latestScoreChanges.slice(0, 4).map((change) => (
                <div className="host-score-change" key={change.playerId}>
                  +{change.delta} Punkte für {change.name}
                  {change.previousRank !== change.rank ? ` · jetzt Platz ${change.rank}` : ""}
                </div>
              ))}
            </div>
          )}
        </div>
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
          <div className="host-notice" data-kind={s.notice.kind}>
            {s.notice.text}
          </div>
        )}
      </header>

      {s.screen === "start" && !s.roomInfo ? (
        <section className="host-panel host-start-panel">
          <div className="host-start-container">
            <h2 className="host-stage-title host-stage-title--hero">
              {s.isConnectingHost ? "Verbindung wird hergestellt..." : "Warte auf Host-Verbindung"}
            </h2>
            <p className="host-start-hint">
              {urlParams.get("hostToken")
                ? "Der Server koppelt dein Gerät gerade als Spielleiter."
                : "Bitte scanne den Host-QR-Code auf dem TV-Display, um das Quiz zu steuern."}
            </p>
          </div>
        </section>
      ) : s.roomInfo ? (
        <>
          <section className="host-dashboard">
            <aside className="host-sidebar-col">
              <div className="host-card host-card--dark">
                <p className="host-section-label host-section-label--muted">Raum</p>
                <p className="host-join-code">{s.roomInfo.joinCode}</p>
                {!loopback && s.qrCodeDataUrl && (
                  <div className="host-qr-mini">
                    <img alt="Join QR" src={s.qrCodeDataUrl} />
                  </div>
                )}
                {playerJoinUrl && (
                  <div className="host-join-url-row">
                    <p className="host-join-url host-join-url--sidebar">{playerJoinUrl}</p>
                    <button
                      className="host-copy-url-button"
                      onClick={() => navigator.clipboard.writeText(playerJoinUrl)}
                      title="Link kopieren"
                      type="button"
                    >
                      📋
                    </button>
                  </div>
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

            <section className="host-panel host-stage-panel">{renderStagePanel()}</section>

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
                  {s.screen === "finished"
                    ? "Beendet"
                    : s.screen === "lobby"
                      ? "Lobby offen"
                      : "Quiz läuft"}
                </span>
              </div>
              <div className="host-control-metric">
                <span className="host-control-label">Fortschritt</span>
                <span className="host-control-value">
                  {effectiveTotalQuestionCount
                    ? `Frage ${visibleQuestionNumber} / ${effectiveTotalQuestionCount}`
                    : "Warten..."}
                </span>
                <div className="host-progress-bar host-progress-bar--compact">
                  <div
                    className="host-progress-fill"
                    style={{ width: `${questionProgressPercent}%` }}
                  />
                </div>
              </div>
            </div>
            {["countdown", "question", "reveal", "scoreboard"].includes(s.screen) && (
              <div className="host-fallback-actions">
                {canManuallyShowScoreboard && (
                  <button
                    className="host-secondary-button"
                    onClick={s.handleShowScoreboard}
                    type="button"
                  >
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
                  <button
                    className="host-secondary-button"
                    onClick={() => s.setConfirmFinishNow(true)}
                    type="button"
                  >
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

import type { GamePlanPresetId, RevealMode } from "@quiz/shared-types";

import type { UseHostSessionReturn } from "../hooks/useHostSession.js";
import { buildCustomGamePlan, buildPresetGamePlan } from "../lib/game-plan-drafts.js";
import { getPresetHint, getPresetLabel, getQuestionTypeLabel, getShowLevelLabel } from "../lib/labels.js";

const PRESET_IDS: GamePlanPresetId[] = ["quick_dirty", "normal_evening", "full_evening", "chaos_party"];
const QUESTION_COUNT_CHOICES = [10, 15, 20, 25, 30] as const;
const TIMER_CHOICES = [20_000, 30_000, 45_000, 60_000, 90_000] as const;
const REVEAL_CHOICES: Array<{ label: string; value: number; mode: RevealMode }> = [
  { label: "Manuell", value: 30_000, mode: "manual" },
  { label: "30s Fallback", value: 30_000, mode: "manual_with_fallback" },
];
const REVEAL_DELAY_CHOICES = [0, 2_000, 3_000, 5_000, 8_000] as const;
const READING_PHASE_CHOICES = [0, 3_000, 5_000, 8_000] as const;

function getTopVotedCategoryId(votes: Record<string, number>, categories: { id: string }[]): string | null {
  const sorted = categories
    .map((c) => ({ id: c.id, count: votes[c.id] ?? 0 }))
    .filter((e) => e.count > 0)
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
  return sorted[0]?.id ?? null;
}

function PlanSummaryBadges({ session: s }: { session: UseHostSessionReturn }) {
  if (!s.gamePlanDraft) return null;
  return (
    <div className="host-plan-summary">
      <span>{s.gamePlanDraft.questionCount} Fragen</span>
      <span>{s.gamePlanDraft.timerMs / 1000}s Timer</span>
      <span>
        {s.gamePlanDraft.revealMode === "manual"
          ? "Manuell"
          : s.gamePlanDraft.revealMode === "manual_with_fallback"
            ? "30s Fallback"
            : `${s.gamePlanDraft.revealDurationMs / 1000}s Reveal`}
      </span>
      {s.gamePlanDraft.revealDelayMs > 0 && <span>Delay: {s.gamePlanDraft.revealDelayMs / 1000}s</span>}
      {s.gamePlanDraft.playerReadingPhaseMs > 0 && (
        <span>Lesephase: {s.gamePlanDraft.playerReadingPhaseMs / 1000}s</span>
      )}
      <span>Show: {getShowLevelLabel(s.gamePlanDraft.displayShowLevel)}</span>
      <span>Demo: {s.gamePlanDraft.enableDemoQuestion ? "an" : "aus"}</span>
    </div>
  );
}

interface HostGamePlanBuilderProps {
  session: UseHostSessionReturn;
}

export function HostGamePlanBuilder({ session: s }: HostGamePlanBuilderProps) {
  if (!s.catalog || !s.gamePlanDraft) {
    return <div className="host-estimate-display">Lade Fragenkatalog...</div>;
  }

  const topId = getTopVotedCategoryId(s.votes, s.catalog.categories);
  const topName = topId ? (s.catalog.categories.find((c) => c.id === topId)?.name ?? topId) : null;
  const topCount = topId ? (s.votes[topId] ?? 0) : 0;

  const handleVotingOverride = () => {
    if (!topId) return;
    s.setSelectedPlanMode("custom");
    s.handlePlanDraftChange({
      ...buildCustomGamePlan(s.catalog!, s.gamePlanDraft!.showAnswerTextOnPlayerDevices),
      categoryIds: [topId],
    });
  };

  const handlePresetClick = (presetId: GamePlanPresetId) => {
    s.setSelectedPlanMode(presetId);
    s.handlePlanDraftChange(buildPresetGamePlan(presetId, s.catalog!, s.gamePlanDraft!.showAnswerTextOnPlayerDevices));
  };

  const handleCustomClick = () => {
    s.setSelectedPlanMode("custom");
    s.handlePlanDraftChange(buildCustomGamePlan(s.catalog!, s.gamePlanDraft!.showAnswerTextOnPlayerDevices));
  };

  return (
    <div className="host-plan-builder">
      <div className="host-section-head">
        <p className="host-section-label">Spielplan</p>
        <span className="host-online-count">{s.catalog.totalQuestions} Fragen verfügbar</span>
      </div>

      {/* Preset strip – 5 compact buttons */}
      <div className="host-preset-strip">
        {PRESET_IDS.map((presetId) => (
          <button
            className="host-preset-button"
            data-active={s.selectedPlanMode === presetId ? "true" : undefined}
            key={presetId}
            onClick={() => handlePresetClick(presetId)}
            type="button"
          >
            <strong>{getPresetLabel(presetId)}</strong>
            <small>{getPresetHint(presetId)}</small>
          </button>
        ))}
        <button
          className="host-preset-button"
          data-active={s.selectedPlanMode === "custom" ? "true" : undefined}
          onClick={handleCustomClick}
          type="button"
        >
          <strong>Frei</strong>
          <small>Eigene Auswahl</small>
        </button>
      </div>

      {/* Voting override */}
      {topId && (
        <button className="host-preset-button host-preset-button--voting" onClick={handleVotingOverride} type="button">
          <strong>Voting übernehmen</strong>
          <small>
            {topName} – {topCount} Stimme{topCount !== 1 ? "n" : ""}
          </small>
        </button>
      )}

      {/* Kategorien – always visible as visual cards */}
      <p className="host-section-label host-section-sublabel">Kategorien</p>
      <div className="host-category-grid">
        {s.catalog.categories.map((category) => {
          const voteCount = s.votes[category.id] ?? 0;
          const isSelected = s.gamePlanDraft!.categoryIds.includes(category.id);
          return (
            <label className="host-category-card" key={category.id}>
              <input
                checked={isSelected}
                onChange={(event) => {
                  const categoryIds = event.target.checked
                    ? [...s.gamePlanDraft!.categoryIds, category.id]
                    : s.gamePlanDraft!.categoryIds.filter((id) => id !== category.id);
                  s.setSelectedPlanMode("custom");
                  s.handlePlanDraftChange({ ...s.gamePlanDraft!, categoryIds });
                }}
                type="checkbox"
              />
              <span className="host-category-name">{category.name}</span>
              {voteCount > 0 && <span className="host-vote-badge">{voteCount}</span>}
            </label>
          );
        })}
      </div>

      {/* Settings rows – always visible */}
      <div className="host-custom-plan">
        <div className="host-choice-row">
          <span>Fragen</span>
          <div className="host-segmented">
            {QUESTION_COUNT_CHOICES.map((count) => (
              <button
                data-active={s.gamePlanDraft!.questionCount === count ? "true" : undefined}
                key={count}
                onClick={() => {
                  s.setSelectedPlanMode("custom");
                  s.handlePlanDraftChange({ ...s.gamePlanDraft!, questionCount: count });
                }}
                type="button"
              >
                {count}
              </button>
            ))}
          </div>
          <input
            className="host-small-number-input"
            max={s.catalog.maxQuestionCount}
            min={5}
            onChange={(event) => {
              const nextCount = Math.max(5, Math.min(s.catalog!.maxQuestionCount, Number(event.target.value) || 5));
              s.setSelectedPlanMode("custom");
              s.handlePlanDraftChange({ ...s.gamePlanDraft!, questionCount: nextCount });
            }}
            type="number"
            value={s.gamePlanDraft.questionCount}
          />
        </div>
        <div className="host-choice-row">
          <span>Timer</span>
          <div className="host-segmented">
            {TIMER_CHOICES.map((timerMs) => (
              <button
                data-active={s.gamePlanDraft!.timerMs === timerMs ? "true" : undefined}
                key={timerMs}
                onClick={() => {
                  s.setSelectedPlanMode("custom");
                  s.handlePlanDraftChange({ ...s.gamePlanDraft!, timerMs });
                }}
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
                  s.gamePlanDraft!.revealDurationMs === choice.value && s.gamePlanDraft!.revealMode === choice.mode
                    ? "true"
                    : undefined
                }
                key={`${choice.mode}-${choice.value}`}
                onClick={() => {
                  s.setSelectedPlanMode("custom");
                  s.handlePlanDraftChange({
                    ...s.gamePlanDraft!,
                    revealDurationMs: choice.value,
                    revealMode: choice.mode,
                  });
                }}
                type="button"
              >
                {choice.label}
              </button>
            ))}
          </div>
        </div>
        <div className="host-choice-row">
          <span>Reveal-Verzögerung</span>
          <div className="host-segmented">
            {REVEAL_DELAY_CHOICES.map((delayMs) => (
              <button
                data-active={s.gamePlanDraft!.revealDelayMs === delayMs ? "true" : undefined}
                key={delayMs}
                onClick={() => {
                  s.setSelectedPlanMode("custom");
                  s.handlePlanDraftChange({ ...s.gamePlanDraft!, revealDelayMs: delayMs });
                }}
                type="button"
              >
                {delayMs === 0 ? "Aus" : `${delayMs / 1000}s`}
              </button>
            ))}
          </div>
        </div>
        <div className="host-choice-row">
          <span>Lesephase</span>
          <div className="host-segmented">
            {READING_PHASE_CHOICES.map((phaseMs) => (
              <button
                data-active={s.gamePlanDraft!.playerReadingPhaseMs === phaseMs ? "true" : undefined}
                key={phaseMs}
                onClick={() => {
                  s.setSelectedPlanMode("custom");
                  s.handlePlanDraftChange({ ...s.gamePlanDraft!, playerReadingPhaseMs: phaseMs });
                }}
                type="button"
              >
                {phaseMs === 0 ? "Aus" : `${phaseMs / 1000}s`}
              </button>
            ))}
          </div>
        </div>
        <div className="host-choice-row">
          <span>Show</span>
          <div className="host-segmented">
            {(["minimal", "normal", "high"] as const).map((displayShowLevel) => (
              <button
                data-active={s.gamePlanDraft!.displayShowLevel === displayShowLevel ? "true" : undefined}
                key={displayShowLevel}
                onClick={() => {
                  s.setSelectedPlanMode("custom");
                  s.handlePlanDraftChange({ ...s.gamePlanDraft!, displayShowLevel });
                }}
                type="button"
              >
                {getShowLevelLabel(displayShowLevel)}
              </button>
            ))}
          </div>
        </div>
        <label className="host-checkbox-pill host-checkbox-pill--wide">
          <input
            checked={s.gamePlanDraft.enableDemoQuestion}
            onChange={(event) => {
              s.setSelectedPlanMode("custom");
              s.handlePlanDraftChange({
                ...s.gamePlanDraft!,
                enableDemoQuestion: event.target.checked,
              });
            }}
            type="checkbox"
          />
          <span>Demo-/Testfrage</span>
        </label>

        {/* Question types */}
        <p className="host-section-label host-section-label--compact" style={{ marginTop: "6px" }}>
          Fragetypen
        </p>
        <div className="host-checkbox-grid host-checkbox-grid--types">
          {s.catalog.questionTypes.map((entry) => (
            <label className="host-checkbox-pill" key={entry.type}>
              <input
                checked={s.gamePlanDraft!.questionTypes.includes(entry.type)}
                onChange={(event) => {
                  const questionTypes = event.target.checked
                    ? [...s.gamePlanDraft!.questionTypes, entry.type]
                    : s.gamePlanDraft!.questionTypes.filter((type) => type !== entry.type);
                  s.setSelectedPlanMode("custom");
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

      <PlanSummaryBadges session={s} />
    </div>
  );
}

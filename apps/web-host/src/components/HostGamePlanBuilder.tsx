import { type GamePlanPresetId, type RevealMode } from "@quiz/shared-types";

import type { UseHostSessionReturn } from "../hooks/useHostSession.js";
import { buildCustomGamePlan, buildPresetGamePlan } from "../lib/game-plan-drafts.js";
import {
  getPresetHint,
  getPresetLabel,
  getQuestionTypeLabel,
  getShowLevelLabel,
} from "../lib/labels.js";

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

interface HostGamePlanBuilderProps {
  session: UseHostSessionReturn;
}

export function HostGamePlanBuilder({ session: s }: HostGamePlanBuilderProps) {
  if (!s.catalog || !s.gamePlanDraft) {
    return <div className="host-estimate-display">Lade Fragenkatalog...</div>;
  }

  return (
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

      {s.selectedPlanMode === "custom" && <HostCustomGamePlanBuilder session={s} />}

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
  );
}

function HostCustomGamePlanBuilder({ session: s }: HostGamePlanBuilderProps) {
  return (
    <div className="host-custom-plan">
      <div className="host-choice-row">
        <span>Fragen</span>
        <div className="host-segmented">
          {QUESTION_COUNT_CHOICES.map((count) => (
            <button
              data-active={s.gamePlanDraft!.questionCount === count ? "true" : undefined}
              key={count}
              onClick={() => s.handlePlanDraftChange({ ...s.gamePlanDraft!, questionCount: count })}
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
              data-active={s.gamePlanDraft!.displayShowLevel === displayShowLevel ? "true" : undefined}
              key={displayShowLevel}
              onClick={() => s.handlePlanDraftChange({ ...s.gamePlanDraft!, displayShowLevel })}
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
  );
}

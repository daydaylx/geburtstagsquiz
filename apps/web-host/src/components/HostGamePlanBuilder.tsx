import type { GamePlanPresetId, RevealMode } from "@quiz/shared-types";

import type { UseHostSessionReturn } from "../hooks/useHostSession.js";
import { buildCustomGamePlan, buildPresetGamePlan } from "../lib/game-plan-drafts.js";
import { getPresetHint, getPresetLabel, getQuestionTypeLabel, getShowLevelLabel } from "../lib/labels.js";

const PRESET_IDS: GamePlanPresetId[] = ["quick_dirty", "normal_evening", "full_evening", "chaos_party"];
const QUESTION_COUNT_CHOICES = [10, 15, 20, 25, 30] as const;
const TIMER_CHOICES = [20_000, 30_000, 45_000, 60_000, 90_000] as const;
const REVEAL_CHOICES: Array<{ label: string; value: number; mode: RevealMode }> = [
  { label: "Manuell", value: 30_000, mode: "manual" },
  { label: "Fallback nach 30s", value: 30_000, mode: "manual_with_fallback" },
];
const REVEAL_DELAY_CHOICES = [0, 2_000, 3_000, 5_000, 8_000] as const;
const READING_PHASE_CHOICES = [0, 3_000, 5_000, 8_000] as const;
const CATEGORY_LABELS: Record<string, { title: string; meta: string }> = {
  "cat-01": { title: "Harry Potter", meta: "Nur Filme · schwer" },
  "cat-02": { title: "Sex & Liebe", meta: "explizit · mittel-schwer" },
  "cat-03": { title: "Internet-Slang", meta: "Millennial · Fossilien" },
  "cat-05": { title: "Party-Drinks", meta: "Feiern · Jugenddrinks" },
  "cat-06": { title: "Popkultur", meta: "Skandale · Meltdowns" },
  "cat-07": { title: "Gaming", meta: "Frust · Pixel-Nostalgie" },
  "cat-08": { title: "Musik", meta: "Jugendsünden · Emo-Phasen" },
  "cat-09": { title: "Adulting", meta: "Halbwissen · Erwachsene" },
  "cat-10": { title: "Technik-Fails", meta: "Hardware-Friedhof" },
  "cat-11": { title: "Allgemeinwissen", meta: "Logik" },
  "cat-12": { title: "Schulwissen", meta: "Klasse 1-4" },
};

function getTopVotedCategoryId(votes: Record<string, number>, categories: { id: string }[]): string | null {
  const sorted = categories
    .map((c) => ({ id: c.id, count: votes[c.id] ?? 0 }))
    .filter((e) => e.count > 0)
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
  return sorted[0]?.id ?? null;
}

function getCategoryLabel(category: { id: string; name: string; difficulty?: string; questionCount: number }) {
  const override = CATEGORY_LABELS[category.id];
  if (override) return override;

  const parenthetical = category.name.match(/\(([^)]+)\)\s*$/);
  const title = category.name.replace(/\s*\([^)]+\)\s*$/, "").trim();
  const difficulty = category.difficulty ? category.difficulty.replaceAll("_", "-") : null;
  const meta =
    parenthetical?.[1] ??
    (difficulty ? `${difficulty} · ${category.questionCount} Fragen` : `${category.questionCount} Fragen`);

  return { title, meta };
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
  const selectedCategoryCount = s.gamePlanDraft.categoryIds.length;
  const categoryStatus =
    selectedCategoryCount === 1 ? "1 Kategorie aktiv" : `${selectedCategoryCount} Kategorien aktiv`;

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
        <span className="host-plan-catalog-count">{s.catalog.totalQuestions} Fragen verfügbar</span>
      </div>

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

      {topId && (
        <button className="host-preset-button host-preset-button--voting" onClick={handleVotingOverride} type="button">
          <strong>Voting übernehmen</strong>
          <small>
            {topName} – {topCount} Stimme{topCount !== 1 ? "n" : ""}
          </small>
        </button>
      )}

      <div className="host-section-head host-section-head--categories">
        <p className="host-section-label host-section-sublabel">Kategorien</p>
        <span className="host-plan-catalog-count">
          {s.catalog.totalQuestions} Fragen verfügbar · {categoryStatus}
        </span>
      </div>
      <div className="host-category-grid">
        {s.catalog.categories.map((category) => {
          const voteCount = s.votes[category.id] ?? 0;
          const isSelected = s.gamePlanDraft!.categoryIds.includes(category.id);
          const categoryLabel = getCategoryLabel(category);
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
              <span className="host-category-name">{categoryLabel.title}</span>
              <span className="host-category-meta">
                {categoryLabel.meta} · {category.questionCount} Fragen
              </span>
              {voteCount > 0 && <span className="host-vote-badge">{voteCount}</span>}
            </label>
          );
        })}
      </div>

      <div className="host-custom-plan">
        <p className="host-section-label host-section-label--compact">Feineinstellungen</p>
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
          <label className="host-number-field">
            <span>Eigene Anzahl</span>
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
          </label>
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
          <span>Auflösung</span>
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
          <span>Auflösung verzögern</span>
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
          <span>Lesezeit</span>
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
          <span>Anzeige-Modus</span>
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
          <span>Testfrage vor dem Start</span>
        </label>

        <p className="host-section-label host-section-label--compact host-question-types-label">Fragetypen</p>
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
    </div>
  );
}

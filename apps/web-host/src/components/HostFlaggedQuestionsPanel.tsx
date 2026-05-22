import { useState } from "react";
import type { QuestionFlag } from "../lib/questionFlagsStorage.js";

export function HostFlaggedQuestionsPanel({
  flags,
  onRemove,
  onClearAll,
}: {
  flags: QuestionFlag[];
  onRemove: (questionId: string) => void;
  onClearAll: () => void;
}) {
  const [confirmClear, setConfirmClear] = useState(false);

  if (flags.length === 0) return null;

  const handleJsonExport = () => {
    const blob = new Blob([JSON.stringify(flags, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `quiz-markierungen-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleMarkdownCopy = () => {
    const lines: string[] = ["# Markierte Fragen\n"];
    for (const f of flags) {
      const total = f.totalQuestionCount ? ` / ${f.totalQuestionCount}` : "";
      lines.push(`## Frage ${f.questionIndex + 1}${total}\n`);
      lines.push(`**Grund:** ${f.reason}`);
      if (f.note) lines.push(`**Notiz:** ${f.note}`);
      lines.push(`\n**Frage:** ${f.text}`);
      if (f.options) {
        lines.push("\n**Antwortoptionen:**");
        for (const opt of f.options) lines.push(`- ${opt.label}`);
      }
      if (f.correctAnswer !== undefined) lines.push(`\n**Richtige Antwort:** ${JSON.stringify(f.correctAnswer)}`);
      if (f.explanation) lines.push(`**Erklärung:** ${f.explanation}`);
      lines.push("");
    }
    navigator.clipboard.writeText(lines.join("\n")).catch(() => {});
  };

  return (
    <div className="host-flags-panel">
      <div className="host-flags-head">
        <p className="host-section-label">Markierte Fragen: {flags.length}</p>
        <div className="host-flags-actions">
          <button className="host-secondary-button host-secondary-button--sm" onClick={handleJsonExport} type="button">
            JSON
          </button>
          <button
            className="host-secondary-button host-secondary-button--sm"
            onClick={handleMarkdownCopy}
            type="button"
          >
            Markdown
          </button>
          {confirmClear ? (
            <>
              <button
                className="host-secondary-button host-secondary-button--sm host-secondary-button--danger"
                onClick={() => {
                  onClearAll();
                  setConfirmClear(false);
                }}
                type="button"
              >
                Alle löschen?
              </button>
              <button className="host-small-cancel-button" onClick={() => setConfirmClear(false)} type="button">
                ✕
              </button>
            </>
          ) : (
            <button
              className="host-secondary-button host-secondary-button--sm"
              onClick={() => setConfirmClear(true)}
              type="button"
            >
              Alle löschen
            </button>
          )}
        </div>
      </div>
      <div className="host-flags-list">
        {flags.map((f) => (
          <div className="host-flag-item" key={f.questionId}>
            <div className="host-flag-item-head">
              <span className="host-flag-index">
                Frage {f.questionIndex + 1}
                {f.totalQuestionCount ? ` / ${f.totalQuestionCount}` : ""}
              </span>
              <span className="host-flag-reason">{f.reason}</span>
              <button
                className="host-flag-remove"
                onClick={() => onRemove(f.questionId)}
                type="button"
                aria-label="Markierung entfernen"
              >
                ✕
              </button>
            </div>
            <p className="host-flag-text">{f.text.length > 120 ? `${f.text.slice(0, 120)}…` : f.text}</p>
            {f.note && <p className="host-flag-note">{f.note}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

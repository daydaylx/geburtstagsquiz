import { useState } from "react";
import type { QuestionFlag } from "../lib/questionFlagsStorage.js";

const REASONS = [
  "Unklar formuliert",
  "Zu leicht",
  "Zu schwer",
  "Falsche Lösung",
  "Antwortoptionen schlecht",
  "Tippfehler",
  "Schlecht für Quizfluss",
  "Sonstiges",
] as const;

export function QuestionFlagDialog({
  existingFlag,
  onSave,
  onRemove,
  onClose,
}: {
  existingFlag: QuestionFlag | undefined;
  onSave: (reason: string, note: string) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState(existingFlag?.reason ?? REASONS[0]);
  const [note, setNote] = useState(existingFlag?.note ?? "");

  return (
    <div className="flag-dialog-overlay" role="presentation">
      <div className="flag-dialog" role="dialog" aria-modal="true" aria-label="Frage markieren">
        <div className="flag-dialog-head">
          <p className="flag-dialog-title">{existingFlag ? "Markierung bearbeiten" : "Frage markieren"}</p>
          <button className="flag-dialog-close" onClick={onClose} type="button" aria-label="Schließen">
            ✕
          </button>
        </div>
        <div className="flag-dialog-body">
          <label className="flag-dialog-label">
            Grund
            <select className="flag-dialog-select" value={reason} onChange={(e) => setReason(e.target.value)}>
              {REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="flag-dialog-label">
            Notiz (optional)
            <textarea
              className="flag-dialog-textarea"
              placeholder="Was genau muss überarbeitet werden?"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
            />
          </label>
        </div>
        <div className="flag-dialog-footer">
          {existingFlag && (
            <button className="flag-dialog-remove" onClick={onRemove} type="button">
              Entfernen
            </button>
          )}
          <button className="host-primary-button flag-dialog-save" onClick={() => onSave(reason, note)} type="button">
            Speichern
          </button>
        </div>
      </div>
    </div>
  );
}

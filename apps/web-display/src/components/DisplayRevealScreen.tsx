import { QuestionType } from "@quiz/shared-types";

import type { UseDisplaySessionReturn } from "../hooks/useDisplaySession.js";
import { getAnswerDisplayLabel } from "../lib/labels.js";

interface DisplayRevealScreenProps {
  session: UseDisplaySessionReturn;
  correctCount: number;
  wrongCount: number;
  noneCount: number;
  readyProgressAllReady: boolean;
  readyProgressPercent: number;
  visibleReadyProgress: UseDisplaySessionReturn["nextQuestionReadyProgress"];
}

export function DisplayRevealScreen({
  session: s,
  correctCount,
  wrongCount,
  noneCount,
  readyProgressAllReady,
  readyProgressPercent,
  visibleReadyProgress,
}: DisplayRevealScreenProps) {
  if (!s.question) {
    return null;
  }

  return (
    <div className="display-reveal" data-fading={s.isFadingOut || undefined}>
      <h3 className="display-reveal-question">{s.question.text}</h3>

      {"options" in s.question && <DisplayRevealOptions session={s} question={s.question} />}

      {"items" in s.question && s.revealedAnswer?.type === "ranking" && (
        <ol className="display-reveal-ranking">
          {s.revealedAnswer.value.map((itemId, pos) => {
            const item =
              s.question && "items" in s.question ? s.question.items.find((entry) => entry.id === itemId) : undefined;
            return (
              <li className="display-reveal-ranking-item" key={itemId}>
                <span className="display-reveal-rank-pos">{pos + 1}.</span>
                <span>{item?.label ?? itemId}</span>
              </li>
            );
          })}
        </ol>
      )}

      {s.question.type === QuestionType.Estimate && s.revealedAnswer?.type === "number" && (
        <div className="display-reveal-estimate">
          <div className="display-reveal-estimate-main">
            <span className="display-reveal-estimate-value">{s.revealedAnswer.value}</span>
            <span className="display-reveal-estimate-unit">{s.question.unit}</span>
          </div>
          <p className="display-reveal-estimate-context">{s.question.context}</p>
        </div>
      )}

      {s.question.type === QuestionType.OpenText && (
        <div className="display-reveal-text-answer">
          {s.revealedAnswer?.type === "text"
            ? s.revealedAnswer.value
            : s.revealedAnswer?.type === "options"
              ? s.revealedAnswer.value[0]
              : ""}
        </div>
      )}

      <div className="display-reveal-stats">
        <span className="display-reveal-stat display-reveal-stat--correct">✓ {correctCount} richtig</span>
        <span className="display-reveal-stat display-reveal-stat--wrong">✗ {wrongCount} falsch</span>
        <span className="display-reveal-stat">— {noneCount} keine</span>
      </div>

      {s.revealExplanation && (
        <div className="display-explanation">
          <div className="display-explanation-label">Erklärung</div>
          <p>{s.revealExplanation}</p>
        </div>
      )}
      {visibleReadyProgress && (
        <div className="display-ready-block" data-all-ready={readyProgressAllReady ? "true" : undefined}>
          <div className="display-ready-label">
            {readyProgressAllReady
              ? "Alle bereit!"
              : `${visibleReadyProgress.readyCount} / ${visibleReadyProgress.totalEligiblePlayers} bereit`}
          </div>
          <div className="display-ready-track">
            <div className="display-ready-fill" style={{ width: `${readyProgressPercent}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

function DisplayRevealOptions({
  session: s,
  question,
}: {
  session: UseDisplaySessionReturn;
  question: Extract<NonNullable<UseDisplaySessionReturn["question"]>, { options: unknown[] }>;
}) {
  const revealedAnswer = s.revealedAnswer;

  return (
    <>
      <div className="display-reveal-header">Richtige Antwort</div>
      {revealedAnswer?.type === "option" &&
        (() => {
          const correctOpt = question.options.find((option) => option.id === revealedAnswer.value);
          const correctIndex = correctOpt ? question.options.findIndex((option) => option.id === correctOpt.id) : -1;
          return correctOpt ? (
            <div className="display-reveal-correct-card">
              <span className="display-reveal-correct-label">{getAnswerDisplayLabel(correctIndex)}</span>
              <span className="display-reveal-correct-text">{correctOpt.label}</span>
            </div>
          ) : null;
        })()}
      {revealedAnswer?.type === "options" &&
        revealedAnswer.value.map((id) => {
          const opt = question.options.find((option) => option.id === id);
          const optIndex = opt ? question.options.findIndex((option) => option.id === opt.id) : -1;
          return opt ? (
            <div className="display-reveal-correct-card" key={id}>
              <span className="display-reveal-correct-label">{getAnswerDisplayLabel(optIndex)}</span>
              <span className="display-reveal-correct-text">{opt.label}</span>
            </div>
          ) : null;
        })}
    </>
  );
}

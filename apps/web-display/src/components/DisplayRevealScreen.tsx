import { QuestionType } from "@quiz/shared-types";

import type { UseDisplaySessionReturn } from "../hooks/useDisplaySession.js";
import { getAnswerDisplayLabel } from "../lib/labels.js";

type DisplayQuestion = NonNullable<UseDisplaySessionReturn["question"]>;
type DisplayQuestionWithOptions = Extract<DisplayQuestion, { options: { id: string; label: string }[] }>;
type DisplayQuestionWithItems = Extract<DisplayQuestion, { items: { id: string; label: string }[] }>;

const REVEAL_CONFETTI_COLORS = ["#22c55e", "#f6c76a", "#2dd4a8", "#f59e0b", "#d93683"];

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

  const totalAnswers = correctCount + wrongCount + noneCount;
  const correctRatio = totalAnswers > 0 ? correctCount / totalAnswers : 0;
  const showConfetti = correctRatio >= 0.8 && correctCount >= 3;

  return (
    <div className="display-reveal" data-fading={s.isFadingOut || undefined} data-question-type={s.question.type}>
      <section className="display-reveal-question-section" aria-label="Frage">
        <div className="display-reveal-label">Frage</div>
        <p className="display-reveal-question-text">{s.question.text}</p>
      </section>

      <section className="display-reveal-answer-stage" aria-label="Richtige Antwort">
        <div className="display-reveal-label">Richtige Antwort</div>
        <DisplayRevealAnswer question={s.question} session={s} />
      </section>

      {s.revealExplanation && (
        <section className="display-reveal-explanation-section" aria-label="Aufklärung">
          <div className="display-reveal-label">Aufklärung</div>
          <p className="display-reveal-explanation-text">{s.revealExplanation}</p>
        </section>
      )}

      <div className="display-reveal-stats-compact" role="status" aria-label="Rundenergebnis">
        <span>{correctCount} richtig</span>
        <span className="display-reveal-stats-sep" aria-hidden="true">
          ·
        </span>
        <span>{wrongCount} falsch</span>
        <span className="display-reveal-stats-sep" aria-hidden="true">
          ·
        </span>
        <span>{noneCount} keine Antwort</span>
      </div>

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

      {showConfetti && <RevealConfetti />}
    </div>
  );
}

function RevealConfetti() {
  return (
    <div className="display-reveal-confetti" aria-hidden="true">
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className="display-reveal-confetti-piece"
          style={{
            left: `${(i * 9.3) % 100}%`,
            width: 8,
            height: 8,
            borderRadius: i % 2 === 0 ? "2px" : "50%",
            animationDelay: `${(i * 0.15) % 1.5}s`,
            animationDuration: `${2.5 + ((i * 0.08) % 1.2)}s`,
            background: REVEAL_CONFETTI_COLORS[i % REVEAL_CONFETTI_COLORS.length],
            transform: `rotate(${(i * 37) % 360}deg)`,
          }}
        />
      ))}
    </div>
  );
}

function DisplayRevealAnswer({
  session: s,
  question,
}: {
  session: UseDisplaySessionReturn;
  question: DisplayQuestion;
}) {
  if ("options" in question) {
    return <DisplayRevealOptions question={question} session={s} />;
  }

  if ("items" in question && s.revealedAnswer?.type === "ranking") {
    return <DisplayRevealRanking question={question} value={s.revealedAnswer.value} />;
  }

  if (question.type === QuestionType.Estimate && s.revealedAnswer?.type === "number") {
    return (
      <div className="display-reveal-estimate">
        <div className="display-reveal-estimate-main">
          <span className="display-reveal-estimate-value">{formatRevealNumber(s.revealedAnswer.value)}</span>
          <span className="display-reveal-estimate-unit">{question.unit}</span>
        </div>
        {s.revealEstimateContext && <p className="display-reveal-estimate-context">{s.revealEstimateContext}</p>}
      </div>
    );
  }

  if (question.type === QuestionType.OpenText) {
    return (
      <div className="display-reveal-text-answer">
        {s.revealedAnswer?.type === "text"
          ? s.revealedAnswer.value
          : s.revealedAnswer?.type === "options"
            ? s.revealedAnswer.value[0]
            : ""}
      </div>
    );
  }

  return null;
}

function DisplayRevealOptions({
  session: s,
  question,
}: {
  session: UseDisplaySessionReturn;
  question: DisplayQuestionWithOptions;
}) {
  const revealedAnswer = s.revealedAnswer;

  return (
    <div className="display-reveal-correct-list">
      {revealedAnswer?.type === "option" &&
        (() => {
          const correctOpt = question.options.find((option) => option.id === revealedAnswer.value);
          const correctIndex = correctOpt ? question.options.findIndex((option) => option.id === correctOpt.id) : -1;
          return correctOpt ? (
            <div className="display-reveal-correct-card" data-option-index={correctIndex}>
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
            <div className="display-reveal-correct-card" data-option-index={optIndex} key={id}>
              <span className="display-reveal-correct-label">{getAnswerDisplayLabel(optIndex)}</span>
              <span className="display-reveal-correct-text">{opt.label}</span>
            </div>
          ) : null;
        })}
    </div>
  );
}

function DisplayRevealRanking({ question, value }: { question: DisplayQuestionWithItems; value: string[] }) {
  return (
    <ol className="display-reveal-ranking">
      {value.map((itemId, pos) => {
        const item = question.items.find((entry) => entry.id === itemId);
        return (
          <li className="display-reveal-ranking-item" key={itemId}>
            <span className="display-reveal-rank-pos">{pos + 1}</span>
            <span>{item?.label ?? itemId}</span>
          </li>
        );
      })}
    </ol>
  );
}

function formatRevealNumber(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}

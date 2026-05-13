import { QuestionType } from "@quiz/shared-types";

import type { UseDisplaySessionReturn } from "../hooks/useDisplaySession.js";
import { getAnswerDisplayLabel, getQuestionTypeLabel } from "../lib/labels.js";

type DisplayQuestion = NonNullable<UseDisplaySessionReturn["question"]>;
type DisplayQuestionDensity = "comfortable" | "compact" | "dense";

interface DisplayQuestionScreenProps {
  isTimerUrgent: boolean;
  isTimerWarning: boolean;
  ringCircumference: number;
  ringOffset: number;
  session: UseDisplaySessionReturn;
  timerSeconds: number;
}

function getChoiceLabels(question: DisplayQuestion): string[] {
  if ("options" in question) return question.options.map((option) => option.label);
  if ("items" in question) return question.items.map((item) => item.label);
  return [];
}

function getQuestionDensity(question: DisplayQuestion): DisplayQuestionDensity {
  const labels = getChoiceLabels(question);
  const maxLabelLength = Math.max(0, ...labels.map((label) => label.length));
  const totalLabelLength = labels.reduce((total, label) => total + label.length, 0);

  if (question.text.length > 118 || maxLabelLength > 78 || totalLabelLength > 230 || labels.length > 5) {
    return "dense";
  }

  if (question.text.length > 88 || maxLabelLength > 48 || totalLabelLength > 160 || labels.length > 4) {
    return "compact";
  }

  return "comfortable";
}

function shouldStackChoiceGrid(question: Extract<DisplayQuestion, { options: { label: string }[] }>): boolean {
  return (
    question.options.length > 4 ||
    question.text.length > 96 ||
    question.options.some((option) => option.label.length > 54)
  );
}

export function DisplayQuestionScreen({
  isTimerUrgent,
  isTimerWarning,
  ringCircumference,
  ringOffset,
  session: s,
  timerSeconds,
}: DisplayQuestionScreenProps) {
  if (!s.question) return null;

  const question = s.question;
  const density = getQuestionDensity(question);

  return (
    <div
      className="display-question"
      data-density={density}
      data-fading={s.isFadingOut || undefined}
      data-question-type={question.type}
      key={question.questionId}
    >
      <div className="display-question-meta">
        Frage {question.questionIndex + 1} / {question.totalQuestionCount}
        <span className="display-question-type">
          {" · "}
          {getQuestionTypeLabel(question.type)}
        </span>
      </div>
      <h2 className="display-question-text">{question.text}</h2>

      {(question.type === QuestionType.MultipleChoice ||
        question.type === QuestionType.Logic ||
        question.type === QuestionType.MajorityGuess) && (
        <DisplayChoiceOptions question={question} stacked={shouldStackChoiceGrid(question)} />
      )}

      {question.type === QuestionType.Ranking && <DisplayRankingPrompt question={question} />}

      {question.type === QuestionType.Estimate && <DisplayEstimatePrompt question={question} />}

      {question.type === QuestionType.OpenText && <DisplayOpenTextPrompt />}

      <DisplayQuestionFooter
        isTimerUrgent={isTimerUrgent}
        isTimerWarning={isTimerWarning}
        ringCircumference={ringCircumference}
        ringOffset={ringOffset}
        session={s}
        timerSeconds={timerSeconds}
      />
    </div>
  );
}

function DisplayChoiceOptions({
  question,
  stacked,
}: {
  question: Extract<DisplayQuestion, { options: { id: string; label: string }[] }>;
  stacked: boolean;
}) {
  return (
    <ul className="display-options display-options--choices" data-layout={stacked ? "stacked" : "grid"}>
      {question.options.map((opt, index) => (
        <li className="display-option" data-option-index={index} key={opt.id}>
          <span className="display-option-label">{getAnswerDisplayLabel(index)}</span>
          <span className="display-option-text">{opt.label}</span>
        </li>
      ))}
    </ul>
  );
}

function DisplayRankingPrompt({
  question,
}: {
  question: Extract<DisplayQuestion, { items: { id: string; label: string }[] }>;
}) {
  return (
    <div className="display-ranking-prompt">
      <div className="display-question-mode-copy">Ordne auf deinem Handy in die richtige Reihenfolge.</div>
      <ol className="display-ranking-items">
        {question.items.map((item, index) => (
          <li className="display-ranking-item" key={item.id}>
            <span className="display-ranking-index">{index + 1}</span>
            <span className="display-ranking-label">{item.label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function DisplayEstimatePrompt({ question }: { question: Extract<DisplayQuestion, { type: QuestionType.Estimate }> }) {
  return (
    <div className="display-estimate-prompt">
      <span className="display-question-mode-copy">Schätze den Wert auf deinem Handy.</span>
      <strong className="display-estimate-unit">{question.unit}</strong>
    </div>
  );
}

function DisplayOpenTextPrompt() {
  return (
    <div className="display-open-text-prompt">
      <span className="display-question-mode-copy">Gib deine Antwort als Text auf deinem Handy ein.</span>
      <strong>Freitextantwort</strong>
    </div>
  );
}

function DisplayQuestionFooter({
  isTimerUrgent,
  isTimerWarning,
  ringCircumference,
  ringOffset,
  session: s,
  timerSeconds,
}: DisplayQuestionScreenProps) {
  return (
    <div className="display-footer">
      <div className="display-timer-wrap">
        <svg aria-hidden="true" className="display-timer-svg" viewBox="0 0 100 100">
          <circle className="display-timer-track" cx="50" cy="50" r="42" />
          <circle
            className="display-timer-fill"
            cx="50"
            cy="50"
            data-urgent={isTimerUrgent ? "true" : undefined}
            data-warning={isTimerWarning ? "true" : undefined}
            r="42"
            style={{ strokeDasharray: ringCircumference, strokeDashoffset: ringOffset }}
          />
        </svg>
        <span
          className="display-timer-label"
          data-urgent={isTimerUrgent ? "true" : undefined}
          data-warning={isTimerWarning ? "true" : undefined}
        >
          {s.remainingMs > 0 ? timerSeconds : "-"}
        </span>
      </div>
      {s.answerProgress && (
        <div className="display-answer-progress">
          <span>
            {s.answerProgress.answeredCount} / {s.answerProgress.totalEligiblePlayers} geantwortet
          </span>
          {s.answerProgress.totalEligiblePlayers > 0 && (
            <div className="display-progress-bar">
              <div
                className="display-progress-fill"
                style={{
                  width: `${(s.answerProgress.answeredCount / s.answerProgress.totalEligiblePlayers) * 100}%`,
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

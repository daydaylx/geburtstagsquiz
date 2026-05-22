import type { ScoreUpdatePayload } from "@quiz/shared-protocol";
import type { UseHostSessionReturn } from "../hooks/useHostSession.js";
import type { QuestionFlag } from "../lib/questionFlagsStorage.js";
import { HostFlaggedQuestionsPanel } from "./HostFlaggedQuestionsPanel.js";

export function HostScoreboardStage({
  session: s,
  latestScoreboard,
  latestScoreChanges,
  nextReadyLabel,
  flags,
  onFlagRemove,
  onFlagClearAll,
}: {
  session: UseHostSessionReturn;
  latestScoreboard: ScoreUpdatePayload["scoreboard"];
  latestScoreChanges: ScoreUpdatePayload["scoreChanges"];
  nextReadyLabel: string;
  flags: QuestionFlag[];
  onFlagRemove: (questionId: string) => void;
  onFlagClearAll: () => void;
}) {
  return (
    <div className="host-panel-content">
      <p className="host-section-label">{s.screen === "finished" ? "Endstand" : `Zwischenstand (${nextReadyLabel})`}</p>
      <div className="host-scoreboard-list" data-final={s.screen === "finished" ? "true" : undefined}>
        {latestScoreboard.map((entry, index) => {
          const gap = index > 0 && latestScoreboard[0] ? latestScoreboard[0].score - entry.score : 0;
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
      {s.screen === "scoreboard" && s.nextQuestionReadyProgress?.totalEligiblePlayers === 0 && (
        <p className="host-zero-players-hint">
          Keine Spieler verbunden – warte auf Reconnect oder gehe manuell weiter.
        </p>
      )}
      {s.screen === "finished" && (
        <HostFlaggedQuestionsPanel flags={flags} onRemove={onFlagRemove} onClearAll={onFlagClearAll} />
      )}
    </div>
  );
}

import type { UseDisplaySessionReturn } from "../hooks/useDisplaySession.js";

interface DisplayScoreboardScreenProps {
  session: UseDisplaySessionReturn;
  readyProgressAllReady: boolean;
  readyProgressPercent: number;
  visibleReadyProgress: UseDisplaySessionReturn["nextQuestionReadyProgress"];
}

export function DisplayScoreboardScreen({
  session: s,
  readyProgressAllReady,
  readyProgressPercent,
  visibleReadyProgress,
}: DisplayScoreboardScreenProps) {
  if (!s.scoreboard) return null;

  const highestScore = s.scoreboard.scoreboard[0]?.score ?? 0;
  const maxScore = Math.max(highestScore, s.question?.totalQuestionCount ?? 10, 10);

  return (
    <div className="display-scoreboard" data-fading={s.isFadingOut || undefined}>
      <h2>Zwischenstand</h2>
      <ol className="display-scoreboard-list">
        {s.scoreboard.scoreboard.slice(0, 8).map((entry, i) => {
          const change = s.scoreChanges.find((c) => c.playerId === entry.playerId);
          const rankDelta = change ? change.previousRank - change.rank : 0;
          const progressPercent = Math.min(100, Math.max(0, (entry.score / maxScore) * 100));
          return (
            <li
              key={entry.playerId}
              className="display-scoreboard-entry"
              data-rank={i + 1}
              data-changed={change && change.delta > 0 ? "true" : undefined}
            >
              <span className="display-rank">{i + 1}.</span>
              {rankDelta !== 0 && (
                <span
                  className="display-rank-change"
                  data-direction={rankDelta > 0 ? "up" : "down"}
                >
                  {rankDelta > 0 ? `▲${rankDelta}` : `▼${Math.abs(rankDelta)}`}
                </span>
              )}
              <span className="display-name">{entry.name}</span>
              <div
                className="display-progress-track"
                style={{ "--progress": `${progressPercent}%` } as React.CSSProperties}
              >
                <span className="display-progress-label">Start</span>
                <div className="display-progress-bar">
                  <div className="display-progress-fill" />
                  <div className="display-progress-marker" />
                </div>
                <span className="display-progress-label">Ziel</span>
              </div>
              {change && change.delta > 0 && (
                <span className="display-score-delta">+{change.delta}</span>
              )}
              <span className="display-score">{entry.score}</span>
            </li>
          );
        })}
      </ol>
      {visibleReadyProgress && (
        <div
          className="display-ready-block"
          data-all-ready={readyProgressAllReady ? "true" : undefined}
        >
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

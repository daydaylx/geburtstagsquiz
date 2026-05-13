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

  const visibleEntries = s.scoreboard.scoreboard.slice(0, 10);
  const leader = visibleEntries[0];

  return (
    <div className="display-scoreboard" data-fading={s.isFadingOut || undefined}>
      <div className="display-scoreboard-header">
        <div>
          <p className="display-scoreboard-kicker">Zwischenstand</p>
          <h2>Leaderboard</h2>
        </div>
        {leader && (
          <div className="display-scoreboard-leader">
            <span>Aktuell vorne</span>
            <strong>{leader.name}</strong>
            <em>{leader.score} Pkt</em>
          </div>
        )}
      </div>

      <ol className="display-scoreboard-list" data-count={visibleEntries.length}>
        {visibleEntries.map((entry, i) => {
          const change = s.scoreChanges.find((c) => c.playerId === entry.playerId);
          const rankDelta = change ? change.previousRank - change.rank : 0;
          return (
            <li
              key={entry.playerId}
              className="display-scoreboard-entry"
              data-rank={i + 1}
              data-tier={i < 3 ? "top" : "field"}
              data-changed={change && change.delta > 0 ? "true" : undefined}
            >
              <span className="display-rank">
                <strong>{i + 1}</strong>
                <span>Platz</span>
              </span>
              <span className="display-name">{entry.name}</span>
              {rankDelta !== 0 && (
                <span className="display-rank-change" data-direction={rankDelta > 0 ? "up" : "down"}>
                  {rankDelta > 0 ? `▲ ${rankDelta}` : `▼ ${Math.abs(rankDelta)}`}
                </span>
              )}
              {change && change.delta > 0 && <span className="display-score-delta">+{change.delta}</span>}
              <span className="display-score">
                {entry.score}
                <small>Pkt</small>
              </span>
            </li>
          );
        })}
      </ol>
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

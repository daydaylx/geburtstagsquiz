import type { UseDisplaySessionReturn } from "../hooks/useDisplaySession.js";

const CONFETTI_COLORS = ["#ff6b6b", "#ffd500", "#00d4ff", "#00e676", "#c061cb"];

export function DisplayFinishedScreen({ session: s }: { session: UseDisplaySessionReturn }) {
  if (!s.finalResult) return null;
  const fr = s.finalResult;

  return (
    <div className="display-finished" data-fading={s.isFadingOut || undefined}>
      <h1>Quiz beendet!</h1>

      <div className="display-podium">
        {[1, 0, 2].map((rankIndex) => {
          const entry = fr.finalScoreboard[rankIndex];
          if (!entry) return null;
          return (
            <div
              key={rankIndex}
              className={`display-podium-entry display-podium-entry--${rankIndex + 1}`}
              style={{ visibility: entry ? "visible" : "hidden" }}
            >
              <div className="display-podium-rank-badge">{rankIndex + 1}</div>
              <div className="display-podium-name">{entry.name}</div>
              <div className="display-podium-score">{entry.score} Pkt</div>
            </div>
          );
        })}
      </div>

      {fr.finalScoreboard.length > 3 && (
        <ol className="display-scoreboard-list">
          {fr.finalScoreboard.slice(3, 8).map((entry, i) => (
            <li
              key={entry.playerId}
              className="display-scoreboard-entry"
              data-rank={i + 4}
            >
              <span className="display-rank">{i + 4}.</span>
              <span className="display-name">{entry.name}</span>
              <span className="display-score">{entry.score}</span>
            </li>
          ))}
        </ol>
      )}

      {fr.finalStats && (
        <div className="display-final-stats">
          {fr.finalStats.mostCorrect && (
            <div className="display-final-stat">
              <span className="display-final-stat-label">Meiste richtig</span>
              <span className="display-final-stat-value">
                {fr.finalStats.mostCorrect.name} · {fr.finalStats.mostCorrect.count}×
              </span>
            </div>
          )}
          {fr.finalStats.fastestAnswer && (
            <div className="display-final-stat">
              <span className="display-final-stat-label">Schnellste Antwort</span>
              <span className="display-final-stat-value">
                {fr.finalStats.fastestAnswer.name}
              </span>
            </div>
          )}
          {fr.finalStats.closestGap && (
            <div className="display-final-stat">
              <span className="display-final-stat-label">Knappster Abstand</span>
              <span className="display-final-stat-value">
                {fr.finalStats.closestGap.points} Punkte
              </span>
            </div>
          )}
        </div>
      )}

      {s.displayShowLevel !== "minimal" && (
        <div className="display-confetti" aria-hidden="true">
          {Array.from({ length: 30 }).map((_, i) => (
            <div
              key={i}
              className="display-confetti-piece"
              style={{
                left: `${(i * 3.37) % 100}%`,
                animationDelay: `${(i * 0.12) % 1.8}s`,
                animationDuration: `${2.8 + ((i * 0.07) % 1.5)}s`,
                background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

import type { UseDisplaySessionReturn } from "../hooks/useDisplaySession.js";

const CONFETTI_COLORS = ["#ff6b6b", "#ffd500", "#00d4ff", "#00e676", "#c061cb"];

const CONFETTI_SHAPES = [
  { w: 8, h: 12, radius: "2px" },
  { w: 10, h: 10, radius: "50%" },
  { w: 6, h: 14, radius: "3px" },
  { w: 12, h: 8, radius: "1px" },
  { w: 7, h: 7, radius: "50%" },
];

export function DisplayFinishedScreen({ session: s }: { session: UseDisplaySessionReturn }) {
  if (!s.finalResult) return null;
  const fr = s.finalResult;
  const winner = fr.finalScoreboard[0];
  const podiumEntries = [1, 0, 2]
    .map((rankIndex) => ({ entry: fr.finalScoreboard[rankIndex], rank: rankIndex + 1 }))
    .filter((item): item is { entry: NonNullable<(typeof fr.finalScoreboard)[number]>; rank: number } => !!item.entry);
  const remainingEntries = fr.finalScoreboard.slice(3, 10);
  const confettiCount = getConfettiCount(s.displayShowLevel);

  return (
    <div className="display-finished" data-fading={s.isFadingOut || undefined}>
      <section className="display-winner-moment">
        <span className="display-finished-kicker">Finale</span>
        <h1>{winner ? `${winner.name} gewinnt!` : "Quiz beendet!"}</h1>
        {winner && <p>{winner.score} Punkte</p>}
      </section>

      <div className="display-podium" data-count={podiumEntries.length}>
        {podiumEntries.map(({ entry, rank }) => (
          <div className={`display-podium-entry display-podium-entry--${rank}`} key={entry.playerId}>
            <div className="display-podium-rank-badge">{rank}</div>
            <div className="display-podium-name">{entry.name}</div>
            <div className="display-podium-score">{entry.score} Pkt</div>
          </div>
        ))}
      </div>

      {remainingEntries.length > 0 && (
        <ol className="display-scoreboard-list display-scoreboard-list--final">
          {remainingEntries.map((entry, i) => (
            <li key={entry.playerId} className="display-scoreboard-entry" data-rank={i + 4}>
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
            <div className="display-final-stat" data-award="correct">
              <span className="display-final-stat-label">Auszeichnung</span>
              <span className="display-final-stat-title">Meiste richtig</span>
              <span className="display-final-stat-value">
                {fr.finalStats.mostCorrect.name} · {fr.finalStats.mostCorrect.count}×
              </span>
            </div>
          )}
          {fr.finalStats.fastestAnswer && (
            <div className="display-final-stat" data-award="fastest">
              <span className="display-final-stat-label">Auszeichnung</span>
              <span className="display-final-stat-title">Schnellste Antwort</span>
              <span className="display-final-stat-value">
                {fr.finalStats.fastestAnswer.name} · {formatSeconds(fr.finalStats.fastestAnswer.submittedAtMs)}
              </span>
            </div>
          )}
          {fr.finalStats.closestGap && (
            <div className="display-final-stat" data-award="closest">
              <span className="display-final-stat-label">Auszeichnung</span>
              <span className="display-final-stat-title">Knappster Abstand</span>
              <span className="display-final-stat-value">{fr.finalStats.closestGap.points} Punkte</span>
            </div>
          )}
        </div>
      )}

      <p className="display-finished-host-hint">Der Host kann ein neues Spiel starten.</p>

      {confettiCount > 0 && (
        <div className="display-confetti" aria-hidden="true">
          {Array.from({ length: confettiCount }).map((_, i) => {
            const shape = CONFETTI_SHAPES[i % CONFETTI_SHAPES.length];
            return (
              <div
                key={i}
                className="display-confetti-piece"
                style={{
                  left: `${(i * 3.37) % 100}%`,
                  width: shape.w,
                  height: shape.h,
                  borderRadius: shape.radius,
                  animationDelay: `${(i * 0.12) % 1.8}s`,
                  animationDuration: `${2.8 + ((i * 0.07) % 1.5)}s`,
                  background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                  transform: `rotate(${(i * 37) % 360}deg)`,
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function getConfettiCount(displayShowLevel: UseDisplaySessionReturn["displayShowLevel"]): number {
  switch (displayShowLevel) {
    case "minimal":
      return 0;
    case "normal":
      return 16;
    case "high":
      return 30;
  }
}

function formatSeconds(ms: number): string {
  return `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(ms / 1000)} s`;
}

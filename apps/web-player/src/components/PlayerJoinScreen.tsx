import { normalizeJoinCode } from "@quiz/shared-utils";
import type { UsePlayerSessionReturn } from "../hooks/usePlayerSession.js";

export function PlayerJoinScreen({ session: s }: { session: UsePlayerSessionReturn }) {
  return (
    <div className="player-join-root">
      <div className="player-join-logo" aria-hidden="true">
        QUIZ
      </div>
      <div className="player-card">
        <span className="player-kicker">Willkommen</span>
        <form
          className="player-join-form"
          onSubmit={(e) => {
            e.preventDefault();
            s.handleJoin();
          }}
        >
          <input
            aria-label="Raumcode"
            autoCapitalize="characters"
            className="player-input"
            maxLength={6}
            onChange={(e) => s.setJoinCode(normalizeJoinCode(e.target.value))}
            placeholder="Raumcode"
            value={s.joinCode}
          />
          <input
            aria-label="Dein Name"
            autoCapitalize="words"
            className="player-input"
            maxLength={20}
            onChange={(e) => s.setPlayerName(e.target.value)}
            placeholder="Dein Name"
            value={s.playerName}
          />
          <button
            className="player-primary-button"
            disabled={s.isJoining || s.joinCode.length !== 6 || !s.playerName}
            type="submit"
          >
            {s.isJoining ? "Beitreten…" : "Spielen"}
          </button>
        </form>
      </div>
    </div>
  );
}

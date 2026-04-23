import { useEffect, useEffectEvent, useRef, useState } from "react";

import {
  EVENTS,
  PROTOCOL_ERROR_CODES,
  parseServerToClientEnvelope,
  serializeEnvelope,
  type ClientToServerEventPayloadMap,
  type LobbyUpdatePayload,
  type QuestionShowPayload,
  type ScoreUpdatePayload,
  type GameFinishedPayload,
  type ConnectionResumedPayload,
} from "@quiz/shared-protocol";
import { GameState } from "@quiz/shared-types";
import {
  getReconnectDelay,
  getWebSocketProtocol,
  normalizeJoinCode,
  normalizePlayerName,
} from "@quiz/shared-utils";

import {
  clearPlayerStoredSession,
  loadPlayerStoredSession,
  savePlayerStoredSession,
  type PlayerStoredSession,
} from "./storage.js";

type ConnectionState = "connecting" | "connected" | "reconnecting";

interface PlayerNotice {
  kind: "info" | "error";
  text: string;
}

interface JoinAttempt {
  joinCode: string;
  playerName: string;
}

type PlayerScreen = "join" | "lobby" | "question" | "reveal" | "scoreboard" | "finished";
type AnswerStatus = "idle" | "submitting" | "accepted" | "rejected" | "locked";

function getServerSocketUrl(): string {
  const url = new URL(window.location.href);
  url.protocol = getWebSocketProtocol(window.location.protocol);
  url.port = "3001";
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function getInitialJoinCode(storedSession: PlayerStoredSession | null): string {
  const queryJoinCode = new URLSearchParams(window.location.search).get("joinCode");
  return normalizeJoinCode(queryJoinCode ?? storedSession?.joinCode ?? "");
}

function getConnectionLabel(connectionState: ConnectionState): string {
  switch (connectionState) {
    case "connecting":
      return "Verbinde…";
    case "reconnecting":
      return "Neuverbinden…";
    case "connected":
      return "Verbunden";
    default:
      return "Offline";
  }
}

export function App() {
  const initialSession = loadPlayerStoredSession();

  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [notice, setNotice] = useState<PlayerNotice | null>(
    initialSession
      ? {
          kind: "info",
          text: "Gespeicherte Spielersitzung wird wiederhergestellt…",
        }
      : null,
  );
  const [joinCode, setJoinCode] = useState(getInitialJoinCode(initialSession));
  const [playerName, setPlayerName] = useState(initialSession?.playerName ?? "");
  const [lobby, setLobby] = useState<LobbyUpdatePayload | null>(null);
  const [roomId, setRoomId] = useState<string | null>(initialSession?.roomId ?? null);
  const [isJoining, setIsJoining] = useState(false);

  const [screen, setScreen] = useState<PlayerScreen>(initialSession ? "lobby" : "join");
  const [question, setQuestion] = useState<QuestionShowPayload | null>(null);
  const [remainingMs, setRemainingMs] = useState<number>(0);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [answerStatus, setAnswerStatus] = useState<AnswerStatus>("idle");
  const [correctAnswer, setCorrectAnswer] = useState<{ type: string; value: string } | null>(null);
  const [scoreboard, setScoreboard] = useState<ScoreUpdatePayload | null>(null);
  const [finalResult, setFinalResult] = useState<GameFinishedPayload | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const shouldReconnectRef = useRef(true);
  const playerSessionRef = useRef<PlayerStoredSession | null>(initialSession);
  const lastJoinAttemptRef = useRef<JoinAttempt | null>(null);
  const resumedAnswerOptionIdRef = useRef<string | null>(null);
  const intentionalReconnectRef = useRef(false);

  const clearReconnectTimer = useEffectEvent(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  });

  const updateStoredSession = useEffectEvent((session: PlayerStoredSession | null) => {
    playerSessionRef.current = session;

    if (session) {
      savePlayerStoredSession(session);
      return;
    }

    clearPlayerStoredSession();
  });

  const resetToJoin = useEffectEvent(() => {
    setLobby(null);
    setRoomId(null);
    setIsJoining(false);
    setScreen("join");
    setQuestion(null);
    setRemainingMs(0);
    setSelectedOptionId(null);
    setAnswerStatus("idle");
    setCorrectAnswer(null);
    setScoreboard(null);
    setFinalResult(null);
  });

  const sendClientEvent = useEffectEvent(
    <TEvent extends keyof ClientToServerEventPayloadMap>(
      event: TEvent,
      payload: ClientToServerEventPayloadMap[TEvent],
    ) => {
      const socket = socketRef.current;

      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return false;
      }

      socket.send(serializeEnvelope(event, payload));
      return true;
    },
  );

  const scheduleReconnect = useEffectEvent(() => {
    if (!shouldReconnectRef.current) {
      return;
    }

    clearReconnectTimer();

    const delay = getReconnectDelay(reconnectAttemptRef.current);
    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectAttemptRef.current += 1;
      connectSocket();
    }, delay);
  });

  const handleSubmitAnswer = useEffectEvent((optionId: string) => {
    const session = playerSessionRef.current;
    if (!session || !question || answerStatus !== "idle") return;

    setSelectedOptionId(optionId);
    setAnswerStatus("submitting");

    const didSend = sendClientEvent(EVENTS.ANSWER_SUBMIT, {
      roomId: session.roomId,
      questionId: question.questionId,
      playerId: session.playerId,
      answer: { type: "option", value: optionId },
      requestId: crypto.randomUUID(),
    });

    if (!didSend) {
      setAnswerStatus("idle");
      setSelectedOptionId(null);
      setNotice({ kind: "error", text: "Antwort konnte nicht gesendet werden." });
    }
  });

  const handleServerMessage = useEffectEvent((rawMessage: string) => {
    const parsedEnvelope = parseServerToClientEnvelope(rawMessage);

    if (!parsedEnvelope.success) {
      setNotice({
        kind: "error",
        text: "Server hat eine ungültige Nachricht gesendet.",
      });
      return;
    }

    switch (parsedEnvelope.data.event) {
      case EVENTS.CONNECTION_ACK: {
        reconnectAttemptRef.current = 0;
        intentionalReconnectRef.current = false;
        setConnectionState("connected");

        if (playerSessionRef.current) {
          setNotice({
            kind: "info",
            text: "Spielersitzung wird wiederhergestellt…",
          });

          sendClientEvent(EVENTS.CONNECTION_RESUME, {
            roomId: playerSessionRef.current.roomId,
            sessionId: playerSessionRef.current.sessionId,
          });
        }

        return;
      }

      case EVENTS.PLAYER_JOINED: {
        const joinAttempt = lastJoinAttemptRef.current;

        if (!joinAttempt) {
          setNotice({
            kind: "error",
            text: "Join-Antwort ohne aktiven Join-Versuch erhalten.",
          });
          return;
        }

        const session: PlayerStoredSession = {
          roomId: parsedEnvelope.data.payload.roomId,
          sessionId: parsedEnvelope.data.payload.sessionId,
          playerId: parsedEnvelope.data.payload.playerId,
          playerName: joinAttempt.playerName,
          joinCode: joinAttempt.joinCode,
        };

        updateStoredSession(session);
        setRoomId(parsedEnvelope.data.payload.roomId);
        setJoinCode(joinAttempt.joinCode);
        setPlayerName(joinAttempt.playerName);
        setIsJoining(false);
        setScreen("lobby");
        setNotice({
          kind: "info",
          text: "Beigetreten. Warte auf weitere Spieler und den Host.",
        });
        return;
      }

      case EVENTS.CONNECTION_RESUMED: {
        if (parsedEnvelope.data.payload.role !== "player") {
          return;
        }

        const resumedPayload = parsedEnvelope.data.payload as ConnectionResumedPayload;
        const currentSession = playerSessionRef.current;
        const resumedPlayerName = currentSession?.playerName ?? normalizePlayerName(playerName);

        const session: PlayerStoredSession = {
          roomId: resumedPayload.roomId,
          sessionId: resumedPayload.sessionId,
          playerId: resumedPayload.playerId ?? currentSession?.playerId ?? "",
          playerName: resumedPlayerName,
          joinCode: resumedPayload.joinCode,
        };

        resumedAnswerOptionIdRef.current =
          resumedPayload.currentAnswer?.type === "option"
            ? resumedPayload.currentAnswer.value
            : null;

        updateStoredSession(session);
        setRoomId(resumedPayload.roomId);
        setJoinCode(resumedPayload.joinCode);
        setPlayerName(resumedPlayerName);
        setNotice({
          kind: "info",
          text:
            resumedPayload.roomState === "waiting"
              ? "Sitzung wiederhergestellt."
              : "Sitzung wiederhergestellt. Spielstatus wird synchronisiert…",
        });

        if (resumedPayload.roomState === "waiting") {
          setScreen("lobby");
        } else {
          const gs = resumedPayload.gameState;
          if (gs === GameState.Revealing) setScreen("reveal");
          else if (gs === GameState.Scoreboard) setScreen("scoreboard");
          else if (gs === GameState.Completed) setScreen("finished");
          else setScreen("question");
        }
        return;
      }

      case EVENTS.LOBBY_UPDATE: {
        setLobby(parsedEnvelope.data.payload);
        setRoomId(parsedEnvelope.data.payload.roomId);
        return;
      }

      case EVENTS.GAME_STARTED: {
        setNotice({ kind: "info", text: "Spiel gestartet!" });
        return;
      }

      case EVENTS.QUESTION_SHOW: {
        const resumedOptionId = resumedAnswerOptionIdRef.current;

        setQuestion(parsedEnvelope.data.payload);
        setRemainingMs(parsedEnvelope.data.payload.durationMs);
        setSelectedOptionId(resumedOptionId);
        setAnswerStatus(resumedOptionId ? "accepted" : "idle");
        setCorrectAnswer(null);
        setScoreboard(null);
        setScreen("question");
        setNotice(null);
        resumedAnswerOptionIdRef.current = null;
        return;
      }

      case EVENTS.QUESTION_TIMER: {
        setRemainingMs(parsedEnvelope.data.payload.remainingMs);
        return;
      }

      case EVENTS.ANSWER_ACCEPTED: {
        setAnswerStatus("accepted");
        setNotice(null);
        return;
      }

      case EVENTS.ANSWER_REJECTED: {
        setAnswerStatus("rejected");
        setNotice({ kind: "error", text: "Antwort abgelehnt." });
        return;
      }

      case EVENTS.QUESTION_CLOSE: {
        setRemainingMs(0);
        setAnswerStatus((current) =>
          current === "idle" || current === "submitting" ? "locked" : current,
        );
        return;
      }

      case EVENTS.QUESTION_REVEAL: {
        setCorrectAnswer(parsedEnvelope.data.payload.correctAnswer);
        setScreen("reveal");
        return;
      }

      case EVENTS.SCORE_UPDATE: {
        setScoreboard(parsedEnvelope.data.payload);
        setScreen("scoreboard");
        return;
      }

      case EVENTS.GAME_FINISHED: {
        setFinalResult(parsedEnvelope.data.payload);
        setScreen("finished");
        return;
      }

      case EVENTS.ROOM_CLOSED: {
        updateStoredSession(null);
        resetToJoin();
        setNotice({
          kind: "info",
          text: "Der Raum wurde geschlossen.",
        });
        return;
      }

      case EVENTS.ERROR_PROTOCOL: {
        setIsJoining(false);

        if (
          parsedEnvelope.data.payload.context.event === EVENTS.CONNECTION_RESUME &&
          (parsedEnvelope.data.payload.code === PROTOCOL_ERROR_CODES.SESSION_NOT_FOUND ||
            parsedEnvelope.data.payload.code === PROTOCOL_ERROR_CODES.ROOM_NOT_FOUND ||
            parsedEnvelope.data.payload.code === PROTOCOL_ERROR_CODES.ROOM_CLOSED)
        ) {
          updateStoredSession(null);
          resetToJoin();
          setNotice({
            kind: "error",
            text: "Gespeicherte Spielersitzung ist nicht mehr verfügbar. Bitte erneut beitreten.",
          });
          return;
        }

        setNotice({
          kind: "error",
          text: parsedEnvelope.data.payload.message,
        });
        return;
      }

      default:
        return;
    }
  });

  const connectSocket = useEffectEvent(() => {
    clearReconnectTimer();

    const socket = new WebSocket(getServerSocketUrl());
    socketRef.current = socket;
    setConnectionState(playerSessionRef.current || roomId ? "reconnecting" : "connecting");

    socket.addEventListener("message", (event) => {
      if (socketRef.current !== socket) {
        return;
      }

      handleServerMessage(event.data as string);
    });

    socket.addEventListener("close", () => {
      if (socketRef.current !== socket) {
        return;
      }

      socketRef.current = null;
      setConnectionState("reconnecting");

      if (!intentionalReconnectRef.current && (playerSessionRef.current || roomId)) {
        setNotice({
          kind: "info",
          text: "Verbindung verloren. Wiederverbinden läuft…",
        });
      }

      scheduleReconnect();
    });

    socket.addEventListener("error", () => {
      if (socketRef.current !== socket) {
        return;
      }

      setNotice({
        kind: "error",
        text: "Serververbindung gestört. Neuer Verbindungsversuch läuft…",
      });
    });
  });

  useEffect(() => {
    connectSocket();

    return () => {
      shouldReconnectRef.current = false;
      clearReconnectTimer();
      const socket = socketRef.current;
      socketRef.current = null;
      socket?.close();
    };
  }, []);

  const reconnectAsFreshPlayer = useEffectEvent((noticeText: string) => {
    intentionalReconnectRef.current = true;
    reconnectAttemptRef.current = 0;
    updateStoredSession(null);
    resetToJoin();
    setNotice({
      kind: "info",
      text: noticeText,
    });

    const socket = socketRef.current;

    if (socket && socket.readyState !== WebSocket.CLOSED) {
      socket.close(1000, "Reset player session");
      return;
    }

    connectSocket();
  });

  const handleJoin = useEffectEvent(() => {
    const normalizedJoinCode = normalizeJoinCode(joinCode);
    const normalizedPlayerName = normalizePlayerName(playerName);

    setJoinCode(normalizedJoinCode);
    setPlayerName(normalizedPlayerName);
    setNotice(null);
    setIsJoining(true);

    lastJoinAttemptRef.current = {
      joinCode: normalizedJoinCode,
      playerName: normalizedPlayerName,
    };

    const didSend = sendClientEvent(EVENTS.ROOM_JOIN, {
      joinCode: normalizedJoinCode,
      playerName: normalizedPlayerName,
      sessionId: null,
    });

    if (!didSend) {
      setIsJoining(false);
      setNotice({
        kind: "error",
        text: "Server ist gerade nicht erreichbar.",
      });
    }
  });

  const playerSession = playerSessionRef.current;
  const ownPlayerId = playerSession?.playerId ?? "";
  const ownPlayerName = playerSession?.playerName ?? normalizePlayerName(playerName);
  const timerSeconds = Math.ceil((remainingMs ?? 0) / 1000);
  const revealedOptionLabel =
    question && correctAnswer
      ? (question.options.find((option) => option.id === correctAnswer.value)?.label ??
        correctAnswer.value)
      : null;
  const ownScoreboardPlacement = scoreboard
    ? scoreboard.scoreboard.findIndex((entry) => entry.playerId === ownPlayerId)
    : -1;
  const ownScoreboardEntry =
    ownScoreboardPlacement >= 0 && scoreboard
      ? scoreboard.scoreboard[ownScoreboardPlacement]
      : null;
  const ownFinalPlacement = finalResult
    ? finalResult.finalScoreboard.findIndex((entry) => entry.playerId === ownPlayerId)
    : -1;

  return (
    <main className="player-shell" data-screen={screen}>
      <section className="player-card" data-screen={screen}>
        {screen === "join" && (
          <>
            <header className="player-header">
              <span className="player-kicker">Player</span>
              <h1 className="player-title">Raum beitreten</h1>
              <p className="player-text">
                Code eingeben, Namen setzen und dann bleibt das Handy reine Antwort- und
                Statusoberfläche.
              </p>
              <div className="player-status" data-state={connectionState}>
                {getConnectionLabel(connectionState)}
              </div>
            </header>

            {notice ? (
              <div className="player-notice" data-kind={notice.kind}>
                {notice.text}
              </div>
            ) : null}

            <div className="player-chip-row">
              <span className="player-chip">mobil</span>
              <span className="player-chip">eine Antwort pro Runde</span>
              <span className="player-chip">direktes Feedback</span>
            </div>

            <div className="player-form">
              <label className="player-field">
                <span className="player-label">Raumcode</span>
                <input
                  autoCapitalize="characters"
                  autoCorrect="off"
                  className="player-input"
                  inputMode="text"
                  maxLength={6}
                  onChange={(event) => {
                    setJoinCode(normalizeJoinCode(event.target.value));
                  }}
                  placeholder="ABC234"
                  value={joinCode}
                />
              </label>

              <label className="player-field">
                <span className="player-label">Dein Name</span>
                <input
                  autoCapitalize="words"
                  autoCorrect="off"
                  className="player-input"
                  maxLength={30}
                  onChange={(event) => {
                    setPlayerName(event.target.value);
                  }}
                  placeholder="Name eingeben"
                  value={playerName}
                />
              </label>
            </div>

            <div className="player-actions">
              <button
                className="player-primary-button"
                disabled={
                  connectionState !== "connected" ||
                  isJoining ||
                  joinCode.length !== 6 ||
                  normalizePlayerName(playerName).length === 0
                }
                onClick={handleJoin}
                type="button"
              >
                {isJoining ? "Trete bei…" : "Jetzt beitreten"}
              </button>

              <button
                className="player-secondary-button"
                disabled={!playerSession}
                onClick={() => {
                  reconnectAsFreshPlayer("Gespeicherte Spielersitzung wurde geloescht.");
                }}
                type="button"
              >
                Gespeicherte Session löschen
              </button>
            </div>
          </>
        )}

        {screen === "lobby" && (
          <>
            <header className="player-header">
              <span className="player-kicker">Lobby</span>
              <h1 className="player-title">{ownPlayerName || "Spieler"}</h1>
              <p className="player-text">
                Bereit zum Start. Sobald der Host loslegt, kippt diese Ansicht direkt in die Frage.
              </p>
              <div className="player-status" data-state={connectionState}>
                {getConnectionLabel(connectionState)}
              </div>
            </header>

            {notice ? (
              <div className="player-notice" data-kind={notice.kind}>
                {notice.text}
              </div>
            ) : null}

            <div className="player-spotlight">
              <p className="player-spotlight-label">Raumcode</p>
              <p className="player-room-code">{joinCode || playerSession?.joinCode || "------"}</p>
              <p className="player-spotlight-text">
                Im gleichen WLAN bleiben und auf den Start warten.
              </p>
            </div>

            <div className="player-metrics">
              <div className="player-metric">
                <p className="player-metric-label">Spieler in der Lobby</p>
                <p className="player-metric-value">{lobby?.playerCount ?? 0}</p>
              </div>

              <div className="player-metric">
                <p className="player-metric-label">Host</p>
                <p className="player-metric-value">
                  {lobby?.hostConnected ? "online" : "getrennt"}
                </p>
              </div>
            </div>

            <div className="player-list">
              {lobby && lobby.players.length > 0 ? (
                lobby.players.map((player) => (
                  <article
                    className="player-list-item"
                    data-self={player.playerId === ownPlayerId}
                    key={player.playerId}
                  >
                    <div className="player-list-meta">
                      <strong>{player.name}</strong>
                      <p>{player.score} Punkte</p>
                    </div>

                    <span className="player-list-state" data-connected={player.connected}>
                      {player.connected ? "verbunden" : "getrennt"}
                    </span>
                  </article>
                ))
              ) : (
                <div className="player-empty">
                  Lobby wird aufgebaut. Sobald der Server den Snapshot sendet, erscheint hier die
                  Spielerliste.
                </div>
              )}
            </div>

            <button
              className="player-secondary-button"
              onClick={() => {
                reconnectAsFreshPlayer("Lokale Spielersitzung wurde geloescht.");
              }}
              type="button"
            >
              Lokale Session löschen
            </button>
          </>
        )}

        {screen === "question" && question && (
          <>
            <header className="player-header">
              <div className="player-stage-top">
                <div className="player-stage-copy">
                  <span className="player-kicker">Frage {question.questionIndex + 1}</span>
                  <h1 className="player-stage-title">Jetzt antworten</h1>
                  <p className="player-text">
                    Wähle genau eine Antwort. Danach ist deine Runde gesperrt.
                  </p>
                </div>
                <div
                  className="player-timer-shell"
                  data-urgent={timerSeconds <= 5 ? "true" : undefined}
                >
                  <span className="player-timer-label">Restzeit</span>
                  <div className="player-timer">{timerSeconds}s</div>
                </div>
              </div>
              <div className="player-status" data-state={connectionState}>
                {getConnectionLabel(connectionState)}
              </div>
            </header>

            {answerStatus === "rejected" && notice ? (
              <div className="player-notice" data-kind="error">
                {notice.text}
              </div>
            ) : null}

            <p className="player-question-text">{question.text}</p>

            {answerStatus === "accepted" ? (
              <div className="player-answer-status" data-state="accepted">
                Antwort gesendet
              </div>
            ) : answerStatus === "locked" ? (
              <div className="player-answer-status" data-state="locked">
                Zeit abgelaufen
              </div>
            ) : null}

            <div className="player-options-grid">
              {question.options.map((option) => {
                const isSelected = selectedOptionId === option.id;
                const isDisabled = answerStatus !== "idle";

                return (
                  <button
                    className="player-option-button"
                    data-state={isSelected ? "selected" : isDisabled ? "disabled" : "idle"}
                    disabled={isDisabled}
                    key={option.id}
                    onClick={() => handleSubmitAnswer(option.id)}
                    type="button"
                  >
                    <span className="player-option-id">{option.id}</span>
                    <span className="player-option-label">{option.label}</span>
                  </button>
                );
              })}
            </div>

            {answerStatus === "idle" ? (
              <p className="player-helper-text">Tippe auf eine Antwort, bevor der Timer abläuft.</p>
            ) : null}
          </>
        )}

        {screen === "reveal" && question && (
          <>
            <header className="player-header">
              <div className="player-stage-copy">
                <span className="player-kicker">Auflösung</span>
                <h1 className="player-stage-title">Das war die richtige Antwort</h1>
                {revealedOptionLabel ? (
                  <p className="player-text">Richtig war: {revealedOptionLabel}</p>
                ) : null}
              </div>
              <div className="player-status" data-state={connectionState}>
                {getConnectionLabel(connectionState)}
              </div>
            </header>

            <p className="player-question-text">{question.text}</p>

            <div className="player-options-grid">
              {question.options.map((option) => {
                const isCorrect = correctAnswer?.value === option.id;
                const wasSelected = selectedOptionId === option.id;
                const isWrong = wasSelected && !isCorrect;

                return (
                  <div
                    className="player-option-card"
                    data-state={isCorrect ? "correct" : isWrong ? "wrong" : "dimmed"}
                    key={option.id}
                  >
                    <span className="player-option-id">{option.id}</span>
                    <span className="player-option-label">{option.label}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {screen === "scoreboard" && scoreboard && (
          <>
            <header className="player-header">
              <div className="player-stage-copy">
                <span className="player-kicker">Rangliste</span>
                <h1 className="player-stage-title">Zwischenstand</h1>
                <p className="player-text">Der Host schaltet gleich die nächste Frage frei.</p>
              </div>
              <div className="player-status" data-state={connectionState}>
                {getConnectionLabel(connectionState)}
              </div>
            </header>

            {ownScoreboardEntry ? (
              <div className="player-highlight-card">
                <p className="player-highlight-label">Dein Zwischenstand</p>
                <div className="player-highlight-values">
                  <span className="player-highlight-rank">{ownScoreboardPlacement + 1}. Platz</span>
                  <span className="player-highlight-score">{ownScoreboardEntry.score} Punkte</span>
                </div>
              </div>
            ) : null}

            <div className="player-scoreboard-list">
              {scoreboard.scoreboard.map((entry, index) => (
                <article
                  className="player-scoreboard-item"
                  data-placement={index < 3 ? String(index + 1) : undefined}
                  data-self={entry.playerId === ownPlayerId}
                  key={entry.playerId}
                >
                  <span className="player-scoreboard-rank">{index + 1}.</span>
                  <span className="player-scoreboard-name">{entry.name}</span>
                  <span className="player-scoreboard-score">{entry.score} Punkte</span>
                </article>
              ))}
            </div>

            <p className="player-helper-text player-helper-text--center">
              Warte auf nächste Frage…
            </p>
          </>
        )}

        {screen === "finished" && finalResult && (
          <>
            <header className="player-header">
              <div className="player-stage-copy">
                <span className="player-kicker">Spiel beendet</span>
                <h1 className="player-title">Endergebnis</h1>
                <p className="player-text">
                  {ownFinalPlacement >= 0
                    ? `Du landest auf Platz ${ownFinalPlacement + 1}.`
                    : "Danke fürs Mitspielen."}
                </p>
              </div>
              <div className="player-status" data-state={connectionState}>
                {getConnectionLabel(connectionState)}
              </div>
            </header>

            <div className="player-scoreboard-list">
              {finalResult.finalScoreboard.map((entry, index) => {
                const isSelf = entry.playerId === ownPlayerId;
                const placement = index + 1;

                return (
                  <article
                    className="player-scoreboard-item"
                    data-placement={index < 3 ? String(index + 1) : undefined}
                    data-self={isSelf}
                    key={entry.playerId}
                  >
                    <span className="player-scoreboard-rank">
                      {isSelf && placement === 1 ? "🏆 " : ""}
                      {placement}.
                    </span>
                    <span className="player-scoreboard-name">{entry.name}</span>
                    <span className="player-scoreboard-score">{entry.score} Punkte</span>
                  </article>
                );
              })}
            </div>

            <button
              className="player-primary-button"
              onClick={() => {
                reconnectAsFreshPlayer("Neue Runde vorbereiten. Bitte Raumcode erneut eingeben.");
              }}
              type="button"
            >
              Neues Spiel
            </button>
          </>
        )}
      </section>
    </main>
  );
}

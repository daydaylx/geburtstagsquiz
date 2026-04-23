import { useEffect, useEffectEvent, useRef, useState } from "react";
import QRCode from "qrcode";

import {
  EVENTS,
  PROTOCOL_ERROR_CODES,
  parseServerToClientEnvelope,
  serializeEnvelope,
  type ClientToServerEventPayloadMap,
  type LobbyUpdatePayload,
  type QuestionShowPayload,
  type QuestionRevealPayload,
  type ScoreUpdatePayload,
  type GameFinishedPayload,
  type AnswerProgressPayload,
} from "@quiz/shared-protocol";
import { GameState, type ScoreboardEntry } from "@quiz/shared-types";
import { isLoopbackHostname, getReconnectDelay, getWebSocketProtocol } from "@quiz/shared-utils";

import {
  clearHostStoredSession,
  loadHostStoredSession,
  saveHostStoredSession,
  type HostStoredSession,
} from "./storage.js";

type ConnectionState = "connecting" | "connected" | "reconnecting";

interface HostRoomInfo {
  roomId: string;
  joinCode: string;
}

interface HostNotice {
  kind: "info" | "error";
  text: string;
}

type HostScreen = "start" | "lobby" | "question" | "reveal" | "scoreboard" | "finished";

function getServerSocketUrl(): string {
  const url = new URL(window.location.href);
  url.protocol = getWebSocketProtocol(window.location.protocol);
  url.port = "3001";
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function getPlayerJoinUrl(joinCode: string): string {
  const url = new URL(window.location.href);
  url.port = "5174";
  url.pathname = "/";
  url.search = new URLSearchParams({ joinCode }).toString();
  url.hash = "";
  return url.toString();
}

function getConnectionLabel(connectionState: ConnectionState): string {
  switch (connectionState) {
    case "connecting":
      return "Verbinde mit Server…";
    case "reconnecting":
      return "Verbinde neu…";
    case "connected":
      return "Server verbunden";
    default:
      return "Verbindung unbekannt";
  }
}

function createHostClientInfo() {
  return {
    deviceType: "browser",
    appVersion: "0.0.1",
  };
}

export function App() {
  const initialSession = loadHostStoredSession();

  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [notice, setNotice] = useState<HostNotice | null>(
    initialSession
      ? {
          kind: "info",
          text: "Gespeicherte Host-Sitzung wird wiederhergestellt…",
        }
      : null,
  );
  const [roomInfo, setRoomInfo] = useState<HostRoomInfo | null>(null);
  const [lobby, setLobby] = useState<LobbyUpdatePayload | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);

  const [screen, setScreen] = useState<HostScreen>("start");
  const [question, setQuestion] = useState<QuestionShowPayload | null>(null);
  const [remainingMs, setRemainingMs] = useState<number>(0);
  const [answerProgress, setAnswerProgress] = useState<AnswerProgressPayload | null>(null);
  const [revealedAnswer, setRevealedAnswer] = useState<QuestionRevealPayload["correctAnswer"] | null>(null);
  const [scoreboard, setScoreboard] = useState<ScoreUpdatePayload | null>(null);
  const [finalResult, setFinalResult] = useState<GameFinishedPayload | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const hostSessionRef = useRef<HostStoredSession | null>(initialSession);
  const shouldReconnectRef = useRef(true);
  const pendingCreateRoomRef = useRef(false);
  const intentionalReconnectRef = useRef(false);

  const clearReconnectTimer = useEffectEvent(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  });

  const updateStoredSession = useEffectEvent((session: HostStoredSession | null) => {
    hostSessionRef.current = session;

    if (session) {
      saveHostStoredSession(session);
      return;
    }

    clearHostStoredSession();
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

  const resetLobbyState = useEffectEvent(() => {
    setRoomInfo(null);
    setLobby(null);
    setQrCodeDataUrl(null);
    setIsCreatingRoom(false);
    setScreen("start");
    setQuestion(null);
    setRemainingMs(0);
    setAnswerProgress(null);
    setRevealedAnswer(null);
    setScoreboard(null);
    setFinalResult(null);
  });

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

        if (pendingCreateRoomRef.current && !hostSessionRef.current) {
          setNotice({
            kind: "info",
            text: "Neuer Raum wird erstellt…",
          });
          setIsCreatingRoom(true);

          const didSend = sendClientEvent(EVENTS.ROOM_CREATE, {
            hostName: "Host",
            clientInfo: createHostClientInfo(),
          });

          if (didSend) {
            pendingCreateRoomRef.current = false;
            return;
          }

          setIsCreatingRoom(false);
          setNotice({
            kind: "error",
            text: "Neuer Raum konnte nicht erstellt werden.",
          });
          return;
        }

        if (hostSessionRef.current) {
          setNotice({
            kind: "info",
            text: "Host-Sitzung wird wiederhergestellt…",
          });

          sendClientEvent(EVENTS.CONNECTION_RESUME, {
            roomId: hostSessionRef.current.roomId,
            sessionId: hostSessionRef.current.sessionId,
          });
        }

        return;
      }

      case EVENTS.ROOM_CREATED: {
        pendingCreateRoomRef.current = false;
        const session = {
          roomId: parsedEnvelope.data.payload.roomId,
          sessionId: parsedEnvelope.data.payload.hostSessionId,
        } satisfies HostStoredSession;

        updateStoredSession(session);
        setRoomInfo({
          roomId: parsedEnvelope.data.payload.roomId,
          joinCode: parsedEnvelope.data.payload.joinCode,
        });
        setScreen("lobby");
        setNotice({
          kind: "info",
          text: "Raum erstellt. Spieler können jetzt per Code oder QR beitreten.",
        });
        setIsCreatingRoom(false);
        return;
      }

      case EVENTS.CONNECTION_RESUMED: {
        if (parsedEnvelope.data.payload.role !== "host") {
          return;
        }

        updateStoredSession({
          roomId: parsedEnvelope.data.payload.roomId,
          sessionId: parsedEnvelope.data.payload.sessionId,
        });
        setRoomInfo({
          roomId: parsedEnvelope.data.payload.roomId,
          joinCode: parsedEnvelope.data.payload.joinCode,
        });
        setNotice({
          kind: "info",
          text:
            parsedEnvelope.data.payload.roomState === "waiting"
              ? "Host-Sitzung wiederhergestellt."
              : "Host-Sitzung wiederhergestellt. Spielstatus wird synchronisiert…",
        });

        if (parsedEnvelope.data.payload.roomState === "waiting") {
          setScreen("lobby");
        }
        return;
      }

      case EVENTS.LOBBY_UPDATE: {
        setLobby(parsedEnvelope.data.payload);
        return;
      }

      case EVENTS.GAME_STARTED: {
        setScreen("question");
        setNotice({ kind: "info", text: "Spiel gestartet!" });
        return;
      }

      case EVENTS.QUESTION_SHOW: {
        setQuestion(parsedEnvelope.data.payload);
        setRemainingMs(parsedEnvelope.data.payload.durationMs);
        setAnswerProgress(null);
        setRevealedAnswer(null);
        setScreen("question");
        setNotice(null);
        return;
      }

      case EVENTS.QUESTION_TIMER: {
        setRemainingMs(parsedEnvelope.data.payload.remainingMs);
        return;
      }

      case EVENTS.ANSWER_PROGRESS: {
        setAnswerProgress(parsedEnvelope.data.payload);
        return;
      }

      case EVENTS.QUESTION_CLOSE: {
        setRemainingMs(0);
        return;
      }

      case EVENTS.QUESTION_REVEAL: {
        setRevealedAnswer(parsedEnvelope.data.payload.correctAnswer);
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
        const shouldCreateNewRoom = pendingCreateRoomRef.current;
        updateStoredSession(null);
        resetLobbyState();
        setNotice({
          kind: "info",
          text: shouldCreateNewRoom
            ? "Raum geschlossen. Neuer Raum wird vorbereitet…"
            : "Der Raum wurde geschlossen.",
        });
        return;
      }

      case EVENTS.ERROR_PROTOCOL: {
        setIsCreatingRoom(false);

        if (
          parsedEnvelope.data.payload.context.event === EVENTS.CONNECTION_RESUME &&
          (parsedEnvelope.data.payload.code === PROTOCOL_ERROR_CODES.SESSION_NOT_FOUND ||
            parsedEnvelope.data.payload.code === PROTOCOL_ERROR_CODES.ROOM_NOT_FOUND ||
            parsedEnvelope.data.payload.code === PROTOCOL_ERROR_CODES.ROOM_CLOSED)
        ) {
          updateStoredSession(null);
          resetLobbyState();
          setNotice({
            kind: "error",
            text: "Gespeicherte Host-Sitzung ist nicht mehr verfügbar. Bitte Raum neu erstellen.",
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
    setConnectionState(
      hostSessionRef.current || roomInfo || pendingCreateRoomRef.current ? "reconnecting" : "connecting",
    );

    socket.addEventListener("message", (event) => {
      if (socketRef.current !== socket) {
        return;
      }

      handleServerMessage(event.data as string);
    });

    socket.addEventListener("close", () => {
      if (socketRef.current === socket) {
        socketRef.current = null;
      }

      setConnectionState("reconnecting");

      if (!intentionalReconnectRef.current && (hostSessionRef.current || roomInfo || pendingCreateRoomRef.current)) {
        setNotice({
          kind: "info",
          text: "Verbindung verloren. Host-Sitzung wird erneut verbunden…",
        });
      }

      scheduleReconnect();
    });

    socket.addEventListener("error", () => {
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
      socketRef.current?.close();
    };
  }, [clearReconnectTimer, connectSocket]);

  const reconnectAsFreshHost = useEffectEvent((noticeText: string) => {
    intentionalReconnectRef.current = true;
    reconnectAttemptRef.current = 0;
    updateStoredSession(null);
    resetLobbyState();
    setNotice({
      kind: "info",
      text: noticeText,
    });

    const socket = socketRef.current;

    if (socket && socket.readyState !== WebSocket.CLOSED) {
      socket.close(1000, "Reset host session");
      return;
    }

    connectSocket();
  });

  useEffect(() => {
    const joinCode = roomInfo?.joinCode;
    const loopback = isLoopbackHostname(window.location.hostname);

    if (!joinCode || loopback) {
      setQrCodeDataUrl(null);
      return;
    }

    let cancelled = false;

    QRCode.toDataURL(getPlayerJoinUrl(joinCode), {
      margin: 1,
      width: 280,
      color: {
        dark: "#102033",
        light: "#fffdf8",
      },
    })
      .then((dataUrl) => {
        if (!cancelled) {
          setQrCodeDataUrl(dataUrl);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQrCodeDataUrl(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [roomInfo?.joinCode]);

  const handleCreateRoom = useEffectEvent(() => {
    const activeRoomId = roomInfo?.roomId ?? hostSessionRef.current?.roomId ?? null;

    if (activeRoomId) {
      pendingCreateRoomRef.current = true;
      intentionalReconnectRef.current = true;
      setNotice({
        kind: "info",
        text: "Aktueller Raum wird geschlossen. Neuer Raum wird vorbereitet…",
      });

      const didSendClose = sendClientEvent(EVENTS.ROOM_CLOSE, {
        roomId: activeRoomId,
      });

      if (didSendClose) {
        return;
      }

      reconnectAsFreshHost("Host-Verbindung wird zurueckgesetzt. Neuer Raum folgt gleich.");
      return;
    }

    pendingCreateRoomRef.current = false;
    updateStoredSession(null);
    resetLobbyState();
    setNotice(null);
    setIsCreatingRoom(true);

    const didSend = sendClientEvent(EVENTS.ROOM_CREATE, {
      hostName: "Host",
      clientInfo: createHostClientInfo(),
    });

    if (!didSend) {
      setIsCreatingRoom(false);
      setNotice({
        kind: "error",
        text: "Server ist gerade nicht erreichbar.",
      });
    }
  });

  const handleStartGame = useEffectEvent(() => {
    if (!roomInfo) return;
    sendClientEvent(EVENTS.GAME_START, { roomId: roomInfo.roomId });
  });

  const handleNextQuestion = useEffectEvent(() => {
    if (!roomInfo) return;
    sendClientEvent(EVENTS.GAME_NEXT_QUESTION, { roomId: roomInfo.roomId });
  });

  const loopback = isLoopbackHostname(window.location.hostname);
  const joinUrl = roomInfo?.joinCode ? getPlayerJoinUrl(roomInfo.joinCode) : "";
  const canCreateRoom = connectionState === "connected" && !isCreatingRoom;
  const connectedPlayerCount = lobby?.players.filter((p) => p.connected).length ?? 0;
  const timerSeconds = Math.ceil((remainingMs ?? 0) / 1000);
  const progressPercent =
    answerProgress && answerProgress.totalEligiblePlayers > 0
      ? (answerProgress.answeredCount / answerProgress.totalEligiblePlayers) * 100
      : 0;
  const revealedOptionLabel =
    question && revealedAnswer
      ? question.options.find((option) => option.id === revealedAnswer.value)?.label ??
        revealedAnswer.value
      : null;
  const winningEntry = finalResult?.finalScoreboard[0] ?? null;

  return (
    <main className="host-shell" data-screen={screen}>
      <div className="host-header">
        <div className="host-brand">
          <span className="host-flag">Geburtstagsabend live</span>
          <h1 className="host-title">Quiz Dual Screen</h1>
          <p className="host-subtitle">
            Ein gemeinsamer Screen führt durch den Abend, die Handys antworten live.
          </p>
        </div>

        <div className="host-status" data-state={connectionState}>
          {getConnectionLabel(connectionState)}
        </div>
      </div>

      {notice ? (
        <div className="host-notice host-panel" data-kind={notice.kind}>
          {notice.text}
        </div>
      ) : null}

      {screen === "start" && !roomInfo && (
        <section className="host-start host-panel">
          <div className="host-start-copy">
            <p className="host-kicker">Host Setup</p>
            <h2 className="host-copy-title">Ein Code. Ein Screen. Dann kann der Abend starten.</h2>
            <p className="host-copy-text">
              Raum erstellen, Join-Code groß zeigen und danach nur noch durch Fragen, Auflösung
              und Rangliste führen.
            </p>
            <div className="host-chip-row">
              <span className="host-chip">1 Host</span>
              <span className="host-chip">mehrere Handys</span>
              <span className="host-chip">ein gemeinsamer Bildschirm</span>
            </div>

            <div className="host-actions">
              <button
                className="host-primary-button"
                disabled={!canCreateRoom}
                onClick={handleCreateRoom}
                type="button"
              >
                {isCreatingRoom ? "Raum wird erstellt…" : "Neues Spiel erstellen"}
              </button>

              <button
                className="host-secondary-button"
                disabled={connectionState !== "connected"}
                onClick={() => {
                  pendingCreateRoomRef.current = false;
                  reconnectAsFreshHost("Gespeicherte Host-Sitzung wurde geloescht.");
                }}
                type="button"
              >
                Lokale Session löschen
              </button>
            </div>
          </div>

          <aside className="host-note-card">
            <p className="host-note-label">Vor dem Start</p>
            <h2>Handys nur über das gleiche WLAN holen.</h2>
            <p>
              Für echte Handys im selben WLAN die Host-Seite nicht über `localhost`, sondern über
              die LAN-IP oder einen lokalen Hostnamen öffnen. Dann zeigt der QR-Code direkt auf die
              Player-App im selben Netz.
            </p>
          </aside>
        </section>
      )}

      {screen === "lobby" && roomInfo && (
        <section className="host-lobby host-layout">
          <aside className="host-panel host-lobby-aside">
            <div className="host-panel-top">
              <p className="host-kicker">Lobby</p>
              <div className="host-ready-pill">{connectedPlayerCount} bereit</div>
            </div>
            <h2 className="host-main-title">Join-Code</h2>
            <div className="host-join-stage">
              <p className="host-join-code">{roomInfo.joinCode}</p>
              <p className="host-join-caption">
                Den Code gut sichtbar lassen oder direkt per QR einscannen.
              </p>
            </div>

            <div className="host-qr-shell">
              {loopback ? (
                <div className="host-hint">
                  QR für echte Handys ist erst sinnvoll, wenn diese Host-Seite über eine LAN-IP oder
                  einen lokalen Hostnamen geöffnet wurde statt über `localhost`.
                </div>
              ) : (
                <div className="host-qr-card">
                  {qrCodeDataUrl ? <img alt="QR-Code für den Player-Join" src={qrCodeDataUrl} /> : null}
                </div>
              )}

              <div className="host-join-link-card">
                <p className="host-join-link-label">Direktlink</p>
                <div className="host-join-link">{joinUrl}</div>
              </div>
            </div>
          </aside>

          <section className="host-panel host-lobby-main">
            <div className="host-main-top">
              <div>
                <p className="host-section-label">Live</p>
                <h2 className="host-main-title">Warteraum</h2>
                <p className="host-copy-text">
                  {connectedPlayerCount} verbundene Spieler sind bereit. Sobald alle drin sind,
                  startet hier die erste Frage.
                </p>
              </div>

              <button
                className="host-primary-button"
                disabled={connectedPlayerCount === 0}
                onClick={handleStartGame}
                type="button"
              >
                Spiel starten
              </button>
            </div>

            <div className="host-metric-grid">
              <div className="host-metric">
                <p className="host-metric-label">Spieler</p>
                <p className="host-metric-value">{lobby?.playerCount ?? 0}</p>
              </div>

              <div className="host-metric">
                <p className="host-metric-label">Host</p>
                <p className="host-metric-value">{lobby?.hostConnected ? "online" : "offline"}</p>
              </div>

              <div className="host-metric">
                <p className="host-metric-label">Raumstatus</p>
                <p className="host-metric-value">{lobby?.roomState ?? "waiting"}</p>
              </div>
            </div>

            <div className="host-player-list">
              {lobby && lobby.players.length > 0 ? (
                lobby.players.map((player, index) => (
                  <article
                    className="host-player-item"
                    data-connected={player.connected}
                    key={player.playerId}
                  >
                    <div
                      className="host-player-rank"
                      data-placement={index < 3 ? String(index + 1) : undefined}
                    >
                      {String(index + 1).padStart(2, "0")}
                    </div>

                    <div className="host-player-meta">
                      <p className="host-player-name">{player.name}</p>
                      <p className="host-player-score">{player.score} Punkte</p>
                    </div>

                    <div className="host-player-state" data-connected={player.connected}>
                      {player.connected ? "verbunden" : "getrennt"}
                    </div>
                  </article>
                ))
              ) : (
                <div className="host-empty">
                  Noch keine Spieler in der Lobby. Join-Code teilen oder QR auf einen zweiten
                  Bildschirm halten.
                </div>
              )}
            </div>
          </section>
        </section>
      )}

      {screen === "question" && question && (
        <section className="host-game host-panel" data-mode="question">
          <div className="host-game-header">
            <div className="host-stage-copy">
              <p className="host-kicker">Frage {question.questionIndex + 1}</p>
              <p className="host-stage-line">Jetzt antworten die Handys.</p>
            </div>
            <div className="host-timer-shell" data-urgent={timerSeconds <= 5 ? "true" : undefined}>
              <span className="host-timer-label">Restzeit</span>
              <div className="host-timer">{timerSeconds}s</div>
            </div>
          </div>

          <h2 className="host-question-text">{question.text}</h2>

          <div className="host-options-grid">
            {question.options.map((option) => (
              <div className="host-option-card" key={option.id}>
                <span className="host-option-id">{option.id}</span>
                <span className="host-option-label">{option.label}</span>
              </div>
            ))}
          </div>

          {answerProgress && (
            <div className="host-progress-shell">
              <div className="host-progress-meta">
                <span>Antwortfortschritt</span>
                <strong>
                  {answerProgress.answeredCount} / {answerProgress.totalEligiblePlayers} geantwortet
                </strong>
              </div>
              <div className="host-progress-bar">
                <div
                  className="host-progress-fill"
                  style={{
                    width: `${progressPercent}%`,
                  }}
                />
                <span className="host-progress-text">
                  {answerProgress.answeredCount} / {answerProgress.totalEligiblePlayers} geantwortet
                </span>
              </div>
            </div>
          )}
        </section>
      )}

      {screen === "reveal" && question && (
        <section className="host-game host-panel" data-mode="reveal">
          <div className="host-game-header">
            <div className="host-stage-copy">
              <p className="host-kicker">Auflösung</p>
              {revealedOptionLabel ? (
                <p className="host-stage-line">Richtige Antwort: {revealedOptionLabel}</p>
              ) : null}
            </div>
          </div>

          <h2 className="host-question-text">{question.text}</h2>

          <div className="host-options-grid">
            {question.options.map((option) => (
              <div
                className="host-option-card"
                key={option.id}
                data-correct={revealedAnswer?.value === option.id ? "true" : undefined}
              >
                <span className="host-option-id">{option.id}</span>
                <span className="host-option-label">{option.label}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {screen === "scoreboard" && scoreboard && (
        <section className="host-game host-panel" data-mode="scoreboard">
          <div className="host-game-header">
            <div className="host-stage-copy">
              <p className="host-kicker">Rangliste</p>
              <p className="host-stage-line">Zwischenstand nach dieser Frage.</p>
            </div>
          </div>

          <div className="host-scoreboard-list">
            {scoreboard.scoreboard.map((entry, index) => (
              <article
                className="host-scoreboard-item"
                data-placement={index < 3 ? String(index + 1) : undefined}
                key={entry.playerId}
              >
                <span className="host-scoreboard-rank">{index + 1}.</span>
                <span className="host-scoreboard-name">{entry.name}</span>
                <span className="host-scoreboard-score">{entry.score} Punkte</span>
              </article>
            ))}
          </div>

          <div className="host-actions">
            <button className="host-primary-button" onClick={handleNextQuestion} type="button">
              Nächste Frage
            </button>
          </div>
        </section>
      )}

      {screen === "finished" && finalResult && (
        <section className="host-game host-panel" data-mode="finished">
          <div className="host-game-header">
            <div className="host-stage-copy">
              <p className="host-kicker">Spiel beendet</p>
              <h2 className="host-main-title">Endergebnis</h2>
              {winningEntry ? (
                <p className="host-stage-line">{winningEntry.name} führt den Abend an.</p>
              ) : null}
            </div>
          </div>

          <div className="host-scoreboard-list">
            {finalResult.finalScoreboard.map((entry, index) => (
              <article
                className="host-scoreboard-item"
                data-placement={index < 3 ? String(index + 1) : undefined}
                key={entry.playerId}
              >
                <span className="host-scoreboard-rank">{index + 1}.</span>
                <span className="host-scoreboard-name">{entry.name}</span>
                <span className="host-scoreboard-score">{entry.score} Punkte</span>
              </article>
            ))}
          </div>

          <div className="host-actions">
            <button
              className="host-primary-button"
              onClick={handleCreateRoom}
              type="button"
            >
              Neues Spiel
            </button>
          </div>
        </section>
      )}
    </main>
  );
}

import { useEffect, useEffectEvent, useRef, useState } from "react";

import {
  EVENTS,
  PROTOCOL_ERROR_CODES,
  parseServerToClientEnvelope,
  serializeEnvelope,
  type ClientToServerEventPayloadMap,
  type LobbyUpdatePayload,
} from "@quiz/shared-protocol";
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

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const shouldReconnectRef = useRef(true);
  const playerSessionRef = useRef<PlayerStoredSession | null>(initialSession);
  const lastJoinAttemptRef = useRef<JoinAttempt | null>(null);

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

  const clearLobbyContext = useEffectEvent(() => {
    setLobby(null);
    setRoomId(null);
    setIsJoining(false);
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

        const currentSession = playerSessionRef.current;
        const resumedPlayerName = currentSession?.playerName ?? normalizePlayerName(playerName);

        const session: PlayerStoredSession = {
          roomId: parsedEnvelope.data.payload.roomId,
          sessionId: parsedEnvelope.data.payload.sessionId,
          playerId: parsedEnvelope.data.payload.playerId ?? currentSession?.playerId ?? "",
          playerName: resumedPlayerName,
          joinCode: parsedEnvelope.data.payload.joinCode,
        };

        updateStoredSession(session);
        setRoomId(parsedEnvelope.data.payload.roomId);
        setJoinCode(parsedEnvelope.data.payload.joinCode);
        setPlayerName(resumedPlayerName);
        setNotice({
          kind: "info",
          text: "Sitzung wiederhergestellt.",
        });
        return;
      }

      case EVENTS.LOBBY_UPDATE: {
        setLobby(parsedEnvelope.data.payload);
        setRoomId(parsedEnvelope.data.payload.roomId);
        return;
      }

      case EVENTS.ROOM_CLOSED: {
        updateStoredSession(null);
        clearLobbyContext();
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
          clearLobbyContext();
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
      if (socketRef.current === socket) {
        socketRef.current = null;
      }

      setConnectionState("reconnecting");

      if (playerSessionRef.current || roomId) {
        setNotice({
          kind: "info",
          text: "Verbindung verloren. Wiederverbinden läuft…",
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
  const isInLobby = roomId !== null || lobby !== null || playerSession !== null;
  const ownPlayerName = playerSession?.playerName ?? normalizePlayerName(playerName);

  return (
    <main className="player-shell">
      <section className="player-card">
        <header className="player-header">
          <span className="player-kicker">Player</span>
          <h1 className="player-title">{isInLobby ? "Lobby" : "Raum beitreten"}</h1>
          <p className="player-text">
            Handy bleibt reine Eingabe- und Statusoberfläche. Der Server entscheidet, welche Lobby
            wirklich gilt.
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

        {isInLobby ? (
          <>
            <div>
              <p className="player-text">Raumcode</p>
              <p className="player-room-code">{joinCode || playerSession?.joinCode || "------"}</p>
            </div>

            <div className="player-metrics">
              <div className="player-metric">
                <p className="player-metric-label">Dein Name</p>
                <p className="player-metric-value">{ownPlayerName || "Spieler"}</p>
              </div>

              <div className="player-metric">
                <p className="player-metric-label">Spieler in der Lobby</p>
                <p className="player-metric-value">{lobby?.playerCount ?? 0}</p>
              </div>

              <div className="player-metric">
                <p className="player-metric-label">Host</p>
                <p className="player-metric-value">{lobby?.hostConnected ? "online" : "getrennt"}</p>
              </div>
            </div>

            <div className="player-list">
              {lobby && lobby.players.length > 0 ? (
                lobby.players.map((player) => (
                  <article className="player-list-item" key={player.playerId}>
                    <div>
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
                updateStoredSession(null);
                clearLobbyContext();
                setNotice({
                  kind: "info",
                  text: "Lokale Spielersitzung gelöscht.",
                });
              }}
              type="button"
            >
              Lokale Session löschen
            </button>
          </>
        ) : (
          <>
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
                disabled={connectionState !== "connected" || isJoining || joinCode.length !== 6 || normalizePlayerName(playerName).length === 0}
                onClick={handleJoin}
                type="button"
              >
                {isJoining ? "Trete bei…" : "Jetzt beitreten"}
              </button>

              <button
                className="player-secondary-button"
                disabled={!playerSession}
                onClick={() => {
                  updateStoredSession(null);
                  setNotice({
                    kind: "info",
                    text: "Gespeicherte Spielersitzung wurde gelöscht.",
                  });
                }}
                type="button"
              >
                Gespeicherte Session löschen
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

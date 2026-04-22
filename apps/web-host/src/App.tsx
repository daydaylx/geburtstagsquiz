import { useEffect, useEffectEvent, useRef, useState } from "react";
import QRCode from "qrcode";

import {
  EVENTS,
  PROTOCOL_ERROR_CODES,
  parseServerToClientEnvelope,
  serializeEnvelope,
  type ClientToServerEventPayloadMap,
  type LobbyUpdatePayload,
} from "@quiz/shared-protocol";
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

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const hostSessionRef = useRef<HostStoredSession | null>(initialSession);
  const shouldReconnectRef = useRef(true);

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
        setConnectionState("connected");

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
        const session = {
          roomId: parsedEnvelope.data.payload.roomId,
          sessionId: parsedEnvelope.data.payload.hostSessionId,
        } satisfies HostStoredSession;

        updateStoredSession(session);
        setRoomInfo({
          roomId: parsedEnvelope.data.payload.roomId,
          joinCode: parsedEnvelope.data.payload.joinCode,
        });
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
          text: "Host-Sitzung wiederhergestellt.",
        });
        return;
      }

      case EVENTS.LOBBY_UPDATE: {
        setLobby(parsedEnvelope.data.payload);
        return;
      }

      case EVENTS.ROOM_CLOSED: {
        updateStoredSession(null);
        resetLobbyState();
        setNotice({
          kind: "info",
          text: "Der Raum wurde geschlossen.",
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
    setConnectionState(hostSessionRef.current || roomInfo ? "reconnecting" : "connecting");

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

      if (hostSessionRef.current || roomInfo) {
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

  const loopback = isLoopbackHostname(window.location.hostname);
  const joinUrl = roomInfo?.joinCode ? getPlayerJoinUrl(roomInfo.joinCode) : "";
  const canCreateRoom = connectionState === "connected" && !isCreatingRoom;

  return (
    <main className="host-shell">
      <div className="host-header">
        <div>
          <h1 className="host-title">Quiz Dual Screen</h1>
          <p className="host-subtitle">
            Host steuert den Raum, der Server bleibt die Wahrheit, und die Lobby hält alle Geräte
            im selben Zustand.
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

      {roomInfo ? (
        <section className="host-lobby host-layout">
          <aside className="host-panel host-lobby-aside">
            <p className="host-kicker">Lobby</p>
            <h2 className="host-main-title">Join-Code</h2>
            <p className="host-join-code">{roomInfo.joinCode}</p>

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

              <div className="host-join-link">{joinUrl}</div>
            </div>
          </aside>

          <section className="host-panel host-lobby-main">
            <div className="host-main-top">
              <div>
                <h2 className="host-main-title">Warteraum</h2>
                <p className="host-copy-text">
                  Spieler sehen denselben Lobby-Snapshot wie der Host. Der Spielstart bleibt in
                  dieser Phase noch deaktiviert.
                </p>
              </div>

              <button className="host-secondary-button" disabled>
                Spielstart folgt in Phase 2
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
                  <article className="host-player-item" key={player.playerId}>
                    <div className="host-player-rank">{String(index + 1).padStart(2, "0")}</div>

                    <div>
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
      ) : (
        <section className="host-start host-panel">
          <div className="host-start-copy">
            <p className="host-kicker">Host Setup</p>
            <h2 className="host-copy-title">Erst Raum anlegen, dann joinen die Handys.</h2>
            <p className="host-copy-text">
              Diese Phase liefert die stabile Lobby: Raum erstellen, Join-Code anzeigen, QR im LAN
              bereitstellen und Sitzungen bei kurzen Verbindungsabbrüchen sauber wiederherstellen.
            </p>

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
                  updateStoredSession(null);
                  resetLobbyState();
                  setNotice({
                    kind: "info",
                    text: "Gespeicherte Host-Sitzung wurde gelöscht.",
                  });
                }}
                type="button"
              >
                Lokale Session löschen
              </button>
            </div>
          </div>

          <aside className="host-note-card host-panel">
            <h2>LAN-Hinweis</h2>
            <p>
              Für echte Handys im selben WLAN die Host-Seite nicht über `localhost`, sondern über
              die LAN-IP oder einen lokalen Hostnamen öffnen. Dann zeigt der QR-Code direkt auf die
              Player-App im selben Netz.
            </p>
          </aside>
        </section>
      )}
    </main>
  );
}

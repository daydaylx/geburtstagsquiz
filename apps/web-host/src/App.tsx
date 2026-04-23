import { useEffect, useEffectEvent, useRef, useState } from "react";
import QRCode from "qrcode";

import {
  EVENTS,
  PROTOCOL_ERROR_CODES,
  parseServerToClientEnvelope,
  serializeEnvelope,
  type AnswerProgressPayload,
  type ClientToServerEventPayloadMap,
  type GameFinishedPayload,
  type LobbyUpdatePayload,
  type QuestionRevealPayload,
  type QuestionShowPayload,
  type ScoreUpdatePayload,
} from "@quiz/shared-protocol";
import { GameState, RoomState, type ScoreboardEntry } from "@quiz/shared-types";
import { getReconnectDelay, getWebSocketProtocol, isLoopbackHostname } from "@quiz/shared-utils";

import {
  clearHostStoredSession,
  loadHostStoredSession,
  saveHostStoredSession,
  type HostStoredSession,
} from "./storage.js";

type ConnectionState = "connecting" | "connected" | "reconnecting";
type HostScreen = "start" | "lobby" | "question" | "reveal" | "scoreboard" | "finished";
type HostCategoryId = "general" | "birthday" | "personal" | "music" | "fun";

interface HostRoomInfo {
  roomId: string;
  joinCode: string;
}

interface HostNotice {
  kind: "info" | "error";
  text: string;
}

interface HostCategoryOption {
  id: HostCategoryId;
  label: string;
  description: string;
}

interface PrimaryAction {
  label: string;
  description: string;
  disabled: boolean;
  note: string;
  onClick?: () => void;
}

const HOST_CATEGORY_OPTIONS: HostCategoryOption[] = [
  {
    id: "general",
    label: "Allgemein",
    description: "Warme Einstiegsrunde für alle im Raum.",
  },
  {
    id: "birthday",
    label: "Geburtstag",
    description: "Klassische Fragen rund um Feier, Alter und Abend.",
  },
  {
    id: "personal",
    label: "Persönlich",
    description: "Direkte Fragen über das Geburtstagskind.",
  },
  {
    id: "music",
    label: "Musik",
    description: "Songs, Lieblingshits und schnelle Erkennerfragen.",
  },
  {
    id: "fun",
    label: "Spaßfragen",
    description: "Locker, albern und gut für Zwischendurch.",
  },
] as const;

const DEFAULT_SELECTED_CATEGORY_IDS = HOST_CATEGORY_OPTIONS.map((category) => category.id);
const FLOW_STEPS = ["Lobby", "Kategorien", "Frage", "Auflösung", "Endstand"] as const;

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

function getRoomStateLabel(
  roomState: LobbyUpdatePayload["roomState"] | GameFinishedPayload["roomState"] | undefined,
) {
  switch (roomState) {
    case "waiting":
      return "Lobby offen";
    case "in_game":
      return "Quiz läuft";
    case "completed":
      return "Quiz beendet";
    case "closed":
      return "Raum geschlossen";
    case "created":
      return "Raum erstellt";
    default:
      return "Noch kein Raum";
  }
}

function getQuestionPhaseLabel(screen: HostScreen, gameState?: QuestionShowPayload["gameState"]) {
  if (screen === "lobby" || screen === "start") {
    return "Lobby";
  }

  if (screen === "reveal") {
    return "Auflösung";
  }

  if (screen === "scoreboard") {
    return "Zwischenstand";
  }

  if (screen === "finished") {
    return "Endstand";
  }

  switch (gameState) {
    case GameState.AnswerLocked:
      return "Antworten gesperrt";
    case GameState.Revealing:
      return "Auflösung";
    case GameState.Scoreboard:
      return "Zwischenstand";
    case GameState.QuestionActive:
    default:
      return "Frage aktiv";
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
  const [revealedAnswer, setRevealedAnswer] = useState<
    QuestionRevealPayload["correctAnswer"] | null
  >(null);
  const [scoreboard, setScoreboard] = useState<ScoreUpdatePayload | null>(null);
  const [finalResult, setFinalResult] = useState<GameFinishedPayload | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number | null>(null);
  const [totalQuestionCount, setTotalQuestionCount] = useState<number | null>(null);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<HostCategoryId[]>(
    DEFAULT_SELECTED_CATEGORY_IDS,
  );

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
    setCurrentQuestionIndex(null);
    setTotalQuestionCount(null);
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
          setQuestion(null);
          setRemainingMs(0);
          setAnswerProgress(null);
          setRevealedAnswer(null);
          setScoreboard(null);
          setFinalResult(null);
          setCurrentQuestionIndex(null);
          setTotalQuestionCount(null);
          setScreen("lobby");
        } else {
          const gs = parsedEnvelope.data.payload.gameState;
          if (gs === GameState.Revealing) setScreen("reveal");
          else if (gs === GameState.Scoreboard) setScreen("scoreboard");
          else if (gs === GameState.Completed) setScreen("finished");
          else setScreen("question");
        }
        return;
      }

      case EVENTS.LOBBY_UPDATE: {
        setLobby(parsedEnvelope.data.payload);
        return;
      }

      case EVENTS.GAME_STARTED: {
        setQuestion(null);
        setScoreboard(null);
        setFinalResult(null);
        setCurrentQuestionIndex(parsedEnvelope.data.payload.questionIndex);
        setTotalQuestionCount(parsedEnvelope.data.payload.totalQuestionCount);
        setScreen("question");
        setNotice({ kind: "info", text: "Spiel gestartet!" });
        return;
      }

      case EVENTS.QUESTION_SHOW: {
        setQuestion(parsedEnvelope.data.payload);
        setRemainingMs(parsedEnvelope.data.payload.durationMs);
        setAnswerProgress(null);
        setRevealedAnswer(null);
        setScoreboard(null);
        setCurrentQuestionIndex(parsedEnvelope.data.payload.questionIndex);
        setTotalQuestionCount(parsedEnvelope.data.payload.totalQuestionCount);
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
        setTotalQuestionCount(parsedEnvelope.data.payload.totalQuestionCount);
        setRemainingMs(0);
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
      hostSessionRef.current || roomInfo || pendingCreateRoomRef.current
        ? "reconnecting"
        : "connecting",
    );

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

      if (
        !intentionalReconnectRef.current &&
        (hostSessionRef.current || roomInfo || pendingCreateRoomRef.current)
      ) {
        setNotice({
          kind: "info",
          text: "Verbindung verloren. Host-Sitzung wird erneut verbunden…",
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

      reconnectAsFreshHost("Host-Verbindung wird zurückgesetzt. Neuer Raum folgt gleich.");
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
  const connectedPlayerCount = lobby?.players.filter((player) => player.connected).length ?? 0;
  const totalPlayerCount = lobby?.playerCount ?? 0;
  const disconnectedPlayerCount = Math.max(0, totalPlayerCount - connectedPlayerCount);
  const timerSeconds = Math.ceil((remainingMs ?? 0) / 1000);
  const answerProgressPercent =
    answerProgress && answerProgress.totalEligiblePlayers > 0
      ? (answerProgress.answeredCount / answerProgress.totalEligiblePlayers) * 100
      : 0;
  const revealedOptionLabel =
    question && revealedAnswer
      ? (question.options.find((option) => option.id === revealedAnswer.value)?.label ??
        revealedAnswer.value)
      : null;

  const selectedCategories = HOST_CATEGORY_OPTIONS.filter((category) =>
    selectedCategoryIds.includes(category.id),
  );
  const categoryPlanPercent =
    HOST_CATEGORY_OPTIONS.length > 0
      ? (selectedCategories.length / HOST_CATEGORY_OPTIONS.length) * 100
      : 0;

  const latestScoreboard: ScoreboardEntry[] =
    finalResult?.finalScoreboard ?? scoreboard?.scoreboard ?? [];
  const scoreByPlayerId = new Map<string, number>();
  for (const entry of latestScoreboard) {
    scoreByPlayerId.set(entry.playerId, entry.score);
  }

  const playersForSidebar = [...(lobby?.players ?? [])]
    .map((player) => ({
      ...player,
      score: scoreByPlayerId.get(player.playerId) ?? player.score,
    }))
    .sort((left, right) => {
      if (left.connected !== right.connected) {
        return left.connected ? -1 : 1;
      }

      return left.name.localeCompare(right.name, "de");
    });

  const effectiveTotalQuestionCount =
    totalQuestionCount ?? question?.totalQuestionCount ?? finalResult?.totalQuestionCount ?? null;
  const currentQuestionNumber = currentQuestionIndex !== null ? currentQuestionIndex + 1 : 0;
  const visibleQuestionNumber =
    effectiveTotalQuestionCount === null
      ? 0
      : screen === "finished"
        ? effectiveTotalQuestionCount
        : currentQuestionNumber;
  const questionProgressPercent =
    effectiveTotalQuestionCount && visibleQuestionNumber > 0
      ? (visibleQuestionNumber / effectiveTotalQuestionCount) * 100
      : 0;

  const roomStateValue =
    screen === "finished"
      ? RoomState.Completed
      : screen === "question" || screen === "reveal" || screen === "scoreboard"
        ? RoomState.InGame
        : roomInfo
          ? (lobby?.roomState ?? RoomState.Waiting)
          : undefined;
  const roomStateLabel = getRoomStateLabel(roomStateValue);
  const questionPhaseLabel = getQuestionPhaseLabel(screen, question?.gameState);

  const isReadyToStart = screen === "lobby" && Boolean(roomInfo) && connectedPlayerCount > 0;
  const readinessLabel =
    screen === "lobby"
      ? isReadyToStart
        ? "Ja"
        : "Noch nicht"
      : screen === "finished"
        ? "Abgeschlossen"
        : "Läuft";

  let statusHeadline = "Host bereit";
  let statusHint = "Die Host-Ansicht bündelt Status, Fortschritt und Spieler an einer Stelle.";

  switch (screen) {
    case "lobby":
      statusHeadline = isReadyToStart ? "Startklar" : "Warte auf Spieler";
      statusHint = isReadyToStart
        ? "Das Quiz kann jetzt gestartet werden. Die Kategorien sind aktuell nur als Host-Vorbereitung sichtbar."
        : "Sobald mindestens ein Handy verbunden ist, kann das Quiz losgehen.";
      break;
    case "question":
      statusHeadline = "Frage läuft";
      statusHint = "Timer und Antwortannahme bleiben serverseitig autoritativ.";
      break;
    case "reveal":
      statusHeadline = "Auflösung sichtbar";
      statusHint = "Die richtige Antwort ist jetzt auf dem Hauptscreen sichtbar.";
      break;
    case "scoreboard":
      statusHeadline = "Zwischenstand bereit";
      statusHint = "Von hier geht es per Host-Steuerung zur nächsten Frage oder in den Endstand.";
      break;
    case "finished":
      statusHeadline = "Quiz beendet";
      statusHint = "Für ein neues Spiel wird der aktuelle Raum geschlossen und neu aufgebaut.";
      break;
    default:
      break;
  }

  let controlDescription = "Der nächste sinnvolle Schritt wird hier zentral ausgelöst.";
  let controlNote = "Keine Zusatzlogik auf dem Client: Der Server bleibt die Wahrheit.";
  let primaryAction: PrimaryAction = {
    label: "Quiz starten",
    description: "Sobald mindestens ein Handy verbunden ist, kann die erste Frage starten.",
    disabled: !isReadyToStart,
    note: "Die Kategorien sind aktuell nur als Vorbereitung sichtbar und steuern den Fragenblock noch nicht.",
    onClick: handleStartGame,
  };

  switch (screen) {
    case "lobby":
      primaryAction = {
        label: "Quiz starten",
        description:
          connectedPlayerCount > 0
            ? "Der Server startet die erste Frage und übernimmt Timer, Antworten und Punkte."
            : "Vor dem Start muss mindestens ein Spieler verbunden sein.",
        disabled: !isReadyToStart,
        note:
          selectedCategories.length > 0
            ? "Die Kategorien markieren aktuell nur den geplanten Host-Flow. Gestartet wird weiterhin das bestehende Standardquiz."
            : "Ohne vorbereitete Kategorien startet trotzdem das bestehende Standardquiz.",
        onClick: handleStartGame,
      };
      controlDescription = primaryAction.description;
      controlNote = primaryAction.note;
      break;
    case "question":
      primaryAction = {
        label: "Antworten laufen",
        description:
          "Die Frage ist offen. Der Server schließt sie automatisch bei Zeitablauf oder wenn alle geantwortet haben.",
        disabled: true,
        note: "Hier ist bewusst keine manuelle Abkürzung eingebaut.",
      };
      controlDescription = primaryAction.description;
      controlNote = primaryAction.note;
      break;
    case "reveal":
      primaryAction = {
        label: "Auflösung läuft",
        description:
          "Die richtige Antwort wird gerade gezeigt. Anschließend landet der Host automatisch im Zwischenstand.",
        disabled: true,
        note: "Die Anzeige bleibt ruhig, damit der Screen aus der Distanz lesbar bleibt.",
      };
      controlDescription = primaryAction.description;
      controlNote = primaryAction.note;
      break;
    case "scoreboard": {
      const isLastQuestion =
        effectiveTotalQuestionCount !== null &&
        currentQuestionNumber >= effectiveTotalQuestionCount;
      primaryAction = {
        label: isLastQuestion ? "Endstand zeigen" : "Nächste Frage",
        description: isLastQuestion
          ? "Die letzte Frage ist durch. Mit dem nächsten Schritt sendet der Server den Endstand."
          : "Der Server springt zur nächsten Frage und setzt die Antwortphase neu auf.",
        disabled: !roomInfo,
        note: "Ob noch eine weitere Frage folgt oder das Spiel endet, entscheidet allein der Server.",
        onClick: handleNextQuestion,
      };
      controlDescription = primaryAction.description;
      controlNote = primaryAction.note;
      break;
    }
    case "finished":
      primaryAction = {
        label: "Neues Spiel vorbereiten",
        description: "Der alte Raum wird geschlossen und direkt durch einen frischen Raum ersetzt.",
        disabled: !roomInfo && !hostSessionRef.current,
        note: "Die lokale Kategorien-Auswahl bleibt erhalten, bis du sie selbst änderst.",
        onClick: handleCreateRoom,
      };
      controlDescription = primaryAction.description;
      controlNote = primaryAction.note;
      break;
    default:
      break;
  }

  const currentFlowStepIndex =
    screen === "finished"
      ? 4
      : screen === "scoreboard" || screen === "reveal"
        ? 3
        : screen === "question"
          ? 2
          : selectedCategories.length > 0
            ? 1
            : 0;

  const renderStagePanel = () => {
    if (screen === "lobby" && roomInfo) {
      return (
        <>
          <div className="host-stage-head">
            <div className="host-stage-copy">
              <p className="host-kicker">Lobby</p>
              <h2 className="host-stage-title">Raum ist offen und bereit für den Quiz-Start.</h2>
              <p className="host-stage-text">
                {connectedPlayerCount > 0
                  ? `${connectedPlayerCount} Handy${connectedPlayerCount === 1 ? "" : "s"} sind verbunden. Sobald alle drin sind, startest du rechts das Quiz.`
                  : "Zeige Join-Code oder QR groß auf dem Screen. Sobald mindestens ein Handy drin ist, kann das Quiz starten."}
              </p>
            </div>

            <div className="host-stage-pill-row">
              <span className="host-stage-pill">{totalPlayerCount} Spieler insgesamt</span>
              <span
                className="host-stage-pill"
                data-tone={connectedPlayerCount > 0 ? "success" : "neutral"}
              >
                {connectedPlayerCount} verbunden
              </span>
            </div>
          </div>

          <div className="host-stage-split">
            <div className="host-join-stage">
              <p className="host-section-label">Join-Code</p>
              <p className="host-join-code">{roomInfo.joinCode}</p>
              <p className="host-join-caption">
                Code groß sichtbar lassen oder direkt per QR einscannen.
              </p>
            </div>

            <div className="host-support-stack">
              {loopback ? (
                <div className="host-hint">
                  QR ist für echte Handys erst sinnvoll, wenn diese Host-Seite über eine LAN-IP oder
                  einen lokalen Hostnamen geöffnet wurde statt über <code>localhost</code>.
                </div>
              ) : (
                <div className="host-qr-card">
                  {qrCodeDataUrl ? (
                    <img alt="QR-Code für den Player-Join" src={qrCodeDataUrl} />
                  ) : null}
                </div>
              )}

              <div className="host-join-link-card">
                <p className="host-join-link-label">Direktlink</p>
                <div className="host-join-link">{joinUrl}</div>
              </div>
            </div>
          </div>
        </>
      );
    }

    if (screen === "question") {
      if (!question) {
        return <div className="host-empty">Die Frage wird gerade vom Server geladen.</div>;
      }

      return (
        <>
          <div className="host-stage-head">
            <div className="host-stage-copy">
              <p className="host-kicker">
                Frage {currentQuestionNumber}
                {effectiveTotalQuestionCount ? ` von ${effectiveTotalQuestionCount}` : ""}
              </p>
              <h2 className="host-stage-title">Jetzt antworten die Handys.</h2>
              <p className="host-stage-text">
                Die Frage läuft auf dem Hauptscreen, die Antworten kommen gesammelt vom Server
                zurück.
              </p>
            </div>

            <div className="host-timer-shell" data-urgent={timerSeconds <= 5 ? "true" : undefined}>
              <span className="host-timer-label">Restzeit</span>
              <div className="host-timer">{timerSeconds}s</div>
            </div>
          </div>

          <div className="host-stage-pill-row">
            <span className="host-stage-pill">
              {effectiveTotalQuestionCount
                ? `${effectiveTotalQuestionCount} Fragen gesamt`
                : "Fragenblock aktiv"}
            </span>
            <span className="host-stage-pill" data-tone="accent">
              {answerProgress
                ? `${answerProgress.answeredCount} / ${answerProgress.totalEligiblePlayers} Antworten`
                : "Warte auf Antworten"}
            </span>
          </div>

          <h3 className="host-question-text">{question.text}</h3>

          <div className="host-options-grid">
            {question.options.map((option) => (
              <div className="host-option-card" key={option.id}>
                <span className="host-option-id">{option.id}</span>
                <span className="host-option-label">{option.label}</span>
              </div>
            ))}
          </div>

          <div className="host-progress-block">
            <div className="host-bar-meta">
              <span>Antwortfortschritt</span>
              <strong>
                {answerProgress
                  ? `${answerProgress.answeredCount} / ${answerProgress.totalEligiblePlayers} geantwortet`
                  : "Noch keine Antworten bestätigt"}
              </strong>
            </div>
            <div className="host-bar">
              <div
                className="host-bar-fill"
                style={{
                  width: `${answerProgressPercent}%`,
                }}
              />
              <span className="host-bar-text">
                {answerProgress
                  ? `${answerProgress.answeredCount} / ${answerProgress.totalEligiblePlayers} geantwortet`
                  : "Warte auf Antworten"}
              </span>
            </div>
          </div>
        </>
      );
    }

    if (screen === "reveal") {
      if (!question) {
        return <div className="host-empty">Die Auflösung wird gerade synchronisiert.</div>;
      }

      return (
        <>
          <div className="host-stage-head">
            <div className="host-stage-copy">
              <p className="host-kicker">Auflösung</p>
              <h2 className="host-stage-title">Die richtige Antwort steht auf dem Screen.</h2>
              <p className="host-stage-text">
                Jetzt ist der Moment für Reaktion im Raum, bevor der Zwischenstand kommt.
              </p>
            </div>

            <div className="host-reveal-callout">
              <span className="host-reveal-label">Richtig</span>
              <strong>{revealedOptionLabel ?? "Wird geladen"}</strong>
            </div>
          </div>

          <h3 className="host-question-text">{question.text}</h3>

          <div className="host-options-grid">
            {question.options.map((option) => (
              <div
                className="host-option-card"
                data-correct={revealedAnswer?.value === option.id ? "true" : undefined}
                key={option.id}
              >
                <span className="host-option-id">{option.id}</span>
                <span className="host-option-label">{option.label}</span>
              </div>
            ))}
          </div>
        </>
      );
    }

    if (screen === "scoreboard") {
      return (
        <>
          <div className="host-stage-head">
            <div className="host-stage-copy">
              <p className="host-kicker">Zwischenstand</p>
              <h2 className="host-stage-title">Punkte nach dieser Frage.</h2>
              <p className="host-stage-text">
                Der Hauptscreen bleibt bei der Rangliste, bis du rechts den nächsten Schritt
                auslöst.
              </p>
            </div>

            <div className="host-stage-pill-row">
              <span className="host-stage-pill">
                Frage {currentQuestionNumber}
                {effectiveTotalQuestionCount ? ` / ${effectiveTotalQuestionCount}` : ""}
              </span>
            </div>
          </div>

          {latestScoreboard.length > 0 ? (
            <div className="host-scoreboard-list">
              {latestScoreboard.map((entry, index) => (
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
          ) : (
            <div className="host-empty">Der Zwischenstand wird gerade aufgebaut.</div>
          )}
        </>
      );
    }

    if (screen === "finished") {
      const winner = finalResult?.finalScoreboard[0] ?? null;

      return (
        <>
          <div className="host-stage-head">
            <div className="host-stage-copy">
              <p className="host-kicker">Endstand</p>
              <h2 className="host-stage-title">Das Quiz ist beendet.</h2>
              <p className="host-stage-text">
                {winner
                  ? `${winner.name} führt den Abend an. Von rechts kann direkt ein neues Spiel vorbereitet werden.`
                  : "Der Endstand ist fertig und der Raum kann für ein neues Spiel ersetzt werden."}
              </p>
            </div>
          </div>

          {latestScoreboard.length > 0 ? (
            <div className="host-scoreboard-list">
              {latestScoreboard.map((entry, index) => (
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
          ) : (
            <div className="host-empty">Der Endstand wird gerade synchronisiert.</div>
          )}
        </>
      );
    }

    return <div className="host-empty">Die Host-Ansicht wird vorbereitet.</div>;
  };

  return (
    <main className="host-shell" data-screen={screen}>
      <div className="host-header">
        <div className="host-brand">
          <span className="host-flag">Geburtstagsabend live</span>
          <h1 className="host-title">Geburtstagsquiz Host</h1>
          <p className="host-subtitle">
            Eine klare Steueroberfläche für Join-Code, Fortschritt, Spieler und den nächsten
            sinnvollen Schritt im Abendablauf.
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

      {screen === "start" && !roomInfo ? (
        <section className="host-start host-panel">
          <div className="host-start-copy">
            <p className="host-kicker">Host Setup</p>
            <h2 className="host-copy-title">
              Raum öffnen, Leute reinholen, dann sauber durch den Abend führen.
            </h2>
            <p className="host-copy-text">
              Erst Raum erstellen, dann Join-Code zeigen und danach aus einer ruhigen
              Host-Oberfläche durch Lobby, Frage, Auflösung und Rangliste steuern.
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
                  reconnectAsFreshHost("Gespeicherte Host-Sitzung wurde gelöscht.");
                }}
                type="button"
              >
                Lokale Session löschen
              </button>
            </div>
          </div>

          <aside className="host-note-card">
            <p className="host-note-label">Vor dem Start</p>
            <h2>Handys nur über dasselbe WLAN holen.</h2>
            <p>
              Für echte Handys im selben WLAN die Host-Seite nicht über <code>localhost</code>,
              sondern über die LAN-IP oder einen lokalen Hostnamen öffnen. Dann zeigt der QR-Code
              direkt auf die Player-App im selben Netz.
            </p>
          </aside>
        </section>
      ) : null}

      {roomInfo ? (
        <section className="host-dashboard">
          <div className="host-dashboard-main">
            <section className="host-panel host-stage-panel" data-mode={screen}>
              {renderStagePanel()}
            </section>

            <section className="host-panel host-categories-panel">
              <div className="host-panel-top">
                <div>
                  <p className="host-section-label">Kategorieauswahl</p>
                  <h2 className="host-panel-title">Rundenplan für den Host vorbereiten.</h2>
                  <p className="host-panel-copy">
                    Sichtbare Mehrfachauswahl für den Abendfluss. Diese Auswahl steuert den
                    Fragenblock aktuell noch nicht serverseitig.
                  </p>
                </div>

                <div className="host-ready-pill" data-tone="soft">
                  {selectedCategories.length} gewählt
                </div>
              </div>

              <div className="host-category-note">
                Mock-/Vorbereitungsstand: Kategorien sind jetzt bewusst UI-seitig angelegt, damit
                der Host schon mit einer klaren Struktur arbeiten kann.
              </div>

              <div className="host-category-grid">
                {HOST_CATEGORY_OPTIONS.map((category) => {
                  const isSelected = selectedCategoryIds.includes(category.id);

                  return (
                    <button
                      aria-pressed={isSelected}
                      className="host-category-card"
                      data-selected={isSelected ? "true" : undefined}
                      key={category.id}
                      onClick={() => {
                        setSelectedCategoryIds((currentIds) =>
                          currentIds.includes(category.id)
                            ? currentIds.filter((currentId) => currentId !== category.id)
                            : [...currentIds, category.id],
                        );
                      }}
                      type="button"
                    >
                      <span className="host-category-state">
                        {isSelected ? "gewählt" : "nicht gewählt"}
                      </span>
                      <strong>{category.label}</strong>
                      <span>{category.description}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>

          <aside className="host-sidebar">
            <section className="host-panel host-sidebar-panel">
              <div className="host-panel-top">
                <div>
                  <p className="host-section-label">Status</p>
                  <h2 className="host-panel-title">Was läuft gerade?</h2>
                </div>

                <div className="host-ready-pill">{statusHeadline}</div>
              </div>

              <div className="host-summary-grid">
                <article className="host-summary-item">
                  <p className="host-summary-label">Spielstatus</p>
                  <p className="host-summary-value">{statusHeadline}</p>
                </article>
                <article className="host-summary-item">
                  <p className="host-summary-label">Raumstatus</p>
                  <p className="host-summary-value">{roomStateLabel}</p>
                </article>
                <article className="host-summary-item">
                  <p className="host-summary-label">Fragephase</p>
                  <p className="host-summary-value">{questionPhaseLabel}</p>
                </article>
                <article className="host-summary-item">
                  <p className="host-summary-label">Startbereit</p>
                  <p className="host-summary-value">{readinessLabel}</p>
                </article>
                <article className="host-summary-item">
                  <p className="host-summary-label">Geplante Kategorien</p>
                  <p className="host-summary-value">
                    {selectedCategories.length > 0
                      ? `${selectedCategories.length} vorbereitet`
                      : "Noch keine"}
                  </p>
                </article>
              </div>

              <div className="host-chip-row">
                {selectedCategories.length > 0 ? (
                  selectedCategories.map((category) => (
                    <span className="host-chip" key={category.id}>
                      {category.label}
                    </span>
                  ))
                ) : (
                  <span className="host-chip">Noch keine Kategorie markiert</span>
                )}
              </div>

              <p className="host-panel-note">{statusHint}</p>
            </section>

            <section className="host-panel host-sidebar-panel">
              <div className="host-panel-top">
                <div>
                  <p className="host-section-label">Fortschritt</p>
                  <h2 className="host-panel-title">Ablauf auf einen Blick.</h2>
                </div>
              </div>

              <div className="host-flow-list">
                {FLOW_STEPS.map((step, index) => {
                  const state =
                    index < currentFlowStepIndex
                      ? "done"
                      : index === currentFlowStepIndex
                        ? "current"
                        : "upcoming";

                  return (
                    <div className="host-flow-item" data-state={state} key={step}>
                      <span className="host-flow-index">{index + 1}</span>
                      <div>
                        <strong>{step}</strong>
                        <span>
                          {state === "done"
                            ? "erledigt"
                            : state === "current"
                              ? "gerade aktiv"
                              : "folgt später"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="host-progress-block">
                <div className="host-bar-meta">
                  <span>Fragen</span>
                  <strong>
                    {effectiveTotalQuestionCount !== null
                      ? `${visibleQuestionNumber} / ${effectiveTotalQuestionCount}`
                      : "Noch nicht gestartet"}
                  </strong>
                </div>
                <div className="host-bar">
                  <div
                    className="host-bar-fill"
                    style={{
                      width: `${questionProgressPercent}%`,
                    }}
                  />
                  <span className="host-bar-text">
                    {effectiveTotalQuestionCount !== null
                      ? `Frage ${visibleQuestionNumber} von ${effectiveTotalQuestionCount}`
                      : "Fragenblock wird vom Server geliefert"}
                  </span>
                </div>
              </div>

              <div className="host-progress-block">
                <div className="host-bar-meta">
                  <span>Rundenplan</span>
                  <strong>
                    {selectedCategories.length} / {HOST_CATEGORY_OPTIONS.length} vorbereitet
                  </strong>
                </div>
                <div className="host-bar" data-tone="soft">
                  <div
                    className="host-bar-fill"
                    style={{
                      width: `${categoryPlanPercent}%`,
                    }}
                  />
                  <span className="host-bar-text">Kategorien aktuell als UI-Vorbereitung</span>
                </div>
              </div>
            </section>

            <section className="host-panel host-sidebar-panel">
              <div className="host-panel-top">
                <div>
                  <p className="host-section-label">Steuerung</p>
                  <h2 className="host-panel-title">Nächster Schritt</h2>
                  <p className="host-panel-copy">{controlDescription}</p>
                </div>
              </div>

              <div className="host-actions host-actions-column">
                <button
                  className="host-primary-button"
                  disabled={primaryAction.disabled}
                  onClick={primaryAction.onClick}
                  type="button"
                >
                  {primaryAction.label}
                </button>
              </div>

              <p className="host-panel-note">{controlNote}</p>
            </section>

            <section className="host-panel host-player-panel">
              <div className="host-panel-top">
                <div>
                  <p className="host-section-label">Spielerübersicht</p>
                  <h2 className="host-panel-title">Wer ist drin und verbunden?</h2>
                  <p className="host-panel-copy">
                    Verbindung bleibt klar sichtbar. Antwortstatus kommt aktuell gesammelt, nicht
                    pro Spieler.
                  </p>
                </div>

                <div
                  className="host-ready-pill"
                  data-tone={connectedPlayerCount > 0 ? "success" : "soft"}
                >
                  {connectedPlayerCount} online
                </div>
              </div>

              <div className="host-metric-grid host-metric-grid-compact">
                <div className="host-metric">
                  <p className="host-metric-label">Gesamt</p>
                  <p className="host-metric-value">{totalPlayerCount}</p>
                </div>
                <div className="host-metric">
                  <p className="host-metric-label">Verbunden</p>
                  <p className="host-metric-value">{connectedPlayerCount}</p>
                </div>
                <div className="host-metric">
                  <p className="host-metric-label">Getrennt</p>
                  <p className="host-metric-value">{disconnectedPlayerCount}</p>
                </div>
              </div>

              <div className="host-player-list">
                {playersForSidebar.length > 0 ? (
                  playersForSidebar.map((player) => (
                    <article
                      className="host-player-item"
                      data-connected={player.connected}
                      key={player.playerId}
                    >
                      <div className="host-player-avatar">
                        {player.name.slice(0, 1).toUpperCase()}
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
                    Noch keine Spieler in der Lobby. Join-Code teilen oder QR auf den Hauptscreen
                    bringen.
                  </div>
                )}
              </div>

              <p className="host-panel-note">
                {answerProgress
                  ? `Antwortstatus aktuell gesammelt: ${answerProgress.answeredCount} / ${answerProgress.totalEligiblePlayers} bestätigt.`
                  : "Individuelle Antwortmarken werden später ergänzt, sobald der Server sie liefert."}
              </p>
            </section>
          </aside>
        </section>
      ) : null}
    </main>
  );
}

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
  type NextQuestionReadyProgressPayload,
  type QuestionRevealPayload,
  type QuestionShowPayload,
  type ScoreUpdatePayload,
} from "@quiz/shared-protocol";
import { GameState, QuestionType, RoomState, type ScoreboardEntry } from "@quiz/shared-types";
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
  { id: "general", label: "Allgemein", description: "Warme Einstiegsrunde." },
  { id: "birthday", label: "Geburtstag", description: "Fragen zum Alter & Feier." },
  { id: "personal", label: "Persönlich", description: "Fragen über das Geburtstagskind." },
  { id: "music", label: "Musik", description: "Hits und Erkennerfragen." },
  { id: "fun", label: "Spaßfragen", description: "Locker & albern." },
] as const;

const DEFAULT_SELECTED_CATEGORY_IDS = HOST_CATEGORY_OPTIONS.map((category) => category.id);
const FLOW_STEPS = ["Lobby", "Kategorien", "Frage", "Auflösung", "Endstand"] as const;

function getViteEnv(name: string): string | undefined {
  return (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.[name];
}

function getPublicHost(): string {
  return getViteEnv("VITE_PUBLIC_HOST") ?? window.location.hostname;
}

function getServerSocketUrl(): string {
  const url = new URL(window.location.href);
  url.hostname = getPublicHost();
  url.protocol = getWebSocketProtocol(window.location.protocol);
  url.port = getViteEnv("VITE_SERVER_PORT") ?? "3001";
  url.pathname = "/";
  return url.toString();
}

function getPlayerJoinUrl(joinCode: string): string {
  const url = new URL(window.location.href);
  url.hostname = getPublicHost();
  url.port = getViteEnv("VITE_PLAYER_PORT") ?? "5174";
  url.pathname = "/";
  url.search = new URLSearchParams({ joinCode }).toString();
  return url.toString();
}

function getConnectionLabel(connectionState: ConnectionState): string {
  switch (connectionState) {
    case "connecting":
      return "Verbinde...";
    case "reconnecting":
      return "Neuverbindung...";
    case "connected":
      return "Online";
    default:
      return "Offline";
  }
}

function createHostClientInfo() {
  return { deviceType: "browser", appVersion: "0.0.1" };
}

export function App() {
  const initialSession = loadHostStoredSession();

  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [notice, setNotice] = useState<HostNotice | null>(null);
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
  const [roundResults, setRoundResults] = useState<QuestionRevealPayload["playerResults"]>([]);
  const [scoreboard, setScoreboard] = useState<ScoreUpdatePayload | null>(null);
  const [nextQuestionReadyProgress, setNextQuestionReadyProgress] =
    useState<NextQuestionReadyProgressPayload | null>(null);
  const [finalResult, setFinalResult] = useState<GameFinishedPayload | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number | null>(null);
  const [totalQuestionCount, setTotalQuestionCount] = useState<number | null>(null);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<HostCategoryId[]>(
    DEFAULT_SELECTED_CATEGORY_IDS,
  );
  const [showAnswerTextOnPlayerDevices, setShowAnswerTextOnPlayerDevices] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const hostSessionRef = useRef<HostStoredSession | null>(initialSession);
  const shouldReconnectRef = useRef(true);
  const intentionalReconnectRef = useRef(false);
  const pendingRoomCreateRef = useRef(false);

  const clearReconnectTimer = useEffectEvent(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  });

  const updateStoredSession = useEffectEvent((session: HostStoredSession | null) => {
    hostSessionRef.current = session;
    if (session) saveHostStoredSession(session);
    else clearHostStoredSession();
  });

  const sendClientEvent = useEffectEvent(
    <TEvent extends keyof ClientToServerEventPayloadMap>(
      event: TEvent,
      payload: ClientToServerEventPayloadMap[TEvent],
    ) => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return false;
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
    setRoundResults([]);
    setScoreboard(null);
    setNextQuestionReadyProgress(null);
    setFinalResult(null);
    setCurrentQuestionIndex(null);
    setTotalQuestionCount(null);
    setShowAnswerTextOnPlayerDevices(false);
  });

  const createRoomOnCurrentSocket = useEffectEvent(() => {
    setIsCreatingRoom(true);
    setNotice(null);
    const sent = sendClientEvent(EVENTS.ROOM_CREATE, {
      hostName: "Host",
      clientInfo: createHostClientInfo(),
    });

    if (!sent) {
      setIsCreatingRoom(false);
      setNotice({ kind: "error", text: "Server ist nicht verbunden. Bitte kurz warten." });
    }
  });

  const scheduleReconnect = useEffectEvent(() => {
    if (!shouldReconnectRef.current) return;
    clearReconnectTimer();
    const delay = getReconnectDelay(reconnectAttemptRef.current);
    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectAttemptRef.current += 1;
      connectSocket();
    }, delay);
  });

  const handleServerMessage = useEffectEvent((rawMessage: string) => {
    const parsedEnvelope = parseServerToClientEnvelope(rawMessage);
    if (!parsedEnvelope.success) return;

    switch (parsedEnvelope.data.event) {
      case EVENTS.CONNECTION_ACK:
        reconnectAttemptRef.current = 0;
        intentionalReconnectRef.current = false;
        setConnectionState("connected");
        if (hostSessionRef.current) {
          sendClientEvent(EVENTS.CONNECTION_RESUME, {
            roomId: hostSessionRef.current.roomId,
            sessionId: hostSessionRef.current.sessionId,
          });
        } else if (pendingRoomCreateRef.current) {
          pendingRoomCreateRef.current = false;
          createRoomOnCurrentSocket();
        }
        return;

      case EVENTS.ROOM_CREATED:
        pendingRoomCreateRef.current = false;
        updateStoredSession({
          roomId: parsedEnvelope.data.payload.roomId,
          sessionId: parsedEnvelope.data.payload.hostSessionId,
        });
        setRoomInfo({
          roomId: parsedEnvelope.data.payload.roomId,
          joinCode: parsedEnvelope.data.payload.joinCode,
        });
        setShowAnswerTextOnPlayerDevices(false);
        setScreen("lobby");
        setIsCreatingRoom(false);
        setNotice(null);
        return;

      case EVENTS.CONNECTION_RESUMED:
        if (parsedEnvelope.data.payload.role !== "host") return;
        setRoomInfo({
          roomId: parsedEnvelope.data.payload.roomId,
          joinCode: parsedEnvelope.data.payload.joinCode,
        });
        if (parsedEnvelope.data.payload.roomState === "waiting") {
          setScreen("lobby");
        } else {
          const gs = parsedEnvelope.data.payload.gameState;
          if (gs === GameState.Revealing) setScreen("reveal");
          else if (gs === GameState.Scoreboard) setScreen("scoreboard");
          else if (gs === GameState.Completed) setScreen("finished");
          else setScreen("question");
        }
        return;

      case EVENTS.LOBBY_UPDATE:
        setLobby(parsedEnvelope.data.payload);
        setShowAnswerTextOnPlayerDevices(
          parsedEnvelope.data.payload.settings.showAnswerTextOnPlayerDevices,
        );
        return;

      case EVENTS.GAME_STARTED:
        setScreen("question");
        return;

      case EVENTS.QUESTION_SHOW:
        setQuestion(parsedEnvelope.data.payload);
        setRemainingMs(parsedEnvelope.data.payload.durationMs);
        setCurrentQuestionIndex(parsedEnvelope.data.payload.questionIndex);
        setTotalQuestionCount(parsedEnvelope.data.payload.totalQuestionCount);
        setScreen("question");
        setAnswerProgress(null);
        return;

      case EVENTS.QUESTION_TIMER:
        setRemainingMs(parsedEnvelope.data.payload.remainingMs);
        return;

      case EVENTS.ANSWER_PROGRESS:
        setAnswerProgress(parsedEnvelope.data.payload);
        return;

      case EVENTS.QUESTION_REVEAL:
        setRevealedAnswer(parsedEnvelope.data.payload.correctAnswer);
        setRoundResults(parsedEnvelope.data.payload.playerResults);
        setScreen("reveal");
        return;

      case EVENTS.SCORE_UPDATE:
        setScoreboard(parsedEnvelope.data.payload);
        setScreen("scoreboard");
        return;

      case EVENTS.NEXT_QUESTION_READY_PROGRESS:
        setNextQuestionReadyProgress(parsedEnvelope.data.payload);
        return;

      case EVENTS.GAME_FINISHED:
        setFinalResult(parsedEnvelope.data.payload);
        setScreen("finished");
        return;

      case EVENTS.ROOM_CLOSED:
        resetLobbyState();
        updateStoredSession(null);
        return;

      case EVENTS.ERROR_PROTOCOL:
        setIsCreatingRoom(false);
        if (
          parsedEnvelope.data.payload.code === PROTOCOL_ERROR_CODES.SESSION_NOT_FOUND ||
          parsedEnvelope.data.payload.code === PROTOCOL_ERROR_CODES.ROOM_NOT_FOUND
        ) {
          updateStoredSession(null);
          resetLobbyState();
          if (pendingRoomCreateRef.current) {
            socketRef.current?.close();
          }
        }
        setNotice({ kind: "error", text: parsedEnvelope.data.payload.message });
        return;

      default:
        return;
    }
  });

  const connectSocket = useEffectEvent(() => {
    clearReconnectTimer();
    const socket = new WebSocket(getServerSocketUrl());
    socketRef.current = socket;
    socket.addEventListener("message", (e) => handleServerMessage(e.data as string));
    socket.addEventListener("close", () => {
      if (socketRef.current === socket) {
        setConnectionState("reconnecting");
        scheduleReconnect();
      }
    });
  });

  useEffect(() => {
    connectSocket();
    return () => {
      shouldReconnectRef.current = false;
      clearReconnectTimer();
      socketRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (!roomInfo?.joinCode) {
      setQrCodeDataUrl(null);
      return;
    }
    QRCode.toDataURL(getPlayerJoinUrl(roomInfo.joinCode), { margin: 1, width: 400 })
      .then(setQrCodeDataUrl)
      .catch(() => setQrCodeDataUrl(null));
  }, [roomInfo?.joinCode]);

  const handleCreateRoom = useEffectEvent(() => {
    if (screen === "finished" && roomInfo) {
      pendingRoomCreateRef.current = true;
      setIsCreatingRoom(true);
      setNotice(null);
      updateStoredSession(null);
      const sent = sendClientEvent(EVENTS.ROOM_CLOSE, { roomId: roomInfo.roomId });

      if (!sent) {
        resetLobbyState();
        socketRef.current?.close();
      }
      return;
    }

    createRoomOnCurrentSocket();
  });

  const handleStartGame = useEffectEvent(() => {
    if (roomInfo) {
      setNotice(null);
      sendClientEvent(EVENTS.GAME_START, { roomId: roomInfo.roomId });
    }
  });

  const handleAnswerTextSettingChange = useEffectEvent((enabled: boolean) => {
    if (!roomInfo || screen !== "lobby") return;
    setShowAnswerTextOnPlayerDevices(enabled);
    setNotice(null);
    const sent = sendClientEvent(EVENTS.ROOM_SETTINGS_UPDATE, {
      roomId: roomInfo.roomId,
      showAnswerTextOnPlayerDevices: enabled,
    });

    if (!sent) {
      setNotice({ kind: "error", text: "Einstellung konnte nicht gesendet werden." });
    }
  });

  const handleAdvanceQuestion = useEffectEvent(() => {
    if (roomInfo) {
      setNotice(null);
      sendClientEvent(EVENTS.GAME_NEXT_QUESTION, { roomId: roomInfo.roomId });
    }
  });

  const loopback = isLoopbackHostname(getPublicHost());
  const connectedPlayerCount = lobby?.players.filter((p) => p.connected).length ?? 0;
  const timerSeconds = Math.ceil((remainingMs ?? 0) / 1000);
  const isTimerWarning = remainingMs > 0 && timerSeconds <= 10;
  const isTimerUrgent = remainingMs > 0 && timerSeconds <= 5;
  const answerProgressPercent =
    answerProgress && answerProgress.totalEligiblePlayers > 0
      ? (answerProgress.answeredCount / answerProgress.totalEligiblePlayers) * 100
      : 0;

  const latestScoreboard = finalResult?.finalScoreboard ?? scoreboard?.scoreboard ?? [];
  const correctRoundCount = roundResults.filter((r) => r.isCorrect).length;
  const wrongRoundCount = roundResults.filter((r) => !r.isCorrect && r.answer !== null).length;
  const missingRoundCount = roundResults.filter((r) => r.answer === null).length;
  const nextReadyLabel = nextQuestionReadyProgress
    ? `${nextQuestionReadyProgress.readyCount} / ${nextQuestionReadyProgress.totalEligiblePlayers} bereit`
    : "Warte auf Bereitmeldungen";

  const effectiveTotalQuestionCount =
    totalQuestionCount ?? question?.totalQuestionCount ?? finalResult?.totalQuestionCount ?? null;
  const currentQuestionNumber = currentQuestionIndex !== null ? currentQuestionIndex + 1 : 0;
  const visibleQuestionNumber =
    screen === "finished" ? effectiveTotalQuestionCount || 0 : currentQuestionNumber;
  const questionProgressPercent = effectiveTotalQuestionCount
    ? (visibleQuestionNumber / effectiveTotalQuestionCount) * 100
    : 0;

  const currentFlowStepIndex =
    screen === "finished"
      ? 4
      : screen === "scoreboard" || screen === "reveal"
        ? 3
        : screen === "question"
          ? 2
          : 1;

  const renderStagePanel = () => {
    if (screen === "lobby" && roomInfo) {
      return (
        <div className="host-panel-content host-lobby-stage">
          <p className="host-section-label host-section-label--compact">Jetzt beitreten</p>
          <p className="host-join-code host-join-code--hero">{roomInfo.joinCode}</p>
          {!loopback && qrCodeDataUrl && (
            <div className="host-qr-large">
              <img alt="QR-Code" src={qrCodeDataUrl} />
            </div>
          )}
          <p className="host-lobby-hint">QR-Code scannen oder Code eingeben</p>
        </div>
      );
    }

    if (screen === "question" && question) {
      return (
        <div className="host-panel-content">
          <div className="host-stage-head">
            <p className="host-section-label">Frage {currentQuestionNumber}</p>
            <div
              className="host-timer-shell"
              data-urgent={isTimerUrgent ? "true" : undefined}
              data-warning={isTimerWarning ? "true" : undefined}
            >
              <div className="host-timer">{timerSeconds}s</div>
            </div>
          </div>
          <h3 className="host-question-text">{question.text}</h3>
          {(question.type === QuestionType.MultipleChoice ||
            question.type === QuestionType.Logic) && (
            <div className="host-options-grid">
              {question.options.map((opt) => (
                <div className="host-option-card" key={opt.id}>
                  <span className="host-option-id">{opt.id}</span>
                  <span className="host-option-label">{opt.label}</span>
                </div>
              ))}
            </div>
          )}
          {(question.type === QuestionType.Estimate ||
            question.type === QuestionType.MajorityGuess) && (
            <div className="host-estimate-display">
              Schätzungen laufen... ({question.unit} · {question.context})
            </div>
          )}
          {question.type === QuestionType.Ranking && (
            <div className="host-ranking-list">
              {question.items.map((item) => (
                <div className="host-ranking-item" key={item.id}>
                  <span className="host-option-id">{item.id}</span>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          )}
          <div className="host-progress-block">
            <div className="host-bar-meta">
              <span className="host-section-label host-section-label--compact">Antworten</span>
              <strong>
                {answerProgress?.answeredCount || 0} / {answerProgress?.totalEligiblePlayers || 0}
              </strong>
            </div>
            <div className="host-progress-bar">
              <div className="host-progress-fill" style={{ width: `${answerProgressPercent}%` }} />
            </div>
          </div>
        </div>
      );
    }

    if (screen === "reveal" && question) {
      return (
        <div className="host-panel-content">
          <p className="host-section-label">Auflösung</p>
          <h3 className="host-question-text">{question.text}</h3>
          {(question.type === QuestionType.MultipleChoice ||
            question.type === QuestionType.Logic) && (
            <div className="host-options-grid host-options-grid--reveal">
              {question.options.map((opt) => {
                const isCorrectAnswer =
                  revealedAnswer?.type === "option" && revealedAnswer.value === opt.id;
                return (
                  <div
                    className="host-option-card"
                    data-state={isCorrectAnswer ? "correct" : "dimmed"}
                    key={opt.id}
                  >
                    <span className="host-option-id">{opt.id}</span>
                    <span className="host-option-label">{opt.label}</span>
                  </div>
                );
              })}
            </div>
          )}
          {(question.type === QuestionType.Estimate ||
            question.type === QuestionType.MajorityGuess) &&
            revealedAnswer?.type === "number" && (
              <div className="host-estimate-display host-estimate-display--reveal">
                <span>Richtig: </span>
                <strong className="host-estimate-correct-value">
                  {revealedAnswer.value} {question.unit}
                </strong>
                <span className="host-estimate-context">({question.context})</span>
              </div>
            )}
          {question.type === QuestionType.Ranking && revealedAnswer?.type === "ranking" && (
            <div className="host-ranking-list">
              {revealedAnswer.value.map((id, i) => {
                const item = question.items.find((x) => x.id === id);
                return (
                  <div className="host-ranking-item host-ranking-item--reveal" key={id}>
                    <span className="host-ranking-position">{i + 1}.</span>
                    <span className="host-option-id">{id}</span>
                    <span>{item?.label ?? id}</span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="host-round-summary">
            <div className="host-round-summary-card" data-state="correct">
              <p className="host-control-label">Richtig</p>
              <p>{correctRoundCount}</p>
            </div>
            <div className="host-round-summary-card" data-state="wrong">
              <p className="host-control-label">Falsch</p>
              <p>{wrongRoundCount}</p>
            </div>
            <div className="host-round-summary-card" data-state="missing">
              <p className="host-control-label">Keine Antwort</p>
              <p>{missingRoundCount}</p>
            </div>
          </div>
        </div>
      );
    }

    if (screen === "scoreboard" || screen === "finished") {
      return (
        <div className="host-panel-content">
          <p className="host-section-label">
            {screen === "finished" ? "Endstand" : `Zwischenstand (${nextReadyLabel})`}
          </p>
          <div className="host-scoreboard-list" data-final={screen === "finished" ? "true" : undefined}>
            {latestScoreboard.map((entry, index) => (
              <article
                className="host-scoreboard-item"
                data-placement={index < 3 ? String(index + 1) : undefined}
                key={entry.playerId}
              >
                <div className="host-scoreboard-main">
                  <span className="host-scoreboard-rank">{index + 1}.</span>
                  <span className="host-scoreboard-name">{entry.name}</span>
                </div>
                <div className="host-scoreboard-score">{entry.score}</div>
              </article>
            ))}
          </div>
        </div>
      );
    }

    return <div className="host-empty">Warte auf Server...</div>;
  };

  const primaryActionLabel =
    screen === "lobby"
      ? "Quiz starten"
      : screen === "scoreboard"
        ? "Nächste Frage"
        : screen === "finished"
          ? "Neues Spiel"
          : "Warten...";
  const isPrimaryDisabled =
    screen === "lobby"
      ? connectedPlayerCount === 0
      : screen === "scoreboard"
        ? false
        : screen !== "finished";

  return (
    <main className="host-shell" data-screen={screen}>
      <header className="host-header">
        <div className="host-brand">
          <h1 className="host-title">Geburtstagsquiz</h1>
          <div className="host-status" data-state={connectionState}>
            {getConnectionLabel(connectionState)}
          </div>
        </div>
        {notice && (
          <div className="host-notice" data-kind={notice.kind}>
            {notice.text}
          </div>
        )}
      </header>

      {screen === "start" && !roomInfo ? (
        <section className="host-panel host-start-panel">
          <div className="host-start-container">
            <h2 className="host-stage-title host-stage-title--hero">Bereit für das Quiz?</h2>
            <button
              className="host-primary-button pulse"
              disabled={connectionState !== "connected" || isCreatingRoom}
              onClick={handleCreateRoom}
              type="button"
            >
              {isCreatingRoom ? "Erstelle Raum..." : "Neues Quiz starten"}
            </button>
          </div>
        </section>
      ) : roomInfo ? (
        <>
          <section className="host-dashboard">
            <aside className="host-sidebar-col">
              <div className="host-card host-card--dark">
                <p className="host-section-label host-section-label--muted">Raum</p>
                <p className="host-join-code">{roomInfo.joinCode}</p>
                {!loopback && qrCodeDataUrl && (
                  <div className="host-qr-mini">
                    <img alt="Join QR" src={qrCodeDataUrl} />
                  </div>
                )}
              </div>
              <div className="host-panel host-side-panel">
                <div className="host-panel-content">
                  <p className="host-section-label">Ablauf</p>
                  <div className="host-flow-list">
                    {FLOW_STEPS.map((step, index) => (
                      <div
                        className="host-flow-item"
                        data-state={
                          index < currentFlowStepIndex
                            ? "done"
                            : index === currentFlowStepIndex
                              ? "current"
                              : "upcoming"
                        }
                        key={step}
                      >
                        <span className="host-flow-index">{index + 1}</span>
                        <strong>{step}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </aside>

            <section className="host-panel host-stage-panel">{renderStagePanel()}</section>

            <aside className="host-sidebar-col">
              <div className="host-panel host-side-panel">
                <div className="host-panel-content">
                  <div className="host-section-head">
                    <p className="host-section-label">Spieler</p>
                    <span className="host-online-count">{connectedPlayerCount} online</span>
                  </div>
                  <div className="host-player-list">
                    {(lobby?.players ?? []).map((p) => (
                      <div className="host-player-item" key={p.playerId}>
                        <div className="host-player-meta">
                          <div className="host-player-status-dot" data-connected={p.connected} />
                          <span className="host-player-name">{p.name}</span>
                        </div>
                        <span className="host-player-score">{p.score}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="host-card">
                <p className="host-section-label">Handy-Controller</p>
                <label className="host-toggle-row">
                  <input
                    checked={showAnswerTextOnPlayerDevices}
                    disabled={screen !== "lobby"}
                    onChange={(event) => handleAnswerTextSettingChange(event.target.checked)}
                    type="checkbox"
                  />
                  <span className="host-toggle-track" />
                  <span className="host-toggle-copy">
                    <strong>Antworttexte auf Handys</strong>
                    <small>{showAnswerTextOnPlayerDevices ? "An" : "Aus"}</small>
                  </span>
                </label>
              </div>
            </aside>
          </section>

          <footer className="host-controls">
            <div className="host-control-info">
              <div className="host-control-metric">
                <span className="host-control-label">Status</span>
                <span className="host-control-value">
                  {screen === "finished"
                    ? "Beendet"
                    : screen === "lobby"
                      ? "Lobby offen"
                      : "Quiz läuft"}
                </span>
              </div>
              <div className="host-control-metric">
                <span className="host-control-label">Fortschritt</span>
                <span className="host-control-value">
                  {effectiveTotalQuestionCount
                    ? `Frage ${visibleQuestionNumber} / ${effectiveTotalQuestionCount}`
                    : "Warten..."}
                </span>
                <div className="host-progress-bar host-progress-bar--compact">
                  <div
                    className="host-progress-fill"
                    style={{ width: `${questionProgressPercent}%` }}
                  />
                </div>
              </div>
            </div>
            <button
              className="host-primary-button"
              disabled={isPrimaryDisabled}
              onClick={
                screen === "lobby"
                  ? handleStartGame
                  : screen === "scoreboard"
                    ? handleAdvanceQuestion
                    : handleCreateRoom
              }
              type="button"
            >
              {primaryActionLabel}
            </button>
          </footer>
        </>
      ) : null}
    </main>
  );
}

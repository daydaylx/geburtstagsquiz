import { useEffect, useEffectEvent, useRef, useState } from "react";
import QRCode from "qrcode";

import {
  EVENTS,
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
import { GameState, QuestionType, RoomState } from "@quiz/shared-types";
import { getReconnectDelay, getWebSocketProtocol, isLoopbackHostname } from "@quiz/shared-utils";

import {
  clearDisplayStoredSession,
  loadDisplayStoredSession,
  saveDisplayStoredSession,
  type DisplayStoredSession,
} from "./storage.js";

type ConnectionState = "connecting" | "connected" | "reconnecting";
type DisplayScreen = "setup" | "lobby" | "question" | "reveal" | "scoreboard" | "finished";
type DisplayShowLevel = "minimal" | "normal" | "high";

interface DisplayRoomInfo {
  roomId: string;
  joinCode: string;
  hostToken: string;
  displaySessionId: string;
  displayToken: string;
}

const CONFETTI_COLORS = ["#ff6b6b", "#ffd500", "#00d4ff", "#00e676", "#c061cb"];

function getViteEnv(name: string): string | undefined {
  return (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.[name];
}

function getPublicHost(): string {
  return getViteEnv("VITE_PUBLIC_HOST") ?? window.location.hostname;
}

function applyFallbackUiOrigin(
  url: URL,
  targetSubdomain: "host" | "play",
  portEnvName: string,
  defaultLocalPort: string,
): void {
  url.hostname = getPublicHost();

  const explicitPort = getViteEnv(portEnvName);
  if (explicitPort) {
    url.port = explicitPort;
    return;
  }

  if (isLoopbackHostname(url.hostname)) {
    url.port = defaultLocalPort;
    return;
  }

  const labels = url.hostname.split(".");
  if (labels.length > 2 && ["tv", "host", "play"].includes(labels[0])) {
    url.hostname = [targetSubdomain, ...labels.slice(1)].join(".");
  }
  url.port = "";
}

function getServerSocketUrl(): string {
  const envUrl = getViteEnv("VITE_SERVER_SOCKET_URL");
  if (envUrl) return envUrl;

  const url = new URL("/ws", window.location.href);
  url.protocol = getWebSocketProtocol(window.location.protocol);
  return url.toString();
}

function getPlayerJoinUrl(joinCode: string): string {
  const envUrl = getViteEnv("VITE_PLAYER_JOIN_BASE_URL");
  if (envUrl) {
    const url = new URL(envUrl);
    url.searchParams.set("joinCode", joinCode);
    return url.toString();
  }

  const url = new URL(window.location.href);
  applyFallbackUiOrigin(url, "play", "VITE_PLAYER_PORT", "5174");
  url.pathname = "/";
  url.search = new URLSearchParams({ joinCode }).toString();
  return url.toString();
}

function getHostJoinUrl(hostToken: string): string {
  const envUrl = getViteEnv("VITE_HOST_URL");
  if (envUrl) {
    const url = new URL(envUrl);
    url.searchParams.set("hostToken", hostToken);
    return url.toString();
  }

  const url = new URL(window.location.href);
  applyFallbackUiOrigin(url, "host", "VITE_HOST_PORT", "5173");
  url.pathname = "/";
  url.search = new URLSearchParams({ hostToken }).toString();
  return url.toString();
}

function getConnectionLabel(state: ConnectionState): string {
  switch (state) {
    case "connecting":
      return "Verbinde...";
    case "reconnecting":
      return "Neuverbindung...";
    case "connected":
      return "Online";
  }
}

function getQuestionTypeLabel(type: QuestionType): string {
  switch (type) {
    case QuestionType.MultipleChoice:
      return "Auswahlfrage";
    case QuestionType.Logic:
      return "Logikfrage";
    case QuestionType.Estimate:
      return "Schätzfrage";
    case QuestionType.MajorityGuess:
      return "Mehrheitsfrage";
    case QuestionType.Ranking:
      return "Reihenfrage";
    case QuestionType.OpenText:
      return "Freitextfrage";
    default:
      return "";
  }
}

export function App() {
  const initialSession = loadDisplayStoredSession();

  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [screen, setScreen] = useState<DisplayScreen>("setup");
  const [roomInfo, setRoomInfo] = useState<DisplayRoomInfo | null>(null);
  const [hostPaired, setHostPaired] = useState(false);
  const [lobby, setLobby] = useState<LobbyUpdatePayload | null>(null);
  const [playerQrUrl, setPlayerQrUrl] = useState<string | null>(null);
  const [hostQrUrl, setHostQrUrl] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);

  const [question, setQuestion] = useState<QuestionShowPayload | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [answerProgress, setAnswerProgress] = useState<AnswerProgressPayload | null>(null);
  const [revealedAnswer, setRevealedAnswer] = useState<
    QuestionRevealPayload["correctAnswer"] | null
  >(null);
  const [revealExplanation, setRevealExplanation] = useState<string | null>(null);
  const [roundResults, setRoundResults] = useState<QuestionRevealPayload["playerResults"]>([]);
  const [scoreboard, setScoreboard] = useState<ScoreUpdatePayload | null>(null);
  const [scoreChanges, setScoreChanges] = useState<ScoreUpdatePayload["scoreChanges"]>([]);
  const [nextQuestionReadyProgress, setNextQuestionReadyProgress] =
    useState<NextQuestionReadyProgressPayload | null>(null);
  const [finalResult, setFinalResult] = useState<GameFinishedPayload | null>(null);
  const [preCountdown, setPreCountdown] = useState<number | null>(null);
  const [displayShowLevel, setDisplayShowLevel] = useState<DisplayShowLevel>("high");

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const shouldReconnectRef = useRef(true);
  const displaySessionRef = useRef<DisplayStoredSession | null>(initialSession);
  const preCountdownTimerRef = useRef<number | null>(null);

  const clearReconnectTimer = useEffectEvent(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  });

  const updateStoredSession = useEffectEvent((session: DisplayStoredSession | null) => {
    displaySessionRef.current = session;
    if (session) saveDisplayStoredSession(session);
    else clearDisplayStoredSession();
  });

  const resetToSetup = useEffectEvent(() => {
    if (preCountdownTimerRef.current !== null) {
      clearInterval(preCountdownTimerRef.current);
      preCountdownTimerRef.current = null;
    }
    setPreCountdown(null);
    setScreen("setup");
    setRoomInfo(null);
    setHostPaired(false);
    setLobby(null);
    setPlayerQrUrl(null);
    setHostQrUrl(null);
    setIsCreatingRoom(false);
    setQuestion(null);
    setRemainingMs(0);
    setAnswerProgress(null);
    setRevealedAnswer(null);
    setRevealExplanation(null);
    setRoundResults([]);
    setScoreboard(null);
    setScoreChanges([]);
    setNextQuestionReadyProgress(null);
    setFinalResult(null);
    setDisplayShowLevel("high");
    displaySessionRef.current = null;
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

  const scheduleReconnect = useEffectEvent(() => {
    if (!shouldReconnectRef.current) return;
    clearReconnectTimer();
    const delay = getReconnectDelay(reconnectAttemptRef.current);
    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectAttemptRef.current += 1;
      connectSocket();
    }, delay);
  });

  const generateQrCodes = useEffectEvent((joinCode: string, hostToken: string) => {
    QRCode.toDataURL(getPlayerJoinUrl(joinCode), { margin: 1, width: 400 }).then((url) =>
      setPlayerQrUrl(url),
    );
    QRCode.toDataURL(getHostJoinUrl(hostToken), { margin: 1, width: 400 }).then((url) =>
      setHostQrUrl(url),
    );
  });

  const handleServerMessage = useEffectEvent((rawMessage: string) => {
    const parsedEnvelope = parseServerToClientEnvelope(rawMessage);
    if (!parsedEnvelope.success) return;

    switch (parsedEnvelope.data.event) {
      case EVENTS.CONNECTION_ACK: {
        reconnectAttemptRef.current = 0;
        setConnectionState("connected");
        const stored = displaySessionRef.current;
        if (stored) {
          sendClientEvent(EVENTS.CONNECTION_RESUME, {
            roomId: stored.roomId,
            sessionId: stored.displaySessionId,
          });
        }
        return;
      }

      case EVENTS.CONNECTION_RESUMED: {
        const payload = parsedEnvelope.data.payload;
        if (payload.role !== "display") return;

        updateStoredSession({
          roomId: payload.roomId,
          displaySessionId: payload.sessionId,
          displayToken: displaySessionRef.current?.displayToken ?? "",
        });

        if (displaySessionRef.current) {
          const stored = displaySessionRef.current;
          const info: DisplayRoomInfo = {
            roomId: payload.roomId,
            joinCode: payload.joinCode,
            hostToken: "",
            displaySessionId: payload.sessionId,
            displayToken: stored.displayToken,
          };
          setRoomInfo(info);
          generateQrCodes(payload.joinCode, "");
        }

        if (payload.roomState === RoomState.Waiting) {
          setScreen("lobby");
        } else if (payload.roomState === RoomState.Completed) {
          setScreen("finished");
        } else if (payload.gameState === GameState.Revealing) {
          setScreen("reveal");
        } else if (payload.gameState === GameState.Scoreboard) {
          setScreen("scoreboard");
        } else {
          setScreen("question");
        }
        return;
      }

      case EVENTS.DISPLAY_ROOM_CREATED: {
        const payload = parsedEnvelope.data.payload;
        const session: DisplayStoredSession = {
          roomId: payload.roomId,
          displaySessionId: payload.displaySessionId,
          displayToken: payload.displayToken,
        };
        updateStoredSession(session);

        setRoomInfo({
          roomId: payload.roomId,
          joinCode: payload.joinCode,
          hostToken: payload.hostToken,
          displaySessionId: payload.displaySessionId,
          displayToken: payload.displayToken,
        });
        setIsCreatingRoom(false);
        generateQrCodes(payload.joinCode, payload.hostToken);
        setScreen("lobby");
        return;
      }

      case EVENTS.DISPLAY_HOST_PAIRED: {
        setHostPaired(true);
        return;
      }

      case EVENTS.LOBBY_UPDATE: {
        setLobby(parsedEnvelope.data.payload);
        return;
      }

      case EVENTS.GAME_STARTED: {
        const payload = parsedEnvelope.data.payload;
        setDisplayShowLevel(payload.resolvedGamePlan.displayShowLevel);
        setQuestion(null);
        setAnswerProgress(null);
        setRevealedAnswer(null);
        setRevealExplanation(null);
        setRoundResults([]);
        setScoreboard(null);
        setScoreChanges([]);
        setNextQuestionReadyProgress(null);
        return;
      }

      case EVENTS.QUESTION_COUNTDOWN: {
        const { countdownMs } = parsedEnvelope.data.payload;
        const startSeconds = Math.min(3, Math.round(countdownMs / 1000));
        if (startSeconds < 1) return;
        if (preCountdownTimerRef.current !== null) {
          clearInterval(preCountdownTimerRef.current);
        }
        setPreCountdown(startSeconds);
        let current = startSeconds - 1;
        const id = window.setInterval(() => {
          if (current > 0) {
            setPreCountdown(current);
            current -= 1;
          } else {
            setPreCountdown(0);
            clearInterval(id);
            preCountdownTimerRef.current = null;
          }
        }, 1000);
        preCountdownTimerRef.current = id;
        return;
      }

      case EVENTS.QUESTION_SHOW: {
        if (preCountdownTimerRef.current !== null) {
          clearInterval(preCountdownTimerRef.current);
          preCountdownTimerRef.current = null;
        }
        setPreCountdown(null);
        setQuestion(parsedEnvelope.data.payload);
        setRemainingMs(parsedEnvelope.data.payload.durationMs);
        setAnswerProgress(null);
        setRevealedAnswer(null);
        setRevealExplanation(null);
        setRoundResults([]);
        setScoreboard(null);
        setScoreChanges([]);
        setNextQuestionReadyProgress(null);
        setScreen("question");
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
        const payload = parsedEnvelope.data.payload;
        setRevealedAnswer(payload.correctAnswer);
        setRevealExplanation(payload.explanation ?? null);
        setRoundResults(payload.playerResults);
        setScreen("reveal");
        return;
      }

      case EVENTS.SCORE_UPDATE: {
        const payload = parsedEnvelope.data.payload;
        setScoreboard(payload);
        setScoreChanges(payload.scoreChanges);
        setScreen("scoreboard");
        return;
      }

      case EVENTS.NEXT_QUESTION_READY_PROGRESS: {
        setNextQuestionReadyProgress(parsedEnvelope.data.payload);
        return;
      }

      case EVENTS.GAME_FINISHED: {
        setFinalResult(parsedEnvelope.data.payload);
        setScreen("finished");
        return;
      }

      case EVENTS.ROOM_CLOSED: {
        updateStoredSession(null);
        resetToSetup();
        return;
      }

      case EVENTS.ERROR_PROTOCOL: {
        const payload = parsedEnvelope.data.payload;
        setIsCreatingRoom(false);
        setNotice(payload.message);
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
      if (preCountdownTimerRef.current !== null) {
        clearInterval(preCountdownTimerRef.current);
      }
      socketRef.current?.close();
    };
  }, []);

  const handleCreateRoom = useEffectEvent(() => {
    if (isCreatingRoom || connectionState !== "connected") return;
    setIsCreatingRoom(true);
    setNotice(null);
    const sent = sendClientEvent(EVENTS.DISPLAY_CREATE_ROOM, {});
    if (!sent) {
      setIsCreatingRoom(false);
      setNotice("Keine Verbindung zum Server.");
    }
  });

  const timerSeconds = Math.ceil(remainingMs / 1000);
  const isTimerUrgent = remainingMs > 0 && timerSeconds <= 5;
  const isTimerWarning = remainingMs > 0 && timerSeconds <= 10 && timerSeconds > 5;

  const correctCount = roundResults.filter((r) => r.isCorrect).length;
  const wrongCount = roundResults.filter((r) => !r.isCorrect && r.answer !== null).length;
  const noneCount = roundResults.filter((r) => r.answer === null).length;

  const optionCounts = new Map<string, number>();
  for (const r of roundResults) {
    if (r.answer?.type === "option") {
      optionCounts.set(r.answer.value, (optionCounts.get(r.answer.value) ?? 0) + 1);
    }
  }

  return (
    <div className="display-shell">
      <div className="display-topbar">
        <span className="display-brand">Quiz Display</span>
        <span className="display-conn" data-state={connectionState}>
          {getConnectionLabel(connectionState)}
        </span>
      </div>

      <div className="display-main">
        {/* Pre-question countdown overlay */}
        {preCountdown !== null && displayShowLevel === "high" && (
          <div className="display-pre-countdown" aria-live="assertive">
            <div className="display-countdown-number" key={preCountdown}>
              {preCountdown === 0 ? "Los!" : preCountdown}
            </div>
          </div>
        )}

        {screen === "setup" && (
          <div className="display-setup">
            <h1>Quiz Display</h1>
            <button
              className="display-create-btn"
              disabled={isCreatingRoom || connectionState !== "connected"}
              onClick={handleCreateRoom}
              type="button"
            >
              {isCreatingRoom ? "Erstelle Raum..." : "Quizraum erstellen"}
            </button>
            {notice && <p className="display-notice">{notice}</p>}
          </div>
        )}

        {screen === "lobby" && roomInfo && (
          <div
            className={`display-lobby ${hostPaired ? "display-lobby--host-paired" : "display-lobby--pre-host"}`}
          >
            <div className={`display-qr-block${hostPaired ? " display-qr-block--primary" : ""}`}>
              <h2>Spieler scannen</h2>
              {playerQrUrl && <img src={playerQrUrl} alt="Player-QR-Code" />}
              <code className="display-join-code">{roomInfo.joinCode}</code>
            </div>

            {!hostPaired && (
              <div className="display-qr-block display-qr-block--host">
                <h2>Host scannen</h2>
                {hostQrUrl && <img src={hostQrUrl} alt="Host-QR-Code" />}
                <p className="display-host-pending">Host noch nicht verbunden</p>
              </div>
            )}

            {hostPaired && (
              <div className="display-host-connected">
                <span className="display-host-connected-dot" aria-hidden="true" />
                Host verbunden
              </div>
            )}

            <div className="display-player-count">
              <span className="display-player-count-number">{lobby?.playerCount ?? 0}</span> Spieler
            </div>
          </div>
        )}

        {screen === "question" && question && (
          <div className="display-question">
            <div className="display-question-meta">
              Frage {question.questionIndex + 1} / {question.totalQuestionCount}
              <span className="display-question-type">
                {" · "}
                {getQuestionTypeLabel(question.type)}
              </span>
            </div>
            <h2 className="display-question-text">{question.text}</h2>

            {"options" in question && (
              <div className="display-options">
                {question.options.map((opt) => (
                  <div key={opt.id} className="display-option">
                    <span className="display-option-label">{opt.label}</span>
                  </div>
                ))}
              </div>
            )}

            {"items" in question && (
              <div className="display-options">
                {question.items.map((item) => (
                  <div key={item.id} className="display-option">
                    <span className="display-option-label">{item.label}</span>
                  </div>
                ))}
              </div>
            )}

            {question.type === QuestionType.Estimate && (
              <p className="display-estimate-context">
                {question.context} ({question.unit})
              </p>
            )}

            {question.type === QuestionType.OpenText && (
              <p className="display-estimate-context">Freitextantwort</p>
            )}

            <div className="display-footer">
              <div
                className="display-timer"
                data-urgent={isTimerUrgent ? "true" : undefined}
                data-warning={isTimerWarning ? "true" : undefined}
              >
                {remainingMs > 0 ? `${timerSeconds}s` : "—"}
              </div>
              {answerProgress && (
                <div className="display-answer-progress">
                  <span>
                    {answerProgress.answeredCount} / {answerProgress.totalEligiblePlayers}{" "}
                    geantwortet
                  </span>
                  {answerProgress.totalEligiblePlayers > 0 && (
                    <div className="display-progress-bar">
                      <div
                        className="display-progress-fill"
                        style={{
                          width: `${(answerProgress.answeredCount / answerProgress.totalEligiblePlayers) * 100}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {screen === "reveal" && question && (
          <div className="display-reveal">
            <h3 className="display-reveal-question">{question.text}</h3>

            {/* MultipleChoice / Logic / MajorityGuess */}
            {"options" in question && (
              <div className="display-reveal-options">
                {question.options.map((opt) => {
                  const ans = revealedAnswer;
                  const isCorrect =
                    ans !== null &&
                    ((ans.type === "option" && ans.value === opt.id) ||
                      (ans.type === "options" && ans.value.includes(opt.id)));
                  return (
                    <div
                      key={opt.id}
                      className="display-reveal-option"
                      data-correct={ans !== null ? (isCorrect ? "true" : "false") : undefined}
                    >
                      <span className="display-reveal-option-label">{opt.label}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Antwort-Heatmap für Options-Fragen */}
            {"options" in question && roundResults.length > 0 && (
              <div className="display-heatmap">
                {question.options.map((opt) => {
                  const ans = revealedAnswer;
                  const count = optionCounts.get(opt.id) ?? 0;
                  const pct =
                    roundResults.length > 0 ? Math.round((count / roundResults.length) * 100) : 0;
                  const isCorrect =
                    ans !== null &&
                    ((ans.type === "option" && ans.value === opt.id) ||
                      (ans.type === "options" && ans.value.includes(opt.id)));
                  return (
                    <div key={opt.id} className="display-heatmap-row">
                      <span className="display-heatmap-label">{opt.label}</span>
                      <div className="display-heatmap-track">
                        <div
                          className="display-heatmap-fill"
                          data-correct={isCorrect ? "true" : undefined}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="display-heatmap-count">{count}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Ranking — correct order */}
            {"items" in question && revealedAnswer?.type === "ranking" && (
              <ol className="display-reveal-ranking">
                {revealedAnswer.value.map((itemId, pos) => {
                  const item = question.items.find((it) => it.id === itemId);
                  return (
                    <li key={itemId} className="display-reveal-ranking-item">
                      <span className="display-reveal-rank-pos">{pos + 1}.</span>
                      <span>{item?.label ?? itemId}</span>
                    </li>
                  );
                })}
              </ol>
            )}

            {/* Estimate — correct value */}
            {question.type === QuestionType.Estimate && revealedAnswer?.type === "number" && (
              <div className="display-reveal-estimate">
                <div className="display-reveal-estimate-main">
                  <span className="display-reveal-estimate-value">{revealedAnswer.value}</span>
                  <span className="display-reveal-estimate-unit">{question.unit}</span>
                </div>
                <p className="display-reveal-estimate-context">{question.context}</p>
              </div>
            )}

            {/* OpenText — correct text */}
            {question.type === QuestionType.OpenText && (
              <div className="display-reveal-text-answer">
                {revealedAnswer?.type === "text"
                  ? revealedAnswer.value
                  : revealedAnswer?.type === "options"
                    ? revealedAnswer.value[0]
                    : ""}
              </div>
            )}

            {revealExplanation && <p className="display-explanation">{revealExplanation}</p>}

            <div className="display-reveal-stats">
              <span className="display-reveal-stat display-reveal-stat--correct">
                ✓ {correctCount} richtig
              </span>
              <span className="display-reveal-stat display-reveal-stat--wrong">
                ✗ {wrongCount} falsch
              </span>
              <span className="display-reveal-stat">— {noneCount} keine</span>
            </div>
          </div>
        )}

        {screen === "scoreboard" && scoreboard && (
          <div className="display-scoreboard">
            <h2>Zwischenstand</h2>
            <ol className="display-scoreboard-list">
              {scoreboard.scoreboard.slice(0, 8).map((entry, i) => {
                const change = scoreChanges.find((c) => c.playerId === entry.playerId);
                const rankDelta = change ? change.previousRank - change.rank : 0;
                return (
                  <li key={entry.playerId} className="display-scoreboard-entry" data-rank={i + 1}>
                    <span className="display-rank">{i + 1}.</span>
                    {rankDelta !== 0 && (
                      <span
                        className="display-rank-change"
                        data-direction={rankDelta > 0 ? "up" : "down"}
                      >
                        {rankDelta > 0 ? `▲${rankDelta}` : `▼${Math.abs(rankDelta)}`}
                      </span>
                    )}
                    <span className="display-name">{entry.name}</span>
                    {change && change.delta > 0 && (
                      <span className="display-score-delta">+{change.delta}</span>
                    )}
                    <span className="display-score">{entry.score}</span>
                  </li>
                );
              })}
            </ol>
            {nextQuestionReadyProgress &&
              (() => {
                const { readyCount, totalEligiblePlayers } = nextQuestionReadyProgress;
                const allReady = totalEligiblePlayers > 0 && readyCount >= totalEligiblePlayers;
                const pct =
                  totalEligiblePlayers > 0
                    ? Math.round((readyCount / totalEligiblePlayers) * 100)
                    : 0;
                return (
                  <div
                    className="display-ready-block"
                    data-all-ready={allReady ? "true" : undefined}
                  >
                    <div className="display-ready-label">
                      {allReady ? "Alle bereit!" : `${readyCount} / ${totalEligiblePlayers} bereit`}
                    </div>
                    <div className="display-ready-track">
                      <div className="display-ready-fill" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })()}
          </div>
        )}

        {screen === "finished" && finalResult && (
          <div className="display-finished">
            <h1>Quiz beendet!</h1>

            <div className="display-podium">
              {[1, 0, 2].map((rankIndex) => {
                const entry = finalResult.finalScoreboard[rankIndex];
                if (!entry) return null;
                return (
                  <div
                    key={rankIndex}
                    className={`display-podium-entry display-podium-entry--${rankIndex + 1}`}
                  >
                    <div className="display-podium-rank-badge">{rankIndex + 1}</div>
                    <div className="display-podium-name">{entry.name}</div>
                    <div className="display-podium-score">{entry.score} Pkt</div>
                  </div>
                );
              })}
            </div>

            {finalResult.finalScoreboard.length > 3 && (
              <ol className="display-scoreboard-list">
                {finalResult.finalScoreboard.slice(3, 8).map((entry, i) => (
                  <li key={entry.playerId} className="display-scoreboard-entry" data-rank={i + 4}>
                    <span className="display-rank">{i + 4}.</span>
                    <span className="display-name">{entry.name}</span>
                    <span className="display-score">{entry.score}</span>
                  </li>
                ))}
              </ol>
            )}

            {finalResult.finalStats && (
              <div className="display-final-stats">
                {finalResult.finalStats.mostCorrect && (
                  <div className="display-final-stat">
                    <span className="display-final-stat-label">Meiste richtig</span>
                    <span className="display-final-stat-value">
                      {finalResult.finalStats.mostCorrect.name} ·{" "}
                      {finalResult.finalStats.mostCorrect.count}×
                    </span>
                  </div>
                )}
                {finalResult.finalStats.fastestAnswer && (
                  <div className="display-final-stat">
                    <span className="display-final-stat-label">Schnellste Antwort</span>
                    <span className="display-final-stat-value">
                      {finalResult.finalStats.fastestAnswer.name}
                    </span>
                  </div>
                )}
                {finalResult.finalStats.closestGap && (
                  <div className="display-final-stat">
                    <span className="display-final-stat-label">Knappster Abstand</span>
                    <span className="display-final-stat-value">
                      {finalResult.finalStats.closestGap.points} Punkte
                    </span>
                  </div>
                )}
              </div>
            )}

            {displayShowLevel === "high" && (
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
        )}
      </div>
    </div>
  );
}

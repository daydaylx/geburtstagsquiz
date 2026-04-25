import { useEffect, useEffectEvent, useRef, useState } from "react";

import {
  EVENTS,
  PROTOCOL_ERROR_CODES,
  parseServerToClientEnvelope,
  serializeEnvelope,
  type ClientToServerEventPayloadMap,
  type LobbyUpdatePayload,
  type NextQuestionReadyProgressPayload,
  type QuestionRevealPayload,
  type QuestionControllerPayload,
  type ScoreUpdatePayload,
  type GameFinishedPayload,
  type ConnectionResumedPayload,
} from "@quiz/shared-protocol";
import { GameState, QuestionType } from "@quiz/shared-types";
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

function getInitialJoinCode(storedSession: PlayerStoredSession | null): string {
  const queryJoinCode = new URLSearchParams(window.location.search).get("joinCode");
  return normalizeJoinCode(queryJoinCode ?? storedSession?.joinCode ?? "");
}

function getConnectionLabel(connectionState: ConnectionState): string {
  switch (connectionState) {
    case "connecting":
      return "Verbinde...";
    case "reconnecting":
      return "Re-connect...";
    case "connected":
      return "Online";
    default:
      return "Offline";
  }
}

function getProtocolErrorMessage(code: string, fallback: string): string {
  switch (code) {
    case PROTOCOL_ERROR_CODES.ROOM_NOT_FOUND:
      return "Raum nicht gefunden. Bitte Code prüfen.";
    case PROTOCOL_ERROR_CODES.ROOM_CLOSED:
      return "Der Raum nimmt keine Spieler mehr an.";
    case PROTOCOL_ERROR_CODES.SESSION_NOT_FOUND:
      return "Deine alte Sitzung ist abgelaufen. Bitte neu beitreten.";
    case PROTOCOL_ERROR_CODES.INVALID_PAYLOAD:
      return "Eingabe ungültig. Bitte prüfen und erneut versuchen.";
    case PROTOCOL_ERROR_CODES.INVALID_STATE:
      return "Diese Aktion passt gerade nicht zum Spielstand.";
    default:
      return fallback;
  }
}

function getQuestionKindLabel(type: QuestionType): string {
  switch (type) {
    case QuestionType.Estimate:
      return "Schätzfrage";
    case QuestionType.MajorityGuess:
      return "Mehrheitsfrage";
    case QuestionType.Ranking:
      return "Reihenfolge";
    case QuestionType.Logic:
      return "Denkfrage";
    default:
      return "Frage";
  }
}

function formatControllerAnswer(
  answer: QuestionRevealPayload["correctAnswer"] | null | undefined,
  unit?: string,
): string {
  if (!answer) return "-";
  if (answer.type === "option") return answer.value;
  if (answer.type === "number") return `${answer.value}${unit ? ` ${unit}` : ""}`;
  return answer.value.join(" > ");
}

export function App() {
  const initialSession = loadPlayerStoredSession();

  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [notice, setNotice] = useState<PlayerNotice | null>(null);
  const [joinCode, setJoinCode] = useState(getInitialJoinCode(initialSession));
  const [playerName, setPlayerName] = useState(initialSession?.playerName ?? "");
  const [lobby, setLobby] = useState<LobbyUpdatePayload | null>(null);
  const [roomId, setRoomId] = useState<string | null>(initialSession?.roomId ?? null);
  const [isJoining, setIsJoining] = useState(false);

  const [screen, setScreen] = useState<PlayerScreen>(initialSession ? "lobby" : "join");
  const [question, setQuestion] = useState<QuestionControllerPayload | null>(null);
  const [remainingMs, setRemainingMs] = useState<number>(0);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [estimateValue, setEstimateValue] = useState<string>("");
  const [rankingOrder, setRankingOrder] = useState<string[]>([]);
  const [answerStatus, setAnswerStatus] = useState<AnswerStatus>("idle");
  const [correctAnswer, setCorrectAnswer] = useState<QuestionRevealPayload["correctAnswer"] | null>(
    null,
  );
  const [roundResults, setRoundResults] = useState<QuestionRevealPayload["playerResults"]>([]);
  const [scoreboard, setScoreboard] = useState<ScoreUpdatePayload | null>(null);
  const [nextQuestionReadyProgress, setNextQuestionReadyProgress] =
    useState<NextQuestionReadyProgressPayload | null>(null);
  const [finalResult, setFinalResult] = useState<GameFinishedPayload | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const shouldReconnectRef = useRef(true);
  const playerSessionRef = useRef<PlayerStoredSession | null>(initialSession);
  const lastJoinAttemptRef = useRef<JoinAttempt | null>(null);
  const resumedAnswerRef = useRef<ConnectionResumedPayload["currentAnswer"] | null>(null);
  const intentionalReconnectRef = useRef(false);

  const clearReconnectTimer = useEffectEvent(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  });

  const updateStoredSession = useEffectEvent((session: PlayerStoredSession | null) => {
    playerSessionRef.current = session;
    if (session) savePlayerStoredSession(session);
    else clearPlayerStoredSession();
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
    setRoundResults([]);
    setScoreboard(null);
    setNextQuestionReadyProgress(null);
    setFinalResult(null);
    setEstimateValue("");
    setRankingOrder([]);
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

  const handleSubmitAnswer = useEffectEvent((optionId: string) => {
    const session = playerSessionRef.current;
    if (!session || !question || answerStatus !== "idle") return;
    setNotice(null);
    setSelectedOptionId(optionId);
    setAnswerStatus("submitting");
    const sent = sendClientEvent(EVENTS.ANSWER_SUBMIT, {
      roomId: session.roomId,
      questionId: question.questionId,
      playerId: session.playerId,
      answer: { type: "option", value: optionId },
      requestId: crypto.randomUUID(),
    });

    if (!sent) {
      setAnswerStatus("idle");
      setNotice({ kind: "error", text: "Keine Verbindung zum Server." });
    }
  });

  const handleSubmitEstimate = useEffectEvent((value: number) => {
    const session = playerSessionRef.current;
    if (!session || !question || answerStatus !== "idle") return;
    setNotice(null);
    setAnswerStatus("submitting");
    const sent = sendClientEvent(EVENTS.ANSWER_SUBMIT, {
      roomId: session.roomId,
      questionId: question.questionId,
      playerId: session.playerId,
      answer: { type: "number", value },
      requestId: crypto.randomUUID(),
    });

    if (!sent) {
      setAnswerStatus("idle");
      setNotice({ kind: "error", text: "Keine Verbindung zum Server." });
    }
  });

  const handleSubmitRanking = useEffectEvent((order: string[]) => {
    const session = playerSessionRef.current;
    if (!session || !question || answerStatus !== "idle") return;
    setNotice(null);
    setAnswerStatus("submitting");
    const sent = sendClientEvent(EVENTS.ANSWER_SUBMIT, {
      roomId: session.roomId,
      questionId: question.questionId,
      playerId: session.playerId,
      answer: { type: "ranking", value: order },
      requestId: crypto.randomUUID(),
    });

    if (!sent) {
      setAnswerStatus("idle");
      setNotice({ kind: "error", text: "Keine Verbindung zum Server." });
    }
  });

  const handleReadyForNextQuestion = useEffectEvent(() => {
    const session = playerSessionRef.current;
    if (!session || !scoreboard) return;
    sendClientEvent(EVENTS.NEXT_QUESTION_READY, {
      roomId: session.roomId,
      questionId: scoreboard.questionId,
      playerId: session.playerId,
    });
  });

  const handleServerMessage = useEffectEvent((rawMessage: string) => {
    const parsedEnvelope = parseServerToClientEnvelope(rawMessage);
    if (!parsedEnvelope.success) return;

    switch (parsedEnvelope.data.event) {
      case EVENTS.CONNECTION_ACK:
        reconnectAttemptRef.current = 0;
        intentionalReconnectRef.current = false;
        setConnectionState("connected");
        if (playerSessionRef.current) {
          sendClientEvent(EVENTS.CONNECTION_RESUME, {
            roomId: playerSessionRef.current.roomId,
            sessionId: playerSessionRef.current.sessionId,
          });
        }
        return;

      case EVENTS.PLAYER_JOINED:
        const joinAttempt = lastJoinAttemptRef.current;
        if (!joinAttempt) return;
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
        return;

      case EVENTS.CONNECTION_RESUMED:
        if (parsedEnvelope.data.payload.role !== "player") return;
        const resumedPayload = parsedEnvelope.data.payload as ConnectionResumedPayload;
        const resumedPlayerName =
          playerSessionRef.current?.playerName ?? normalizePlayerName(playerName);
        updateStoredSession({
          roomId: resumedPayload.roomId,
          sessionId: resumedPayload.sessionId,
          playerId: resumedPayload.playerId ?? playerSessionRef.current?.playerId ?? "",
          playerName: resumedPlayerName,
          joinCode: resumedPayload.joinCode,
        });
        resumedAnswerRef.current = resumedPayload.currentAnswer ?? null;
        setRoomId(resumedPayload.roomId);
        setJoinCode(resumedPayload.joinCode);
        setPlayerName(resumedPlayerName);
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

      case EVENTS.LOBBY_UPDATE:
        setLobby(parsedEnvelope.data.payload);
        return;

      case EVENTS.QUESTION_CONTROLLER:
        const resumedAnswer = resumedAnswerRef.current;
        setQuestion(parsedEnvelope.data.payload);
        setRemainingMs(parsedEnvelope.data.payload.durationMs);
        setSelectedOptionId(resumedAnswer?.type === "option" ? resumedAnswer.value : null);
        setEstimateValue(resumedAnswer?.type === "number" ? String(resumedAnswer.value) : "");
        setRankingOrder(resumedAnswer?.type === "ranking" ? resumedAnswer.value : []);
        setAnswerStatus(resumedAnswer ? "accepted" : "idle");
        setCorrectAnswer(null);
        setRoundResults([]);
        setScoreboard(null);
        setNextQuestionReadyProgress(null);
        setScreen("question");
        resumedAnswerRef.current = null;
        return;

      case EVENTS.QUESTION_TIMER:
        setRemainingMs(parsedEnvelope.data.payload.remainingMs);
        return;

      case EVENTS.ANSWER_ACCEPTED:
        setNotice(null);
        setAnswerStatus("accepted");
        return;

      case EVENTS.ANSWER_REJECTED:
        switch (parsedEnvelope.data.payload.reason) {
          case "duplicate":
            setAnswerStatus("accepted");
            setNotice({ kind: "info", text: "Antwort war bereits gespeichert." });
            return;
          case "late":
          case "invalid_state":
            setAnswerStatus("locked");
            setNotice({ kind: "error", text: "Antwort kam zu spät." });
            return;
          case "invalid_payload":
            setAnswerStatus("idle");
            setNotice({ kind: "error", text: "Antwort ungültig. Bitte erneut versuchen." });
            return;
          case "unauthorized":
            setAnswerStatus("rejected");
            setNotice({ kind: "error", text: "Antwort wurde nicht angenommen." });
            return;
        }
        return;

      case EVENTS.QUESTION_CLOSE:
        setRemainingMs(0);
        setAnswerStatus((curr) => (curr === "idle" || curr === "submitting" ? "locked" : curr));
        return;

      case EVENTS.QUESTION_REVEAL:
        setCorrectAnswer(parsedEnvelope.data.payload.correctAnswer);
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
        updateStoredSession(null);
        resetToJoin();
        setNotice({ kind: "info", text: "Raum geschlossen. Bitte neu beitreten." });
        return;

      case EVENTS.ERROR_PROTOCOL: {
        const error = parsedEnvelope.data.payload;
        setIsJoining(false);
        setNotice({ kind: "error", text: getProtocolErrorMessage(error.code, error.message) });

        if (error.context.event === EVENTS.ANSWER_SUBMIT) {
          setAnswerStatus(error.code === PROTOCOL_ERROR_CODES.INVALID_PAYLOAD ? "idle" : "locked");
        }

        if (
          error.code === PROTOCOL_ERROR_CODES.ROOM_NOT_FOUND ||
          error.code === PROTOCOL_ERROR_CODES.ROOM_CLOSED ||
          error.code === PROTOCOL_ERROR_CODES.SESSION_NOT_FOUND
        ) {
          updateStoredSession(null);
          resetToJoin();
        }
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
      socketRef.current?.close();
    };
  }, []);

  const handleJoin = useEffectEvent(() => {
    const njc = normalizeJoinCode(joinCode);
    const npn = normalizePlayerName(playerName);
    setJoinCode(njc);
    setPlayerName(npn);
    setNotice(null);

    if (njc.length !== 6 || npn.length === 0) {
      setIsJoining(false);
      setNotice({ kind: "error", text: "Bitte Raumcode und Namen prüfen." });
      return;
    }

    setIsJoining(true);
    lastJoinAttemptRef.current = { joinCode: njc, playerName: npn };
    const sent = sendClientEvent(EVENTS.ROOM_JOIN, {
      joinCode: njc,
      playerName: npn,
      sessionId: null,
    });

    if (!sent) {
      setIsJoining(false);
      setNotice({ kind: "error", text: "Keine Verbindung zum Server." });
    }
  });

  const playerSession = playerSessionRef.current;
  const ownPlayerId = playerSession?.playerId ?? "";
  const timerSeconds = Math.ceil((remainingMs ?? 0) / 1000);
  const isTimerWarning = remainingMs > 0 && timerSeconds <= 10;
  const isTimerUrgent = remainingMs > 0 && timerSeconds <= 5;
  const ownRoundResult = roundResults.find((r) => r.playerId === ownPlayerId) ?? null;
  const selfRevealState = ownRoundResult?.isCorrect
    ? "correct"
    : ownRoundResult?.answer
      ? "wrong"
      : "missing";
  const selfRevealLabel =
    selfRevealState === "correct"
      ? "RICHTIG!"
      : selfRevealState === "wrong"
        ? "LEIDER FALSCH"
        : "KEINE ANTWORT GEWERTET";

  const ownScoreboardPlacement = scoreboard
    ? scoreboard.scoreboard.findIndex((e) => e.playerId === ownPlayerId)
    : -1;
  const ownScoreboardEntry =
    ownScoreboardPlacement >= 0 && scoreboard
      ? scoreboard.scoreboard[ownScoreboardPlacement]
      : null;
  const ownFinalPlacement = finalResult
    ? finalResult.finalScoreboard.findIndex((entry) => entry.playerId === ownPlayerId)
    : -1;
  const isReadyForNext =
    !!ownPlayerId && !!nextQuestionReadyProgress?.readyPlayerIds.includes(ownPlayerId);

  return (
    <main className="player-shell" data-answer-status={answerStatus} data-screen={screen}>
      <header className="player-header">
        <div className="player-status" data-state={connectionState}>
          {getConnectionLabel(connectionState)}
        </div>
        {screen === "question" && remainingMs > 0 && (
          <div
            className="player-timer-mini"
            data-urgent={isTimerUrgent ? "true" : undefined}
            data-warning={isTimerWarning ? "true" : undefined}
          >
            {timerSeconds}s
          </div>
        )}
      </header>

      {notice && (
        <div className="player-notice" data-kind={notice.kind}>
          {notice.text}
        </div>
      )}

      <div className="player-main">
        {screen === "join" && (
          <div className="player-card">
            <span className="player-kicker">Willkommen</span>
            <h1 className="player-title">Mitspielen</h1>
            <div className="player-join-form">
              <input
                autoCapitalize="characters"
                className="player-input"
                maxLength={6}
                onChange={(e) => setJoinCode(normalizeJoinCode(e.target.value))}
                placeholder="Raumcode"
                value={joinCode}
              />
              <input
                autoCapitalize="words"
                className="player-input"
                maxLength={20}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Dein Name"
                value={playerName}
              />
              <button
                className="player-primary-button"
                disabled={isJoining || joinCode.length !== 6 || !playerName}
                onClick={handleJoin}
                type="button"
              >
                {isJoining ? "Beitreten..." : "Los geht's"}
              </button>
            </div>
          </div>
        )}

        {screen === "lobby" && (
          <>
            <div className="player-card">
              <span className="player-kicker">Lobby</span>
              <h1 className="player-title">{playerName || "Spieler"}</h1>
              <p className="player-muted-copy">
                Warte auf den Host. Sobald das Quiz startet, geht es hier automatisch weiter.
              </p>
            </div>
            <div className="player-scoreboard-list">
              <div className="player-scoreboard-item">
                <span>Andere Spieler</span>
                <strong>{lobby?.playerCount ?? 0}</strong>
              </div>
            </div>
          </>
        )}

        {screen === "question" && question && (
          <>
            <div className="player-card player-controller-card" data-status={answerStatus}>
              <span className="player-kicker">
                {getQuestionKindLabel(question.type)} · Frage {question.questionIndex + 1} /{" "}
                {question.totalQuestionCount}
              </span>
              <h2 className="player-controller-title">
                {answerStatus === "accepted"
                  ? "Antwort gespeichert"
                  : "Schau auf den Host-Bildschirm"}
              </h2>
              <p className="player-controller-copy">
                {answerStatus === "accepted"
                  ? "Warte auf die Auflösung."
                  : "Die Frage und Antworttexte stehen vorne auf dem Hauptbildschirm."}
              </p>
              {answerStatus === "submitting" && (
                <div className="player-controller-status">Sende Antwort...</div>
              )}
              {answerStatus === "accepted" && (
                <div className="player-controller-status" data-state="saved">
                  {selectedOptionId && <span>Du hast {selectedOptionId} gewählt.</span>}
                  {!selectedOptionId && estimateValue && (
                    <span>
                      Deine Schätzung: {estimateValue}{" "}
                      {(question.type === QuestionType.Estimate ||
                        question.type === QuestionType.MajorityGuess) &&
                        question.unit}
                    </span>
                  )}
                  {!selectedOptionId && rankingOrder.length > 0 && (
                    <span>Deine Reihenfolge: {rankingOrder.join(" > ")}</span>
                  )}
                </div>
              )}
              {answerStatus === "locked" && (
                <div className="player-controller-status" data-state="locked">
                  Zeit abgelaufen
                </div>
              )}
              {answerStatus === "rejected" && (
                <div className="player-controller-status" data-state="error">
                  Antwort nicht angenommen
                </div>
              )}
            </div>

            {(question.type === QuestionType.MultipleChoice ||
              question.type === QuestionType.Logic) && (
              <div className="player-controller-options" data-status={answerStatus}>
                {question.options.map((opt) => (
                  <button
                    key={opt.id}
                    className="player-controller-option"
                    data-state={selectedOptionId === opt.id ? "selected" : "idle"}
                    disabled={answerStatus !== "idle"}
                    onClick={() => handleSubmitAnswer(opt.id)}
                    type="button"
                  >
                    <span className="player-controller-option-id">{opt.label}</span>
                    {opt.text && <span className="player-controller-option-text">{opt.text}</span>}
                  </button>
                ))}
              </div>
            )}

            {(question.type === QuestionType.Estimate ||
              question.type === QuestionType.MajorityGuess) && (
              <div className="player-estimate-area">
                <input
                  className="player-estimate-input"
                  disabled={answerStatus !== "idle"}
                  onChange={(e) => setEstimateValue(e.target.value)}
                  placeholder={`${question.unit} eingeben...`}
                  step="any"
                  type="number"
                  value={estimateValue}
                />
                <button
                  className="player-primary-button"
                  disabled={answerStatus !== "idle" || estimateValue === ""}
                  onClick={() => handleSubmitEstimate(parseFloat(estimateValue))}
                  type="button"
                >
                  Schätzen
                </button>
              </div>
            )}

            {question.type === QuestionType.Ranking && (
              <div className="player-ranking-area">
                <p className="player-ranking-section-label">
                  Einordnen – tippe in der richtigen Reihenfolge an
                </p>
                <div className="player-ranking-pool">
                  {question.items
                    .filter((item) => !rankingOrder.includes(item.id))
                    .map((item) => (
                      <button
                        key={item.id}
                        className="player-ranking-item"
                        disabled={answerStatus !== "idle"}
                        onClick={() => setRankingOrder([...rankingOrder, item.id])}
                        type="button"
                      >
                        <span>{item.label}</span>
                        {item.text && <small>{item.text}</small>}
                      </button>
                    ))}
                </div>
                {rankingOrder.length > 0 && (
                  <>
                    <p className="player-ranking-section-label">Deine Reihenfolge</p>
                    <div className="player-ranking-chosen">
                      {rankingOrder.map((id, i) => {
                        const item = question.items.find((x) => x.id === id)!;
                        return (
                          <div key={id} className="player-ranking-slot">
                            <span className="player-ranking-pos">{i + 1}.</span>
                            <span>{item.label}</span>
                            {item.text && <small>{item.text}</small>}
                            {answerStatus === "idle" && (
                              <button
                                className="player-ranking-remove"
                                onClick={() =>
                                  setRankingOrder(rankingOrder.filter((x) => x !== id))
                                }
                                type="button"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
                <button
                  className="player-primary-button player-ranking-submit"
                  disabled={rankingOrder.length < question.items.length || answerStatus !== "idle"}
                  onClick={() => handleSubmitRanking(rankingOrder)}
                  type="button"
                >
                  Reihenfolge bestätigen
                </button>
              </div>
            )}
          </>
        )}

        {screen === "reveal" && (
          <>
            <div className="player-feedback" data-state={selfRevealState}>
              {selfRevealLabel}
            </div>
            <div className="player-card">
              <span className="player-kicker">Auflösung</span>
              <h2 className="player-title">Schau auf den Host-Bildschirm</h2>
              <p className="player-points-earned">{ownRoundResult?.pointsEarned ?? 0} Punkte verdient.</p>
              <div className="player-result-lines">
                <div>
                  <span>Deine Antwort</span>
                  <strong>
                    {formatControllerAnswer(
                      ownRoundResult?.answer ?? null,
                      question &&
                        (question.type === QuestionType.Estimate ||
                          question.type === QuestionType.MajorityGuess)
                        ? question.unit
                        : undefined,
                    )}
                  </strong>
                </div>
                <div>
                  <span>Richtig</span>
                  <strong>
                    {formatControllerAnswer(
                      correctAnswer,
                      question &&
                        (question.type === QuestionType.Estimate ||
                          question.type === QuestionType.MajorityGuess)
                        ? question.unit
                        : undefined,
                    )}
                  </strong>
                </div>
              </div>
            </div>
          </>
        )}

        {screen === "scoreboard" && (
          <>
            {ownScoreboardEntry && (
              <div className="player-my-rank">
                <div className="player-my-rank-label">Dein Platz</div>
                <div className="player-my-rank-value">{ownScoreboardPlacement + 1}.</div>
                <div className="player-my-rank-score">{ownScoreboardEntry.score} Punkte</div>
              </div>
            )}
            <div className="player-card">
              <span className="player-kicker">Zwischenstand</span>
              <h2 className="player-title">Gesamtrangliste vorne</h2>
              <p className="player-muted-copy player-muted-copy--compact">
                Warte auf die nächste Frage und schau auf den Host-Bildschirm.
              </p>
            </div>
            <button
              className="player-primary-button player-ready-button"
              disabled={isReadyForNext}
              onClick={handleReadyForNextQuestion}
              type="button"
            >
              {isReadyForNext ? "Warten auf andere..." : "Bereit für nächste Frage"}
            </button>
          </>
        )}

        {screen === "finished" && (
          <div className="player-card player-finished-card">
            <span className="player-kicker">Quiz beendet</span>
            <h1 className="player-title">Vielen Dank!</h1>
            <div className="player-my-rank-value player-final-rank">
              {ownFinalPlacement >= 0 ? `#${ownFinalPlacement + 1}` : "-"}
            </div>
            <button className="player-primary-button" onClick={() => window.location.reload()}>
              Nochmal spielen
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

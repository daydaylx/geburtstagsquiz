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
  type QuestionShowPayload,
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
  const [question, setQuestion] = useState<QuestionShowPayload | null>(null);
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
    setSelectedOptionId(optionId);
    setAnswerStatus("submitting");
    sendClientEvent(EVENTS.ANSWER_SUBMIT, {
      roomId: session.roomId,
      questionId: question.questionId,
      playerId: session.playerId,
      answer: { type: "option", value: optionId },
      requestId: crypto.randomUUID(),
    });
  });

  const handleSubmitEstimate = useEffectEvent((value: number) => {
    const session = playerSessionRef.current;
    if (!session || !question || answerStatus !== "idle") return;
    setAnswerStatus("submitting");
    sendClientEvent(EVENTS.ANSWER_SUBMIT, {
      roomId: session.roomId,
      questionId: question.questionId,
      playerId: session.playerId,
      answer: { type: "number", value },
      requestId: crypto.randomUUID(),
    });
  });

  const handleSubmitRanking = useEffectEvent((order: string[]) => {
    const session = playerSessionRef.current;
    if (!session || !question || answerStatus !== "idle") return;
    setAnswerStatus("submitting");
    sendClientEvent(EVENTS.ANSWER_SUBMIT, {
      roomId: session.roomId,
      questionId: question.questionId,
      playerId: session.playerId,
      answer: { type: "ranking", value: order },
      requestId: crypto.randomUUID(),
    });
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
        resumedAnswerOptionIdRef.current =
          resumedPayload.currentAnswer?.type === "option"
            ? resumedPayload.currentAnswer.value
            : null;
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

      case EVENTS.QUESTION_SHOW:
        setQuestion(parsedEnvelope.data.payload);
        setRemainingMs(parsedEnvelope.data.payload.durationMs);
        setSelectedOptionId(resumedAnswerOptionIdRef.current);
        setEstimateValue("");
        setRankingOrder([]);
        setAnswerStatus(resumedAnswerOptionIdRef.current ? "accepted" : "idle");
        setCorrectAnswer(null);
        setRoundResults([]);
        setScoreboard(null);
        setNextQuestionReadyProgress(null);
        setScreen("question");
        resumedAnswerOptionIdRef.current = null;
        return;

      case EVENTS.QUESTION_TIMER:
        setRemainingMs(parsedEnvelope.data.payload.remainingMs);
        return;

      case EVENTS.ANSWER_ACCEPTED:
        setAnswerStatus("accepted");
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

  const handleJoin = useEffectEvent(() => {
    const njc = normalizeJoinCode(joinCode);
    const npn = normalizePlayerName(playerName);
    setJoinCode(njc);
    setPlayerName(npn);
    setIsJoining(true);
    lastJoinAttemptRef.current = { joinCode: njc, playerName: npn };
    sendClientEvent(EVENTS.ROOM_JOIN, { joinCode: njc, playerName: npn, sessionId: null });
  });

  const playerSession = playerSessionRef.current;
  const ownPlayerId = playerSession?.playerId ?? "";
  const timerSeconds = Math.ceil((remainingMs ?? 0) / 1000);
  const ownRoundResult = roundResults.find((r) => r.playerId === ownPlayerId) ?? null;
  const isSelfCorrect = ownRoundResult?.isCorrect ?? false;

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
    <main className="player-shell" data-screen={screen}>
      <header className="player-header">
        <div className="player-status" data-state={connectionState}>
          {getConnectionLabel(connectionState)}
        </div>
        {screen === "question" && remainingMs > 0 && (
          <div className="player-timer-mini" data-urgent={timerSeconds <= 5}>
            {timerSeconds}s
          </div>
        )}
      </header>

      <div className="player-main">
        {screen === "join" && (
          <div className="player-card">
            <span className="player-kicker">Willkommen</span>
            <h1 className="player-title">Mitspielen</h1>
            <div style={{ marginTop: "24px", display: "grid", gap: "16px" }}>
              <input
                autoCapitalize="characters"
                className="player-input"
                maxLength={6}
                onChange={(e) => setJoinCode(normalizeJoinCode(e.target.value))}
                placeholder="Raumcode (z.B. ABC123)"
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
              <p style={{ color: "var(--player-ink-soft)", marginTop: "8px" }}>
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
            <div className="player-card">
              <span className="player-kicker">
                {question.type === QuestionType.Estimate
                  ? "Schätzfrage"
                  : question.type === QuestionType.MajorityGuess
                    ? "Mehrheitsfrage"
                    : question.type === QuestionType.Ranking
                      ? "Reihenfolge"
                      : question.type === QuestionType.Logic
                        ? "Denkfrage"
                        : "Frage"}{" "}
                · {question.questionIndex + 1}
              </span>
              <h2 className="player-question-text">{question.text}</h2>
              {(question.type === QuestionType.Estimate ||
                question.type === QuestionType.MajorityGuess) && (
                <p className="player-question-unit">
                  {question.unit} · {question.context}
                </p>
              )}
            </div>

            {(question.type === QuestionType.MultipleChoice ||
              question.type === QuestionType.Logic) && (
              <div className="player-options-list">
                {question.options.map((opt) => (
                  <button
                    key={opt.id}
                    className="player-option-button"
                    data-state={selectedOptionId === opt.id ? "selected" : "idle"}
                    disabled={answerStatus !== "idle"}
                    onClick={() => handleSubmitAnswer(opt.id)}
                  >
                    <span>{opt.label}</span>
                    {selectedOptionId === opt.id && <span style={{ fontSize: "0.8rem" }}>✓</span>}
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
                <p className="player-ranking-hint">Tippe in der richtigen Reihenfolge:</p>
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
                        {item.label}
                      </button>
                    ))}
                </div>
                {rankingOrder.length > 0 && (
                  <div className="player-ranking-chosen">
                    {rankingOrder.map((id, i) => {
                      const item = question.items.find((x) => x.id === id)!;
                      return (
                        <div key={id} className="player-ranking-slot">
                          <span className="player-ranking-pos">{i + 1}.</span>
                          <span>{item.label}</span>
                          {answerStatus === "idle" && (
                            <button
                              className="player-ranking-remove"
                              onClick={() => setRankingOrder(rankingOrder.filter((x) => x !== id))}
                              type="button"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                <button
                  className="player-primary-button"
                  disabled={rankingOrder.length < question.items.length || answerStatus !== "idle"}
                  onClick={() => handleSubmitRanking(rankingOrder)}
                  style={{ marginTop: "12px" }}
                  type="button"
                >
                  Reihenfolge bestätigen
                </button>
              </div>
            )}

            {answerStatus === "accepted" && (
              <div
                className="player-feedback"
                style={{ background: "var(--player-teal)", color: "white" }}
              >
                Antwort gespeichert!
              </div>
            )}
            {answerStatus === "locked" && (
              <div
                className="player-feedback"
                style={{ background: "var(--player-line)", color: "var(--player-ink)" }}
              >
                Zeit abgelaufen
              </div>
            )}
          </>
        )}

        {screen === "reveal" && (
          <>
            <div className="player-feedback" data-state={isSelfCorrect ? "correct" : "wrong"}>
              {isSelfCorrect ? "RICHTIG!" : "LEIDER FALSCH"}
            </div>
            <div className="player-card">
              <span className="player-kicker">Ergebnis</span>
              <p style={{ margin: 0, fontWeight: 700 }}>
                {ownRoundResult?.pointsEarned ?? 0} Punkte verdient.
              </p>
            </div>

            {(question?.type === QuestionType.MultipleChoice ||
              question?.type === QuestionType.Logic) && (
              <div className="player-options-list">
                {question.options.map((opt) => {
                  const isCorrect =
                    correctAnswer?.type === "option" && correctAnswer.value === opt.id;
                  const wasSelected =
                    (ownRoundResult?.answer?.type === "option"
                      ? ownRoundResult.answer.value
                      : selectedOptionId) === opt.id;
                  return (
                    <div
                      key={opt.id}
                      className="player-option-card"
                      data-state={isCorrect ? "correct" : wasSelected ? "wrong" : "dimmed"}
                    >
                      <span>{opt.label}</span>
                      {isCorrect && <span>✓</span>}
                    </div>
                  );
                })}
              </div>
            )}

            {(question?.type === QuestionType.Estimate ||
              question?.type === QuestionType.MajorityGuess) && (
              <div className="player-estimate-result">
                <div className="player-estimate-result-row">
                  <span>Deine Schätzung</span>
                  <strong>
                    {ownRoundResult?.answer?.type === "number" ? ownRoundResult.answer.value : "–"}{" "}
                    {question.unit}
                  </strong>
                </div>
                <div className="player-estimate-result-row player-estimate-result-correct">
                  <span>Richtig</span>
                  <strong>
                    {correctAnswer?.type === "number" ? correctAnswer.value : "–"} {question.unit}
                  </strong>
                </div>
              </div>
            )}

            {question?.type === QuestionType.Ranking && correctAnswer?.type === "ranking" && (
              <div className="player-ranking-result">
                <p className="player-ranking-hint">Richtige Reihenfolge:</p>
                {correctAnswer.value.map((id, i) => {
                  const item = question.items.find((x) => x.id === id);
                  return (
                    <div key={id} className="player-ranking-slot">
                      <span className="player-ranking-pos">{i + 1}.</span>
                      <span>{item?.label ?? id}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {screen === "scoreboard" && (
          <>
            {ownScoreboardEntry && (
              <div className="player-my-rank">
                <div className="player-my-rank-label">Dein Platz</div>
                <div className="player-my-rank-value">{ownScoreboardPlacement + 1}.</div>
                <div style={{ fontWeight: 700 }}>{ownScoreboardEntry.score} Punkte</div>
              </div>
            )}
            <div className="player-scoreboard-list">
              {scoreboard?.scoreboard.map((e, i) => (
                <div
                  key={e.playerId}
                  className="player-scoreboard-item"
                  data-self={e.playerId === ownPlayerId}
                >
                  <span>
                    {i + 1}. {e.name}
                  </span>
                  <strong>{e.score}</strong>
                </div>
              ))}
            </div>
            <button
              className="player-primary-button"
              disabled={isReadyForNext}
              onClick={handleReadyForNextQuestion}
              type="button"
              style={{ marginTop: "12px" }}
            >
              {isReadyForNext ? "Warten auf andere..." : "Bereit für nächste Frage"}
            </button>
          </>
        )}

        {screen === "finished" && (
          <div className="player-card" style={{ textAlign: "center" }}>
            <span className="player-kicker">Quiz beendet</span>
            <h1 className="player-title">Vielen Dank!</h1>
            <div
              className="player-my-rank-value"
              style={{ color: "var(--player-teal)", margin: "24px 0" }}
            >
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

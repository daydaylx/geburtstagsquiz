import { useEffect, useEffectEvent, useRef, useState } from "react";
import QRCode from "qrcode";

import {
  EVENTS,
  parseServerToClientEnvelope,
  type ClientToServerEventPayloadMap,
  type AnswerProgressPayload,
  type GameFinishedPayload,
  type LobbyUpdatePayload,
  type NextQuestionReadyProgressPayload,
  type QuestionRevealPayload,
  type QuestionShowPayload,
  type ScoreUpdatePayload,
} from "@quiz/shared-protocol";
import { GameState, QuestionType, RoomState } from "@quiz/shared-types";

import {
  clearDisplayStoredSession,
  loadDisplayStoredSession,
  saveDisplayStoredSession,
  type DisplayStoredSession,
} from "./storage.js";
import {
  getHostJoinUrl,
  getPlayerJoinUrl,
  getServerSocketUrl,
} from "./lib/helpers.js";
import { useWebSocket, type ConnectionState } from "./hooks/useWebSocket.js";

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

function getAnswerDisplayLabel(index: number): string {
  return index < 26 ? String.fromCharCode(65 + index) : `${index + 1}`;
}

export function App() {
  const initialSession = loadDisplayStoredSession();

  const { connectionState, sendEvent, onMessage, notifyConnected } = useWebSocket();
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
  const [totalMs, setTotalMs] = useState(0);
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
  const [isFadingOut, setIsFadingOut] = useState(false);

  const displaySessionRef = useRef<DisplayStoredSession | null>(initialSession);
  const preCountdownTimerRef = useRef<number | null>(null);

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
        notifyConnected();
        const stored = displaySessionRef.current;
        if (stored) {
          sendEvent(EVENTS.CONNECTION_RESUME, {
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
        const questionPayload = parsedEnvelope.data.payload;
        setPreCountdown(null);
        setAnswerProgress(null);
        setRevealedAnswer(null);
        setRevealExplanation(null);
        setRoundResults([]);
        setScoreboard(null);
        setScoreChanges([]);
        setNextQuestionReadyProgress(null);
        setIsFadingOut(true);
        setTimeout(() => {
          setQuestion(questionPayload);
          setRemainingMs(questionPayload.durationMs);
          setTotalMs(questionPayload.durationMs);
          setScreen("question");
          setIsFadingOut(false);
        }, 200);
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
        setNextQuestionReadyProgress(null);
        setIsFadingOut(true);
        setTimeout(() => {
          setScreen("reveal");
          setIsFadingOut(false);
        }, 200);
        return;
      }

      case EVENTS.SCORE_UPDATE: {
        const payload = parsedEnvelope.data.payload;
        setScoreboard(payload);
        setScoreChanges(payload.scoreChanges);
        setNextQuestionReadyProgress(null);
        setIsFadingOut(true);
        setTimeout(() => {
          setScreen("scoreboard");
          setIsFadingOut(false);
        }, 200);
        return;
      }

      case EVENTS.NEXT_QUESTION_READY_PROGRESS: {
        setNextQuestionReadyProgress(parsedEnvelope.data.payload);
        return;
      }

      case EVENTS.GAME_FINISHED: {
        const finishedPayload = parsedEnvelope.data.payload;
        setFinalResult(finishedPayload);
        setIsFadingOut(true);
        setTimeout(() => {
          setScreen("finished");
          setIsFadingOut(false);
        }, 200);
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

  onMessage(handleServerMessage);

  useEffect(() => {
    return () => {
      if (preCountdownTimerRef.current !== null) {
        clearInterval(preCountdownTimerRef.current);
      }
    };
  }, []);

  const handleCreateRoom = useEffectEvent(() => {
    if (isCreatingRoom || connectionState !== "connected") return;
    setIsCreatingRoom(true);
    setNotice(null);
    const sent = sendEvent(EVENTS.DISPLAY_CREATE_ROOM, {});
    if (!sent) {
      setIsCreatingRoom(false);
      setNotice("Keine Verbindung zum Server.");
    }
  });

  const timerSeconds = Math.ceil(remainingMs / 1000);
  const isTimerUrgent = remainingMs > 0 && timerSeconds <= 5;
  const isTimerWarning = remainingMs > 0 && timerSeconds <= 10 && timerSeconds > 5;

  const RING_R = 42;
  const RING_C = 2 * Math.PI * RING_R;
  const ringOffset = totalMs > 0 ? RING_C * (1 - remainingMs / totalMs) : 0;

  const correctCount = roundResults.filter((r) => r.isCorrect).length;
  const wrongCount = roundResults.filter((r) => !r.isCorrect && r.answer !== null).length;
  const noneCount = roundResults.filter((r) => r.answer === null).length;
  const visibleReadyProgress =
    question &&
    nextQuestionReadyProgress &&
    nextQuestionReadyProgress.questionId === question.questionId
      ? nextQuestionReadyProgress
      : null;
  const readyProgressAllReady =
    !!visibleReadyProgress &&
    visibleReadyProgress.totalEligiblePlayers > 0 &&
    visibleReadyProgress.readyCount >= visibleReadyProgress.totalEligiblePlayers;
  const readyProgressPercent =
    visibleReadyProgress && visibleReadyProgress.totalEligiblePlayers > 0
      ? Math.round(
          (visibleReadyProgress.readyCount / visibleReadyProgress.totalEligiblePlayers) * 100,
        )
      : 0;

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
                {roomInfo.hostToken && (
                  <code className="display-host-url">{getHostJoinUrl(roomInfo.hostToken)}</code>
                )}
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
          <div className="display-question" data-fading={isFadingOut || undefined}>
            <div className="display-question-meta">
              Frage {question.questionIndex + 1} / {question.totalQuestionCount}
              <span className="display-question-type">
                {" · "}
                {getQuestionTypeLabel(question.type)}
              </span>
            </div>
            <h2 className="display-question-text">{question.text}</h2>

            {"options" in question && (
              <div
                className={`display-options${question.options.some((o) => o.label.length > 40) ? " display-options--long" : ""}`}
              >
                {question.options.map((opt, index) => (
                  <div key={opt.id} className="display-option">
                    <span className="display-option-label">{getAnswerDisplayLabel(index)}</span>
                    <span className="display-option-text">{opt.label}</span>
                  </div>
                ))}
              </div>
            )}

            {"items" in question && (
              <div
                className={`display-options${question.items.some((item) => item.label.length > 40) ? " display-options--long" : ""}`}
              >
                {question.items.map((item, idx) => (
                  <div key={item.id} className="display-option">
                    <span className="display-option-label">{idx + 1}.</span>
                    <span className="display-option-text">{item.label}</span>
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
              <div className="display-timer-wrap">
                <svg className="display-timer-svg" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r={RING_R} className="display-timer-track" />
                  <circle
                    cx="50"
                    cy="50"
                    r={RING_R}
                    className="display-timer-fill"
                    data-urgent={isTimerUrgent ? "true" : undefined}
                    data-warning={isTimerWarning ? "true" : undefined}
                    style={{ strokeDasharray: RING_C, strokeDashoffset: ringOffset }}
                  />
                </svg>
                <span
                  className="display-timer-label"
                  data-urgent={isTimerUrgent ? "true" : undefined}
                  data-warning={isTimerWarning ? "true" : undefined}
                >
                  {remainingMs > 0 ? timerSeconds : "—"}
                </span>
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
          <div className="display-reveal" data-fading={isFadingOut || undefined}>
            <h3 className="display-reveal-question">{question.text}</h3>

            {/* MultipleChoice / Logic / MajorityGuess — fokussierte Richtig-Antwort */}
            {"options" in question && (
              <>
                <div className="display-reveal-header">Richtige Antwort</div>
                {revealedAnswer?.type === "option" &&
                  (() => {
                    const correctOpt = question.options.find(
                      (o) => o.id === (revealedAnswer as { type: "option"; value: string }).value,
                    );
                    const correctIndex = correctOpt
                      ? question.options.findIndex((option) => option.id === correctOpt.id)
                      : -1;
                    return correctOpt ? (
                      <div className="display-reveal-correct-card">
                        <span className="display-reveal-correct-label">
                          {getAnswerDisplayLabel(correctIndex)}
                        </span>
                        <span className="display-reveal-correct-text">{correctOpt.label}</span>
                      </div>
                    ) : null;
                  })()}
                {revealedAnswer?.type === "options" &&
                  (revealedAnswer as { type: "options"; value: string[] }).value.map((id) => {
                    const opt = question.options.find((o) => o.id === id);
                    const optIndex = opt
                      ? question.options.findIndex((option) => option.id === opt.id)
                      : -1;
                    return opt ? (
                      <div key={id} className="display-reveal-correct-card">
                        <span className="display-reveal-correct-label">
                          {getAnswerDisplayLabel(optIndex)}
                        </span>
                        <span className="display-reveal-correct-text">{opt.label}</span>
                      </div>
                    ) : null;
                  })}
              </>
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

            {revealExplanation && (
              <div className="display-explanation">
                <div className="display-explanation-label">Erklärung</div>
                <p>{revealExplanation}</p>
              </div>
            )}

            <div className="display-reveal-stats">
              <span className="display-reveal-stat display-reveal-stat--correct">
                ✓ {correctCount} richtig
              </span>
              <span className="display-reveal-stat display-reveal-stat--wrong">
                ✗ {wrongCount} falsch
              </span>
              <span className="display-reveal-stat">— {noneCount} keine</span>
            </div>
            {visibleReadyProgress && (
              <div
                className="display-ready-block"
                data-all-ready={readyProgressAllReady ? "true" : undefined}
              >
                <div className="display-ready-label">
                  {readyProgressAllReady
                    ? "Alle bereit!"
                    : `${visibleReadyProgress.readyCount} / ${visibleReadyProgress.totalEligiblePlayers} bereit`}
                </div>
                <div className="display-ready-track">
                  <div
                    className="display-ready-fill"
                    style={{ width: `${readyProgressPercent}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {screen === "scoreboard" && scoreboard && (
          <div className="display-scoreboard" data-fading={isFadingOut || undefined}>
            <h2>Zwischenstand</h2>
            <ol className="display-scoreboard-list">
              {(() => {
                const highestScore = scoreboard.scoreboard[0]?.score ?? 0;
                const maxScore = Math.max(highestScore, question?.totalQuestionCount ?? 10, 10);
                return scoreboard.scoreboard.slice(0, 8).map((entry, i) => {
                  const change = scoreChanges.find((c) => c.playerId === entry.playerId);
                  const rankDelta = change ? change.previousRank - change.rank : 0;
                  const progressPercent = Math.min(
                    100,
                    Math.max(0, (entry.score / maxScore) * 100),
                  );
                  return (
                    <li
                      key={entry.playerId}
                      className="display-scoreboard-entry"
                      data-rank={i + 1}
                      data-changed={change && change.delta > 0 ? "true" : undefined}
                    >
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
                      <div
                        className="display-progress-track"
                        style={{ "--progress": `${progressPercent}%` } as React.CSSProperties}
                      >
                        <span className="display-progress-label">Start</span>
                        <div className="display-progress-bar">
                          <div className="display-progress-fill" />
                          <div className="display-progress-marker" />
                        </div>
                        <span className="display-progress-label">Ziel</span>
                      </div>
                      {change && change.delta > 0 && (
                        <span className="display-score-delta">+{change.delta}</span>
                      )}
                      <span className="display-score">{entry.score}</span>
                    </li>
                  );
                });
              })()}
            </ol>
            {visibleReadyProgress && (
              <div
                className="display-ready-block"
                data-all-ready={readyProgressAllReady ? "true" : undefined}
              >
                <div className="display-ready-label">
                  {readyProgressAllReady
                    ? "Alle bereit!"
                    : `${visibleReadyProgress.readyCount} / ${visibleReadyProgress.totalEligiblePlayers} bereit`}
                </div>
                <div className="display-ready-track">
                  <div
                    className="display-ready-fill"
                    style={{ width: `${readyProgressPercent}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {screen === "finished" && finalResult && (
          <div className="display-finished" data-fading={isFadingOut || undefined}>
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

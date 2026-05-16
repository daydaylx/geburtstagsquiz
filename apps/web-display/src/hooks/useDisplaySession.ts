import {
  type AnswerProgressPayload,
  type ClientToServerEventPayloadMap,
  EVENTS,
  type GameFinishedPayload,
  type LobbyUpdatePayload,
  type NextQuestionReadyProgressPayload,
  parseServerToClientEnvelope,
  type QuestionRevealPayload,
  type QuestionShowPayload,
  type ScoreUpdatePayload,
  type VoteUpdatePayload,
} from "@quiz/shared-protocol";
import { GameState, RoomState } from "@quiz/shared-types";
import QRCode from "qrcode";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { getPlayerJoinUrl } from "../lib/helpers.js";
import {
  clearDisplayStoredSession,
  type DisplayStoredSession,
  loadDisplayStoredSession,
  saveDisplayStoredSession,
} from "../storage.js";

function cleanUrlParams(): void {
  if (window.location.search) {
    window.history.replaceState({}, "", window.location.pathname);
  }
}

export type DisplayScreen = "setup" | "lobby" | "question" | "reveal" | "scoreboard" | "finished";
export type DisplayShowLevel = "minimal" | "normal" | "high";

export interface DisplayRoomInfo {
  roomId: string;
  joinCode: string;
  hostToken: string;
  displaySessionId: string;
  displayToken: string;
}

export interface UseDisplaySessionReturn {
  screen: DisplayScreen;
  roomInfo: DisplayRoomInfo | null;
  hostPaired: boolean;
  lobby: LobbyUpdatePayload | null;
  playerQrUrl: string | null;
  notice: string | null;
  isCreatingRoom: boolean;
  question: QuestionShowPayload | null;
  remainingMs: number;
  totalMs: number;
  answerProgress: AnswerProgressPayload | null;
  revealedAnswer: QuestionRevealPayload["correctAnswer"] | null;
  revealExplanation: string | null;
  revealEstimateContext: string | null;
  roundResults: QuestionRevealPayload["playerResults"];
  scoreboard: ScoreUpdatePayload | null;
  scoreChanges: ScoreUpdatePayload["scoreChanges"];
  nextQuestionReadyProgress: NextQuestionReadyProgressPayload | null;
  finalResult: GameFinishedPayload | null;
  preCountdown: number | null;
  displayShowLevel: DisplayShowLevel;
  isFadingOut: boolean;
  votes: Record<string, number>;
  canCreateRoomFromDisplay: boolean;
  canRetryConnect: boolean;
  handleCreateRoom: () => void;
  handleRetryConnect: () => void;
  handleRetryQr: () => void;
}

export function useDisplaySession(deps: {
  sendEvent: <E extends keyof ClientToServerEventPayloadMap>(
    event: E,
    payload: ClientToServerEventPayloadMap[E],
  ) => boolean;
  onMessage: (handler: (raw: string) => void) => void;
  notifyConnected: () => void;
  connectionState: string;
}): UseDisplaySessionReturn {
  const { sendEvent, onMessage, notifyConnected, connectionState } = deps;
  const initialUrlParams = new URLSearchParams(window.location.search);
  const urlDisplayConnectToken = initialUrlParams.get("displayConnectToken") ?? initialUrlParams.get("displayToken");
  const urlRoomId = initialUrlParams.get("roomId");
  const hasDisplayConnectParams = !!urlDisplayConnectToken && !!urlRoomId;
  const urlConnectTokenRef = useRef(urlDisplayConnectToken);
  const urlRoomIdRef = useRef(urlRoomId);

  let initialSession = loadDisplayStoredSession();
  if (hasDisplayConnectParams && initialSession && initialSession.roomId !== urlRoomId) {
    clearDisplayStoredSession();
    initialSession = null;
  }

  const canCreateRoomFromDisplay =
    initialUrlParams.get("displayCreate") === "1" ||
    (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_ENABLE_DISPLAY_CREATE_ROOM ===
      "true";

  const [screen, setScreen] = useState<DisplayScreen>("setup");
  const [roomInfo, setRoomInfo] = useState<DisplayRoomInfo | null>(null);
  const [hostPaired, setHostPaired] = useState(false);
  const [lobby, setLobby] = useState<LobbyUpdatePayload | null>(null);
  const [playerQrUrl, setPlayerQrUrl] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);

  const [question, setQuestion] = useState<QuestionShowPayload | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [totalMs, setTotalMs] = useState(0);
  const [answerProgress, setAnswerProgress] = useState<AnswerProgressPayload | null>(null);
  const [revealedAnswer, setRevealedAnswer] = useState<QuestionRevealPayload["correctAnswer"] | null>(null);
  const [revealExplanation, setRevealExplanation] = useState<string | null>(null);
  const [revealEstimateContext, setRevealEstimateContext] = useState<string | null>(null);
  const [roundResults, setRoundResults] = useState<QuestionRevealPayload["playerResults"]>([]);
  const [scoreboard, setScoreboard] = useState<ScoreUpdatePayload | null>(null);
  const [scoreChanges, setScoreChanges] = useState<ScoreUpdatePayload["scoreChanges"]>([]);
  const [nextQuestionReadyProgress, setNextQuestionReadyProgress] = useState<NextQuestionReadyProgressPayload | null>(
    null,
  );
  const [finalResult, setFinalResult] = useState<GameFinishedPayload | null>(null);
  const [preCountdown, setPreCountdown] = useState<number | null>(null);
  const [votes, setVotes] = useState<Record<string, number>>({});
  const [displayShowLevel, setDisplayShowLevel] = useState<DisplayShowLevel>("high");
  const [isFadingOut, setIsFadingOut] = useState(false);

  const displaySessionRef = useRef<DisplayStoredSession | null>(initialSession);
  const preCountdownTimerRef = useRef<number | null>(null);
  const fadeTimerRef = useRef<number | null>(null);

  const scheduleFade = useEffectEvent((cb: () => void) => {
    if (fadeTimerRef.current !== null) {
      window.clearTimeout(fadeTimerRef.current);
    }
    fadeTimerRef.current = window.setTimeout(() => {
      fadeTimerRef.current = null;
      cb();
    }, 200);
  });

  const updateStoredSession = useEffectEvent((session: DisplayStoredSession | null) => {
    displaySessionRef.current = session;
    if (session) saveDisplayStoredSession(session);
    else clearDisplayStoredSession();
  });

  const resetToSetup = useEffectEvent(() => {
    // Geschlossene oder ungueltige Display-Sessions muessen neu vom Host gekoppelt werden.
    if (preCountdownTimerRef.current !== null) {
      clearInterval(preCountdownTimerRef.current);
      preCountdownTimerRef.current = null;
    }
    if (fadeTimerRef.current !== null) {
      window.clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
    setPreCountdown(null);
    setScreen("setup");
    setRoomInfo(null);
    setHostPaired(false);
    setLobby(null);
    setPlayerQrUrl(null);
    setIsCreatingRoom(false);
    setQuestion(null);
    setRemainingMs(0);
    setAnswerProgress(null);
    setRevealedAnswer(null);
    setRevealExplanation(null);
    setRevealEstimateContext(null);
    setRoundResults([]);
    setScoreboard(null);
    setScoreChanges([]);
    setNextQuestionReadyProgress(null);
    setFinalResult(null);
    setVotes({});
    setDisplayShowLevel("high");
    displaySessionRef.current = null;
    cleanUrlParams();
  });

  const generateQrCodes = useEffectEvent((joinCode: string, _hostToken: string) => {
    QRCode.toDataURL(getPlayerJoinUrl(joinCode), { margin: 1, width: 400 })
      .then((url) => {
        setPlayerQrUrl(url);
        if (notice === "QR-Code konnte nicht generiert werden.") setNotice(null);
      })
      .catch(() => {
        setPlayerQrUrl(null);
        setNotice("QR-Code konnte nicht generiert werden.");
      });
  });

  const handleServerMessage = useEffectEvent((rawMessage: string) => {
    const parsedEnvelope = parseServerToClientEnvelope(rawMessage);
    if (!parsedEnvelope.success) return;

    switch (parsedEnvelope.data.event) {
      // --- Connection & Resume ---
      case EVENTS.CONNECTION_ACK: {
        notifyConnected();
        const stored = displaySessionRef.current;
        if (stored) {
          sendEvent(EVENTS.CONNECTION_RESUME, {
            roomId: stored.roomId,
            sessionId: stored.displaySessionId,
          });
        } else {
          const urlParams = new URLSearchParams(window.location.search);
          const displayToken = urlParams.get("displayConnectToken") ?? urlParams.get("displayToken");
          const roomId = urlParams.get("roomId");
          if (displayToken && roomId) {
            sendEvent(EVENTS.DISPLAY_CONNECT_ROOM, {
              roomId,
              displayConnectToken: displayToken,
            });
          }
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
          const resolvedHostToken = payload.hostToken ?? "";
          const info: DisplayRoomInfo = {
            roomId: payload.roomId,
            joinCode: payload.joinCode,
            hostToken: resolvedHostToken,
            displaySessionId: payload.sessionId,
            displayToken: stored.displayToken,
          };
          setRoomInfo(info);
          setHostPaired(payload.hostConnected ?? false);
          generateQrCodes(payload.joinCode, resolvedHostToken);
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

      // --- Lobby ---
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
        isCreatingRoomRef.current = false;
        generateQrCodes(payload.joinCode, payload.hostToken);
        setScreen("lobby");
        return;
      }

      case EVENTS.DISPLAY_ROOM_CONNECTED: {
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
          hostToken: "",
          displaySessionId: payload.displaySessionId,
          displayToken: payload.displayToken,
        });
        setHostPaired(payload.hostConnected);
        generateQrCodes(payload.joinCode, "");
        cleanUrlParams();
        setScreen("lobby");
        return;
      }

      case EVENTS.DISPLAY_HOST_PAIRED: {
        setHostPaired(true);
        return;
      }

      case EVENTS.VOTE_UPDATE:
        setVotes((parsedEnvelope.data.payload as VoteUpdatePayload).votes);
        return;

      case EVENTS.LOBBY_UPDATE: {
        setLobby(parsedEnvelope.data.payload);
        return;
      }

      // --- Game Flow: Countdown → Question → Answer → Reveal → Scoreboard ---
      case EVENTS.GAME_STARTED: {
        const payload = parsedEnvelope.data.payload;
        setDisplayShowLevel(payload.resolvedGamePlan.displayShowLevel);
        setQuestion(null);
        setAnswerProgress(null);
        setRevealedAnswer(null);
        setRevealExplanation(null);
        setRevealEstimateContext(null);
        setRoundResults([]);
        setScoreboard(null);
        setScoreChanges([]);
        setNextQuestionReadyProgress(null);
        setIsFadingOut(true);
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
        setRevealEstimateContext(null);
        setRoundResults([]);
        setScoreboard(null);
        setScoreChanges([]);
        setNextQuestionReadyProgress(null);
        setIsFadingOut(true);
        scheduleFade(() => {
          setQuestion(questionPayload);
          setRemainingMs(questionPayload.durationMs);
          setTotalMs(questionPayload.durationMs);
          setScreen("question");
          setIsFadingOut(false);
        });
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
        setRevealEstimateContext(payload.estimateContext ?? null);
        setRoundResults(payload.playerResults);
        setNextQuestionReadyProgress(null);
        setIsFadingOut(true);
        scheduleFade(() => {
          setScreen("reveal");
          setIsFadingOut(false);
        });
        return;
      }

      case EVENTS.SCORE_UPDATE: {
        const payload = parsedEnvelope.data.payload;
        setScoreboard(payload);
        setScoreChanges(payload.scoreChanges);
        setNextQuestionReadyProgress(null);
        setIsFadingOut(true);
        scheduleFade(() => {
          setScreen("scoreboard");
          setIsFadingOut(false);
        });
        return;
      }

      case EVENTS.NEXT_QUESTION_READY_PROGRESS: {
        setNextQuestionReadyProgress(parsedEnvelope.data.payload);
        return;
      }

      // --- Game End & Restart ---
      case EVENTS.GAME_FINISHED: {
        const finishedPayload = parsedEnvelope.data.payload;
        setFinalResult(finishedPayload);
        setIsFadingOut(true);
        scheduleFade(() => {
          setScreen("finished");
          setIsFadingOut(false);
        });
        return;
      }

      case EVENTS.ROOM_RESET: {
        const resetPayload = parsedEnvelope.data.payload;
        // Host-Neustart behaelt die Display-Kopplung und setzt nur Spiel-/Votingdaten zurueck.
        setRoomInfo((prev) =>
          prev ? { ...prev, roomId: resetPayload.roomId, joinCode: resetPayload.joinCode } : prev,
        );
        setPreCountdown(null);
        setQuestion(null);
        setRemainingMs(0);
        setAnswerProgress(null);
        setRevealedAnswer(null);
        setRevealExplanation(null);
        setRevealEstimateContext(null);
        setRoundResults([]);
        setScoreboard(null);
        setScoreChanges([]);
        setNextQuestionReadyProgress(null);
        setFinalResult(null);
        setVotes({});
        setDisplayShowLevel("high");
        setScreen("lobby");
        setNotice(null);
        return;
      }

      // --- Cleanup & Errors ---
      case EVENTS.ROOM_CLOSED: {
        // Raum geschlossen: lokale Kopplung verwerfen und wieder auf Host warten.
        updateStoredSession(null);
        resetToSetup();
        return;
      }

      case EVENTS.ERROR_PROTOCOL: {
        const payload = parsedEnvelope.data.payload;
        setIsCreatingRoom(false);
        isCreatingRoomRef.current = false;
        setNotice(payload.message);
        return;
      }

      default:
        return;
    }
  });

  useEffect(() => {
    onMessage(handleServerMessage);
  }, [onMessage]);

  useEffect(() => {
    return () => {
      if (preCountdownTimerRef.current !== null) {
        clearInterval(preCountdownTimerRef.current);
      }
      if (fadeTimerRef.current !== null) {
        window.clearTimeout(fadeTimerRef.current);
      }
    };
  }, []);

  const isCreatingRoomRef = useRef(false);

  const handleCreateRoom = useEffectEvent(() => {
    if (isCreatingRoomRef.current || isCreatingRoom || connectionState !== "connected") return;
    isCreatingRoomRef.current = true;
    setIsCreatingRoom(true);
    setNotice(null);
    const sent = sendEvent(EVENTS.DISPLAY_CREATE_ROOM, {});
    if (!sent) {
      isCreatingRoomRef.current = false;
      setIsCreatingRoom(false);
      setNotice("Keine Verbindung zum Server.");
    }
  });

  const handleRetryConnect = useEffectEvent(() => {
    const token = urlConnectTokenRef.current;
    const roomId = urlRoomIdRef.current;
    if (token && roomId) {
      setNotice(null);
      sendEvent(EVENTS.DISPLAY_CONNECT_ROOM, {
        roomId,
        displayConnectToken: token,
      });
    }
  });

  const handleRetryQr = useEffectEvent(() => {
    if (roomInfo) {
      setNotice(null);
      generateQrCodes(roomInfo.joinCode, roomInfo.hostToken);
    }
  });

  const canRetryConnect = screen === "setup" && !!notice && !!urlConnectTokenRef.current && !!urlRoomIdRef.current;

  return {
    screen,
    roomInfo,
    hostPaired,
    lobby,
    playerQrUrl,
    notice,
    isCreatingRoom,
    question,
    remainingMs,
    totalMs,
    answerProgress,
    revealedAnswer,
    revealExplanation,
    revealEstimateContext,
    roundResults,
    scoreboard,
    scoreChanges,
    nextQuestionReadyProgress,
    finalResult,
    preCountdown,
    displayShowLevel,
    isFadingOut,
    votes,
    canCreateRoomFromDisplay,
    canRetryConnect,
    handleCreateRoom,
    handleRetryConnect,
    handleRetryQr,
  };
}

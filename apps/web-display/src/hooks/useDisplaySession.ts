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
import { GameState, RoomState } from "@quiz/shared-types";

import { getHostJoinUrl, getPlayerJoinUrl } from "../lib/helpers.js";
import {
  clearDisplayStoredSession,
  loadDisplayStoredSession,
  saveDisplayStoredSession,
  type DisplayStoredSession,
} from "../storage.js";

export type DisplayScreen =
  | "setup"
  | "lobby"
  | "question"
  | "reveal"
  | "scoreboard"
  | "finished";
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
  hostQrUrl: string | null;
  notice: string | null;
  isCreatingRoom: boolean;
  question: QuestionShowPayload | null;
  remainingMs: number;
  totalMs: number;
  answerProgress: AnswerProgressPayload | null;
  revealedAnswer: QuestionRevealPayload["correctAnswer"] | null;
  revealExplanation: string | null;
  roundResults: QuestionRevealPayload["playerResults"];
  scoreboard: ScoreUpdatePayload | null;
  scoreChanges: ScoreUpdatePayload["scoreChanges"];
  nextQuestionReadyProgress: NextQuestionReadyProgressPayload | null;
  finalResult: GameFinishedPayload | null;
  preCountdown: number | null;
  displayShowLevel: DisplayShowLevel;
  isFadingOut: boolean;
  handleCreateRoom: () => void;
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
  const initialSession = loadDisplayStoredSession();

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

  return {
    screen,
    roomInfo,
    hostPaired,
    lobby,
    playerQrUrl,
    hostQrUrl,
    notice,
    isCreatingRoom,
    question,
    remainingMs,
    totalMs,
    answerProgress,
    revealedAnswer,
    revealExplanation,
    roundResults,
    scoreboard,
    scoreChanges,
    nextQuestionReadyProgress,
    finalResult,
    preCountdown,
    displayShowLevel,
    isFadingOut,
    handleCreateRoom,
  };
}

import { useEffectEvent, useRef, useState } from "react";

import {
  EVENTS,
  PROTOCOL_ERROR_CODES,
  parseServerToClientEnvelope,
  type ClientToServerEventPayloadMap,
  type ConnectionResumedPayload,
  type GameFinishedPayload,
  type LobbyUpdatePayload,
  type NextQuestionReadyProgressPayload,
  type QuestionControllerPayload,
  type QuestionRevealPayload,
  type ScoreUpdatePayload,
} from "@quiz/shared-protocol";
import { GameState, QuestionType } from "@quiz/shared-types";
import { normalizeJoinCode, normalizePlayerName } from "@quiz/shared-utils";

import { getProtocolErrorMessage } from "../lib/helpers.js";
import {
  clearPlayerStoredSession,
  loadPlayerStoredSession,
  savePlayerStoredSession,
  type PlayerStoredSession,
} from "../storage.js";

export interface PlayerNotice {
  kind: "info" | "error";
  text: string;
}

export type PlayerScreen =
  | "join"
  | "lobby"
  | "question"
  | "reveal"
  | "scoreboard"
  | "finished";
export type AnswerStatus = "idle" | "submitting" | "accepted" | "rejected" | "locked";

interface JoinAttempt {
  joinCode: string;
  playerName: string;
}

export interface UsePlayerSessionReturn {
  screen: PlayerScreen;
  notice: PlayerNotice | null;
  joinCode: string;
  playerName: string;
  lobby: LobbyUpdatePayload | null;
  roomId: string | null;
  isJoining: boolean;
  question: QuestionControllerPayload | null;
  remainingMs: number;
  selectedOptionId: string | null;
  estimateValue: string;
  textAnswerValue: string;
  rankingOrder: string[];
  answerStatus: AnswerStatus;
  correctAnswer: QuestionRevealPayload["correctAnswer"] | null;
  revealExplanation: string | null;
  roundResults: QuestionRevealPayload["playerResults"];
  scoreboard: ScoreUpdatePayload | null;
  nextQuestionReadyProgress: NextQuestionReadyProgressPayload | null;
  locallyReadyQuestionId: string | null;
  finalResult: GameFinishedPayload | null;
  ownPlayerId: string;
  timerSeconds: number;
  isTimerWarning: boolean;
  isTimerUrgent: boolean;
  ownRoundResult: QuestionRevealPayload["playerResults"][number] | null;
  selfRevealState: "correct" | "wrong" | "missing";
  selfRevealLabel: string;
  ownScoreboardPlacement: number;
  ownScoreboardEntry: ScoreUpdatePayload["scoreboard"][number] | null;
  ownFinalPlacement: number;
  readyQuestionId: string | null;
  isReadyForNext: boolean;
  handleJoin: () => void;
  handleSubmitAnswer: (optionId: string) => void;
  handleSubmitEstimate: (value: number) => void;
  handleSubmitRanking: (order: string[]) => void;
  handleSubmitText: (value: string) => void;
  handleReadyForNextQuestion: () => void;
  setJoinCode: (v: string) => void;
  setPlayerName: (v: string) => void;
  setEstimateValue: (v: string) => void;
  setTextAnswerValue: (v: string) => void;
  setRankingOrder: (v: string[]) => void;
}

function getInitialJoinCode(storedSession: PlayerStoredSession | null): string {
  const queryJoinCode = new URLSearchParams(window.location.search).get("joinCode");
  return normalizeJoinCode(queryJoinCode ?? storedSession?.joinCode ?? "");
}

export function usePlayerSession(deps: {
  sendEvent: <E extends keyof ClientToServerEventPayloadMap>(
    event: E,
    payload: ClientToServerEventPayloadMap[E],
  ) => boolean;
  onMessage: (handler: (raw: string) => void) => void;
  notifyConnected: () => void;
}): UsePlayerSessionReturn {
  const { sendEvent, onMessage, notifyConnected } = deps;
  const initialSession = loadPlayerStoredSession();

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
  const [textAnswerValue, setTextAnswerValue] = useState<string>("");
  const [rankingOrder, setRankingOrder] = useState<string[]>([]);
  const [answerStatus, setAnswerStatus] = useState<AnswerStatus>("idle");
  const [correctAnswer, setCorrectAnswer] = useState<QuestionRevealPayload["correctAnswer"] | null>(
    null,
  );
  const [revealExplanation, setRevealExplanation] = useState<string | null>(null);
  const [roundResults, setRoundResults] = useState<QuestionRevealPayload["playerResults"]>([]);
  const [scoreboard, setScoreboard] = useState<ScoreUpdatePayload | null>(null);
  const [nextQuestionReadyProgress, setNextQuestionReadyProgress] =
    useState<NextQuestionReadyProgressPayload | null>(null);
  const [locallyReadyQuestionId, setLocallyReadyQuestionId] = useState<string | null>(null);
  const [finalResult, setFinalResult] = useState<GameFinishedPayload | null>(null);

  const playerSessionRef = useRef<PlayerStoredSession | null>(initialSession);
  const lastJoinAttemptRef = useRef<JoinAttempt | null>(null);
  const resumedAnswerRef = useRef<ConnectionResumedPayload["currentAnswer"] | null>(null);
  const intentionalReconnectRef = useRef(false);

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
    setRevealExplanation(null);
    setRoundResults([]);
    setScoreboard(null);
    setNextQuestionReadyProgress(null);
    setFinalResult(null);
    setEstimateValue("");
    setTextAnswerValue("");
    setRankingOrder([]);
  });

  const handleSubmitAnswer = useEffectEvent((optionId: string) => {
    const session = playerSessionRef.current;
    if (!session || !question || answerStatus !== "idle") return;
    navigator.vibrate?.(50);
    setNotice(null);
    setSelectedOptionId(optionId);
    setAnswerStatus("submitting");
    const sent = sendEvent(EVENTS.ANSWER_SUBMIT, {
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
    navigator.vibrate?.(50);
    setNotice(null);
    setAnswerStatus("submitting");
    const sent = sendEvent(EVENTS.ANSWER_SUBMIT, {
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
    navigator.vibrate?.(50);
    setNotice(null);
    setAnswerStatus("submitting");
    const sent = sendEvent(EVENTS.ANSWER_SUBMIT, {
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

  const handleSubmitText = useEffectEvent((value: string) => {
    const session = playerSessionRef.current;
    if (!session || !question || answerStatus !== "idle") return;
    navigator.vibrate?.(50);
    setNotice(null);
    setAnswerStatus("submitting");
    const sent = sendEvent(EVENTS.ANSWER_SUBMIT, {
      roomId: session.roomId,
      questionId: question.questionId,
      playerId: session.playerId,
      answer: { type: "text", value },
      requestId: crypto.randomUUID(),
    });

    if (!sent) {
      setAnswerStatus("idle");
      setNotice({ kind: "error", text: "Keine Verbindung zum Server." });
    }
  });

  const handleReadyForNextQuestion = useEffectEvent(() => {
    const session = playerSessionRef.current;
    const questionId = scoreboard?.questionId ?? question?.questionId;
    if (!session || !questionId || locallyReadyQuestionId === questionId) return;
    setLocallyReadyQuestionId(questionId);
    const sent = sendEvent(EVENTS.NEXT_QUESTION_READY, {
      roomId: session.roomId,
      questionId,
      playerId: session.playerId,
    });
    if (!sent) {
      setLocallyReadyQuestionId(null);
      setNotice({ kind: "error", text: "Keine Verbindung zum Server." });
    }
  });

  const handleServerMessage = useEffectEvent((rawMessage: string) => {
    const parsedEnvelope = parseServerToClientEnvelope(rawMessage);
    if (!parsedEnvelope.success) return;

    switch (parsedEnvelope.data.event) {
      case EVENTS.CONNECTION_ACK:
        notifyConnected();
        intentionalReconnectRef.current = false;
        if (playerSessionRef.current) {
          sendEvent(EVENTS.CONNECTION_RESUME, {
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

      case EVENTS.QUESTION_COUNTDOWN:
        return;

      case EVENTS.QUESTION_CONTROLLER:
        if (!playerSessionRef.current) return;
        const resumedAnswer = resumedAnswerRef.current;
        setQuestion(parsedEnvelope.data.payload);
        setRemainingMs(parsedEnvelope.data.payload.durationMs);
        setSelectedOptionId(resumedAnswer?.type === "option" ? resumedAnswer.value : null);
        setEstimateValue(resumedAnswer?.type === "number" ? String(resumedAnswer.value) : "");
        setTextAnswerValue(resumedAnswer?.type === "text" ? resumedAnswer.value : "");
        setRankingOrder(resumedAnswer?.type === "ranking" ? resumedAnswer.value : []);
        setAnswerStatus(resumedAnswer ? "accepted" : "idle");
        setCorrectAnswer(null);
        setRevealExplanation(null);
        setRoundResults([]);
        setScoreboard(null);
        setNextQuestionReadyProgress(null);
        setLocallyReadyQuestionId(null);
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
        setAnswerStatus((curr) => (curr === "submitting" ? "locked" : curr));
        setCorrectAnswer(parsedEnvelope.data.payload.correctAnswer);
        setRevealExplanation(parsedEnvelope.data.payload.explanation ?? null);
        setRoundResults(parsedEnvelope.data.payload.playerResults);
        setNextQuestionReadyProgress(null);
        setLocallyReadyQuestionId(null);
        setScreen("reveal");
        return;

      case EVENTS.SCORE_UPDATE:
        setScoreboard(parsedEnvelope.data.payload);
        setNextQuestionReadyProgress(null);
        setLocallyReadyQuestionId(null);
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

  onMessage(handleServerMessage);

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
    const sent = sendEvent(EVENTS.ROOM_JOIN, {
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
  const readyQuestionId = scoreboard?.questionId ?? question?.questionId ?? null;
  const isReadyForNext =
    !!ownPlayerId &&
    !!readyQuestionId &&
    (locallyReadyQuestionId === readyQuestionId ||
      (nextQuestionReadyProgress?.questionId === readyQuestionId &&
        nextQuestionReadyProgress.readyPlayerIds.includes(ownPlayerId)));

  return {
    screen,
    notice,
    joinCode,
    playerName,
    lobby,
    roomId,
    isJoining,
    question,
    remainingMs,
    selectedOptionId,
    estimateValue,
    textAnswerValue,
    rankingOrder,
    answerStatus,
    correctAnswer,
    revealExplanation,
    roundResults,
    scoreboard,
    nextQuestionReadyProgress,
    locallyReadyQuestionId,
    finalResult,
    ownPlayerId,
    timerSeconds,
    isTimerWarning,
    isTimerUrgent,
    ownRoundResult,
    selfRevealState,
    selfRevealLabel,
    ownScoreboardPlacement,
    ownScoreboardEntry,
    ownFinalPlacement,
    readyQuestionId,
    isReadyForNext,
    handleJoin,
    handleSubmitAnswer,
    handleSubmitEstimate,
    handleSubmitRanking,
    handleSubmitText,
    handleReadyForNextQuestion,
    setJoinCode,
    setPlayerName,
    setEstimateValue,
    setTextAnswerValue,
    setRankingOrder,
  };
}

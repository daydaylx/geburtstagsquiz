import { useEffect, useEffectEvent, useRef, useState } from "react";
import QRCode from "qrcode";

import {
  EVENTS,
  PROTOCOL_ERROR_CODES,
  parseServerToClientEnvelope,
  type AnswerProgressPayload,
  type CatalogSummaryPayload,
  type ClientToServerEventPayloadMap,
  type GameFinishedPayload,
  type LobbyUpdatePayload,
  type NextQuestionReadyProgressPayload,
  type QuestionRevealPayload,
  type QuestionShowPayload,
  type ScoreUpdatePayload,
  type VoteUpdatePayload,
} from "@quiz/shared-protocol";
import { GameState, type GamePlan, type GamePlanPresetId } from "@quiz/shared-types";

import { buildPresetGamePlan, createHostClientInfo } from "../lib/game-plan-drafts.js";
import { getPlayerJoinUrl } from "../lib/helpers.js";
import {
  clearHostStoredSession,
  loadHostStoredSession,
  saveHostStoredSession,
  type HostStoredSession,
} from "../storage.js";

function getHostErrorMessage(code: string, fallback: string): string {
  switch (code) {
    case PROTOCOL_ERROR_CODES.NOT_AUTHORIZED:
      return "Dieser Host-Code wurde bereits verwendet. Bitte dasselbe Gerät und denselben Browser verwenden oder auf dem TV-Display einen neuen Raum erstellen.";
    case PROTOCOL_ERROR_CODES.SESSION_NOT_FOUND:
    case PROTOCOL_ERROR_CODES.ROOM_NOT_FOUND:
      return "Die Sitzung wurde nicht gefunden oder der Raum wurde geschlossen. Bitte auf dem TV-Display einen neuen Raum erstellen.";
    default:
      return fallback;
  }
}

export type HostScreen =
  | "start"
  | "lobby"
  | "countdown"
  | "question"
  | "reveal"
  | "scoreboard"
  | "finished";

export interface HostRoomInfo {
  roomId: string;
  joinCode: string;
}

export interface HostNotice {
  kind: "info" | "error";
  text: string;
}

export interface UseHostSessionReturn {
  screen: HostScreen;
  notice: HostNotice | null;
  roomInfo: HostRoomInfo | null;
  lobby: LobbyUpdatePayload | null;
  qrCodeDataUrl: string | null;
  isConnectingHost: boolean;
  question: QuestionShowPayload | null;
  remainingMs: number;
  answerProgress: AnswerProgressPayload | null;
  revealedAnswer: QuestionRevealPayload["correctAnswer"] | null;
  revealExplanation: string | null;
  roundResults: QuestionRevealPayload["playerResults"];
  scoreboard: ScoreUpdatePayload | null;
  nextQuestionReadyProgress: NextQuestionReadyProgressPayload | null;
  finalResult: GameFinishedPayload | null;
  currentQuestionIndex: number | null;
  totalQuestionCount: number | null;
  catalog: CatalogSummaryPayload | null;
  gamePlanDraft: GamePlan | null;
  selectedPlanMode: GamePlanPresetId | "custom";
  countdownSeconds: number;
  showAnswerTextOnPlayerDevices: boolean;
  confirmFinishNow: boolean;
  setConfirmFinishNow: (v: boolean) => void;
  confirmRemovePlayerId: string | null;
  setConfirmRemovePlayerId: (v: string | null) => void;
  handleRestartInfo: () => void;
  handleStartGame: () => void;
  handleAnswerTextSettingChange: (enabled: boolean) => void;
  handleAdvanceQuestion: () => void;
  handleForceCloseQuestion: () => void;
  handleShowScoreboard: () => void;
  handleFinishNow: () => void;
  handleRemovePlayer: (playerId: string) => void;
  handlePlanDraftChange: (nextDraft: GamePlan) => void;
  setSelectedPlanMode: (mode: GamePlanPresetId | "custom") => void;
  votes: Record<string, number>;
}

export function useHostSession(deps: {
  sendEvent: <E extends keyof ClientToServerEventPayloadMap>(
    event: E,
    payload: ClientToServerEventPayloadMap[E],
  ) => boolean;
  onMessage: (handler: (raw: string) => void) => void;
  notifyConnected: () => void;
  closeSocket: () => void;
  connectionState: string;
}): UseHostSessionReturn {
  const { sendEvent, onMessage, notifyConnected, closeSocket } = deps;
  const initialSession = loadHostStoredSession();
  const urlParams = new URLSearchParams(window.location.search);
  const hostToken = urlParams.get("hostToken");

  const [notice, setNotice] = useState<HostNotice | null>(null);
  const [roomInfo, setRoomInfo] = useState<HostRoomInfo | null>(null);
  const [lobby, setLobby] = useState<LobbyUpdatePayload | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [isConnectingHost, setIsConnectingHost] = useState(false);

  const [screen, setScreen] = useState<HostScreen>("start");
  const [question, setQuestion] = useState<QuestionShowPayload | null>(null);
  const [remainingMs, setRemainingMs] = useState<number>(0);
  const [answerProgress, setAnswerProgress] = useState<AnswerProgressPayload | null>(null);
  const [revealedAnswer, setRevealedAnswer] = useState<
    QuestionRevealPayload["correctAnswer"] | null
  >(null);
  const [revealExplanation, setRevealExplanation] = useState<string | null>(null);
  const [roundResults, setRoundResults] = useState<QuestionRevealPayload["playerResults"]>([]);
  const [scoreboard, setScoreboard] = useState<ScoreUpdatePayload | null>(null);
  const [nextQuestionReadyProgress, setNextQuestionReadyProgress] =
    useState<NextQuestionReadyProgressPayload | null>(null);
  const [finalResult, setFinalResult] = useState<GameFinishedPayload | null>(null);
  const [votes, setVotes] = useState<Record<string, number>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number | null>(null);
  const [totalQuestionCount, setTotalQuestionCount] = useState<number | null>(null);
  const [catalog, setCatalog] = useState<CatalogSummaryPayload | null>(null);
  const [gamePlanDraft, setGamePlanDraft] = useState<GamePlan | null>(null);
  const [selectedPlanMode, setSelectedPlanMode] = useState<GamePlanPresetId | "custom">(
    "normal_evening",
  );
  const [countdownSeconds, setCountdownSeconds] = useState(0);
  const [showAnswerTextOnPlayerDevices, setShowAnswerTextOnPlayerDevices] = useState(false);
  const [confirmFinishNow, setConfirmFinishNow] = useState(false);
  const [confirmRemovePlayerId, setConfirmRemovePlayerId] = useState<string | null>(null);

  const hostSessionRef = useRef<HostStoredSession | null>(initialSession);
  const intentionalReconnectRef = useRef(false);
  const pendingHostConnectRef = useRef(false);

  const updateStoredSession = useEffectEvent((session: HostStoredSession | null) => {
    hostSessionRef.current = session;
    if (session) saveHostStoredSession(session);
    else clearHostStoredSession();
  });

  const resetLobbyState = useEffectEvent(() => {
    setRoomInfo(null);
    setLobby(null);
    setQrCodeDataUrl(null);
    setIsConnectingHost(false);
    setScreen("start");
    setQuestion(null);
    setRemainingMs(0);
    setAnswerProgress(null);
    setRevealedAnswer(null);
    setRevealExplanation(null);
    setRoundResults([]);
    setScoreboard(null);
    setNextQuestionReadyProgress(null);
    setFinalResult(null);
    setCurrentQuestionIndex(null);
    setTotalQuestionCount(null);
    setCatalog(null);
    setGamePlanDraft(null);
    setSelectedPlanMode("normal_evening");
    setCountdownSeconds(0);
    setShowAnswerTextOnPlayerDevices(false);
  });

  const connectHostOnCurrentSocket = useEffectEvent(() => {
    if (!hostToken) {
      setNotice({
        kind: "error",
        text: "Kein Host-Token vorhanden. Bitte QR-Code auf dem TV scannen.",
      });
      return;
    }

    setIsConnectingHost(true);
    setNotice(null);
    const sent = sendEvent(EVENTS.HOST_CONNECT, {
      hostToken,
      clientInfo: createHostClientInfo(),
    });

    if (!sent) {
      setIsConnectingHost(false);
      setNotice({ kind: "error", text: "Server ist nicht verbunden. Bitte kurz warten." });
    }
  });

  const handleServerMessage = useEffectEvent((rawMessage: string) => {
    const parsedEnvelope = parseServerToClientEnvelope(rawMessage);
    if (!parsedEnvelope.success) return;

    switch (parsedEnvelope.data.event) {
      case EVENTS.CONNECTION_ACK:
        notifyConnected();
        intentionalReconnectRef.current = false;
        if (hostSessionRef.current) {
          sendEvent(EVENTS.CONNECTION_RESUME, {
            roomId: hostSessionRef.current.roomId,
            sessionId: hostSessionRef.current.sessionId,
          });
        } else if (pendingHostConnectRef.current || hostToken) {
          pendingHostConnectRef.current = false;
          connectHostOnCurrentSocket();
        }
        return;

      case EVENTS.HOST_CONNECTED:
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
        setIsConnectingHost(false);
        setNotice(null);
        return;

      case EVENTS.CATALOG_SUMMARY:
        const catalogPayload = parsedEnvelope.data.payload;
        setCatalog(catalogPayload);
        setGamePlanDraft((current) => {
          if (current) return current;
          return buildPresetGamePlan(
            "normal_evening",
            catalogPayload,
            showAnswerTextOnPlayerDevices,
          );
        });
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

      case EVENTS.VOTE_UPDATE:
        setVotes((parsedEnvelope.data.payload as VoteUpdatePayload).votes);
        return;

      case EVENTS.LOBBY_UPDATE:
        setLobby(parsedEnvelope.data.payload);
        setShowAnswerTextOnPlayerDevices(
          parsedEnvelope.data.payload.settings.showAnswerTextOnPlayerDevices,
        );
        if (parsedEnvelope.data.payload.settings.gamePlanDraft) {
          setGamePlanDraft(parsedEnvelope.data.payload.settings.gamePlanDraft);
          setSelectedPlanMode(
            parsedEnvelope.data.payload.settings.gamePlanDraft.mode === "preset" &&
              parsedEnvelope.data.payload.settings.gamePlanDraft.presetId
              ? parsedEnvelope.data.payload.settings.gamePlanDraft.presetId
              : "custom",
          );
        }
        return;

      case EVENTS.PLAYER_DISCONNECTED: {
        const { playerId } = parsedEnvelope.data.payload;
        const name = lobby?.players.find((p) => p.playerId === playerId)?.name ?? "Spieler";
        setNotice({ kind: "info", text: `${name} hat die Verbindung verloren (30s Grace-Period)` });
        return;
      }

      case EVENTS.GAME_STARTED:
        setGamePlanDraft(parsedEnvelope.data.payload.resolvedGamePlan);
        setSelectedPlanMode(
          parsedEnvelope.data.payload.resolvedGamePlan.mode === "preset" &&
            parsedEnvelope.data.payload.resolvedGamePlan.presetId
            ? parsedEnvelope.data.payload.resolvedGamePlan.presetId
            : "custom",
        );
        setScreen("question");
        return;

      case EVENTS.QUESTION_COUNTDOWN:
        setCountdownSeconds(Math.ceil(parsedEnvelope.data.payload.countdownMs / 1000));
        setCurrentQuestionIndex(parsedEnvelope.data.payload.questionIndex);
        setTotalQuestionCount(parsedEnvelope.data.payload.totalQuestionCount);
        setScreen("countdown");
        return;

      case EVENTS.QUESTION_SHOW:
        setQuestion(parsedEnvelope.data.payload);
        setRemainingMs(parsedEnvelope.data.payload.durationMs);
        setCurrentQuestionIndex(parsedEnvelope.data.payload.questionIndex);
        setTotalQuestionCount(parsedEnvelope.data.payload.totalQuestionCount);
        setScreen("question");
        setAnswerProgress(null);
        setRevealExplanation(null);
        setScoreboard(null);
        setNextQuestionReadyProgress(null);
        return;

      case EVENTS.QUESTION_TIMER:
        setRemainingMs(parsedEnvelope.data.payload.remainingMs);
        return;

      case EVENTS.ANSWER_PROGRESS:
        setAnswerProgress(parsedEnvelope.data.payload);
        return;

      case EVENTS.QUESTION_REVEAL:
        setRevealedAnswer(parsedEnvelope.data.payload.correctAnswer);
        setRevealExplanation(parsedEnvelope.data.payload.explanation ?? null);
        setRoundResults(parsedEnvelope.data.payload.playerResults);
        setNextQuestionReadyProgress(null);
        setScreen("reveal");
        return;

      case EVENTS.SCORE_UPDATE:
        setScoreboard(parsedEnvelope.data.payload);
        setNextQuestionReadyProgress(null);
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
        setIsConnectingHost(false);
        if (
          parsedEnvelope.data.payload.code === PROTOCOL_ERROR_CODES.SESSION_NOT_FOUND ||
          parsedEnvelope.data.payload.code === PROTOCOL_ERROR_CODES.ROOM_NOT_FOUND
        ) {
          updateStoredSession(null);
          resetLobbyState();
          if (pendingHostConnectRef.current) {
            closeSocket();
          }
        }
        setNotice({
          kind: "error",
          text: getHostErrorMessage(
            parsedEnvelope.data.payload.code,
            parsedEnvelope.data.payload.message,
          ),
        });
        return;

      default:
        return;
    }
  });

  onMessage(handleServerMessage);

  useEffect(() => {
    if (!roomInfo?.joinCode) {
      setQrCodeDataUrl(null);
      return;
    }
    QRCode.toDataURL(getPlayerJoinUrl(roomInfo.joinCode), { margin: 1, width: 400 })
      .then(setQrCodeDataUrl)
      .catch(() => setQrCodeDataUrl(null));
  }, [roomInfo?.joinCode]);

  useEffect(() => {
    if (screen !== "countdown" || countdownSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setCountdownSeconds((current) => {
        if (current <= 1) return 0;
        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [screen]);

  const handleRestartInfo = useEffectEvent(() => {
    setNotice({
      kind: "info",
      text: "Um ein neues Spiel zu starten, klicke bitte am TV-Bildschirm auf 'Neues Quiz'.",
    });
  });

  const handleStartGame = useEffectEvent(() => {
    if (roomInfo && gamePlanDraft) {
      setNotice(null);
      sendEvent(EVENTS.GAME_START, { roomId: roomInfo.roomId, gamePlan: gamePlanDraft });
    }
  });

  const handleAnswerTextSettingChange = useEffectEvent((enabled: boolean) => {
    if (!roomInfo || screen !== "lobby") return;
    setShowAnswerTextOnPlayerDevices(enabled);
    setNotice(null);
    const nextDraft = gamePlanDraft
      ? { ...gamePlanDraft, showAnswerTextOnPlayerDevices: enabled }
      : null;
    if (nextDraft) setGamePlanDraft(nextDraft);
    const sent = sendEvent(EVENTS.ROOM_SETTINGS_UPDATE, {
      roomId: roomInfo.roomId,
      showAnswerTextOnPlayerDevices: enabled,
      ...(nextDraft ? { gamePlanDraft: nextDraft } : {}),
    });

    if (!sent) {
      setNotice({ kind: "error", text: "Einstellung konnte nicht gesendet werden." });
    }
  });

  const handleAdvanceQuestion = useEffectEvent(() => {
    if (roomInfo) {
      setNotice(null);
      sendEvent(EVENTS.GAME_NEXT_QUESTION, { roomId: roomInfo.roomId });
    }
  });

  const handleForceCloseQuestion = useEffectEvent(() => {
    if (!roomInfo) return;
    setNotice(null);
    sendEvent(EVENTS.QUESTION_FORCE_CLOSE, { roomId: roomInfo.roomId });
  });

  const handleShowScoreboard = useEffectEvent(() => {
    if (!roomInfo) return;
    setNotice(null);
    sendEvent(EVENTS.GAME_SHOW_SCOREBOARD, { roomId: roomInfo.roomId });
  });

  const handleFinishNow = useEffectEvent(() => {
    if (!roomInfo) return;
    setNotice(null);
    sendEvent(EVENTS.GAME_FINISH_NOW, { roomId: roomInfo.roomId });
  });

  const handleRemovePlayer = useEffectEvent((playerId: string) => {
    if (!roomInfo) return;
    setNotice(null);
    sendEvent(EVENTS.PLAYER_REMOVE, { roomId: roomInfo.roomId, playerId });
  });

  const handlePlanDraftChange = useEffectEvent((nextDraft: GamePlan) => {
    setGamePlanDraft(nextDraft);
    setShowAnswerTextOnPlayerDevices(nextDraft.showAnswerTextOnPlayerDevices);
    if (!roomInfo || screen !== "lobby") return;
    sendEvent(EVENTS.ROOM_SETTINGS_UPDATE, {
      roomId: roomInfo.roomId,
      showAnswerTextOnPlayerDevices: nextDraft.showAnswerTextOnPlayerDevices,
      gamePlanDraft: nextDraft,
    });
  });

  return {
    screen,
    notice,
    roomInfo,
    lobby,
    qrCodeDataUrl,
    isConnectingHost,
    question,
    remainingMs,
    answerProgress,
    revealedAnswer,
    revealExplanation,
    roundResults,
    scoreboard,
    nextQuestionReadyProgress,
    finalResult,
    currentQuestionIndex,
    totalQuestionCount,
    catalog,
    gamePlanDraft,
    selectedPlanMode,
    countdownSeconds,
    showAnswerTextOnPlayerDevices,
    confirmFinishNow,
    setConfirmFinishNow,
    confirmRemovePlayerId,
    setConfirmRemovePlayerId,
    handleRestartInfo,
    handleStartGame,
    handleAnswerTextSettingChange,
    handleAdvanceQuestion,
    handleForceCloseQuestion,
    handleShowScoreboard,
    handleFinishNow,
    handleRemovePlayer,
    handlePlanDraftChange,
    setSelectedPlanMode,
    votes,
  };
}

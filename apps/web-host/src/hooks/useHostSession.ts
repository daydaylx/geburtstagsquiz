import {
  type AnswerProgressPayload,
  type CatalogSummaryPayload,
  type ClientToServerEventPayloadMap,
  EVENTS,
  type GameFinishedPayload,
  type LobbyUpdatePayload,
  type NextQuestionReadyProgressPayload,
  PROTOCOL_ERROR_CODES,
  parseServerToClientEnvelope,
  type QuestionRevealPayload,
  type QuestionShowPayload,
  type ScoreUpdatePayload,
  type VoteUpdatePayload,
} from "@quiz/shared-protocol";
import { type GamePlan, type GamePlanPresetId, GameState } from "@quiz/shared-types";
import QRCode from "qrcode";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { buildPresetGamePlan, createHostClientInfo } from "../lib/game-plan-drafts.js";
import { getDisplayUrl, getPlayerJoinUrl } from "../lib/helpers.js";
import {
  clearHostStoredSession,
  type HostStoredSession,
  loadHostStoredSession,
  saveHostStoredSession,
} from "../storage.js";

function getHostErrorMessage(code: string, fallback: string): string {
  switch (code) {
    case PROTOCOL_ERROR_CODES.NOT_AUTHORIZED:
      return "Dieser Host-Code wurde bereits verwendet. Bitte denselben Browser verwenden oder im Host einen neuen Raum erstellen.";
    case PROTOCOL_ERROR_CODES.SESSION_NOT_FOUND:
    case PROTOCOL_ERROR_CODES.ROOM_NOT_FOUND:
      return "Die Sitzung wurde nicht gefunden oder der Raum wurde geschlossen. Bitte im Host einen neuen Raum erstellen.";
    default:
      return fallback;
  }
}

export type HostScreen = "start" | "lobby" | "countdown" | "question" | "reveal" | "scoreboard" | "finished";

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
  displayConnected: boolean;
  displayConnectToken: string | null;
  question: QuestionShowPayload | null;
  remainingMs: number;
  answerProgress: AnswerProgressPayload | null;
  revealedAnswer: QuestionRevealPayload["correctAnswer"] | null;
  revealExplanation: string | null;
  revealEstimateContext: string | null;
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
  handleCreateRoom: () => void;
  handleOpenDisplay: () => void;
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
  const [revealedAnswer, setRevealedAnswer] = useState<QuestionRevealPayload["correctAnswer"] | null>(null);
  const [revealExplanation, setRevealExplanation] = useState<string | null>(null);
  const [revealEstimateContext, setRevealEstimateContext] = useState<string | null>(null);
  const [roundResults, setRoundResults] = useState<QuestionRevealPayload["playerResults"]>([]);
  const [scoreboard, setScoreboard] = useState<ScoreUpdatePayload | null>(null);
  const [nextQuestionReadyProgress, setNextQuestionReadyProgress] = useState<NextQuestionReadyProgressPayload | null>(
    null,
  );
  const [finalResult, setFinalResult] = useState<GameFinishedPayload | null>(null);
  const [votes, setVotes] = useState<Record<string, number>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number | null>(null);
  const [totalQuestionCount, setTotalQuestionCount] = useState<number | null>(null);
  const [catalog, setCatalog] = useState<CatalogSummaryPayload | null>(null);
  const [gamePlanDraft, setGamePlanDraft] = useState<GamePlan | null>(null);
  const [selectedPlanMode, setSelectedPlanMode] = useState<GamePlanPresetId | "custom">("normal_evening");
  const [countdownSeconds, setCountdownSeconds] = useState(0);
  const [showAnswerTextOnPlayerDevices, setShowAnswerTextOnPlayerDevices] = useState(false);
  const [confirmFinishNow, setConfirmFinishNow] = useState(false);
  const [confirmRemovePlayerId, setConfirmRemovePlayerId] = useState<string | null>(null);
  const [displayConnected, setDisplayConnected] = useState(false);
  const [displayConnectToken, setDisplayConnectToken] = useState<string | null>(null);

  const hostSessionRef = useRef<HostStoredSession | null>(initialSession);
  const intentionalReconnectRef = useRef(false);
  const pendingHostConnectRef = useRef(false);

  const updateStoredSession = useEffectEvent((session: HostStoredSession | null) => {
    hostSessionRef.current = session;
    if (session) saveHostStoredSession(session);
    else clearHostStoredSession();
  });

  const resetLobbyState = useEffectEvent(() => {
    // Geschlossene oder ungueltige Host-Sessions koennen nicht resumed werden.
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
    setRevealEstimateContext(null);
    setRoundResults([]);
    setScoreboard(null);
    setNextQuestionReadyProgress(null);
    setFinalResult(null);
    setCurrentQuestionIndex(null);
    setTotalQuestionCount(null);
    setCatalog(null);
    setGamePlanDraft(null);
    setSelectedPlanMode("normal_evening");
    setVotes({});
    setCountdownSeconds(0);
    setShowAnswerTextOnPlayerDevices(false);
    setConfirmFinishNow(false);
    setConfirmRemovePlayerId(null);
    setDisplayConnected(false);
    setDisplayConnectToken(null);
  });

  const connectHostOnCurrentSocket = useEffectEvent(() => {
    if (!hostToken) {
      setNotice({
        kind: "error",
        text: "Kein Host-Token vorhanden. Bitte im Host einen neuen Raum erstellen.",
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
      // --- Connection & Resume ---
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

      case EVENTS.HOST_ROOM_CREATED: {
        const p = parsedEnvelope.data.payload;
        updateStoredSession({ roomId: p.roomId, sessionId: p.hostSessionId });
        setRoomInfo({ roomId: p.roomId, joinCode: p.joinCode });
        setDisplayConnectToken(p.displayConnectToken);
        setShowAnswerTextOnPlayerDevices(false);
        setScreen("lobby");
        setIsConnectingHost(false);
        setNotice(null);
        return;
      }

      case EVENTS.HOST_DISPLAY_PAIRED:
        setDisplayConnected(parsedEnvelope.data.payload.displayConnected);
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
        setDisplayConnectToken(parsedEnvelope.data.payload.displayConnectToken ?? null);
        setShowAnswerTextOnPlayerDevices(false);
        setScreen("lobby");
        setIsConnectingHost(false);
        setNotice(null);
        return;

      case EVENTS.CATALOG_SUMMARY: {
        const catalogPayload = parsedEnvelope.data.payload;
        setCatalog(catalogPayload);
        setGamePlanDraft((current) => {
          if (current) return current;
          return buildPresetGamePlan("normal_evening", catalogPayload, showAnswerTextOnPlayerDevices);
        });
        return;
      }

      case EVENTS.CONNECTION_RESUMED:
        if (parsedEnvelope.data.payload.role !== "host") return;
        setRoomInfo({
          roomId: parsedEnvelope.data.payload.roomId,
          joinCode: parsedEnvelope.data.payload.joinCode,
        });
        setDisplayConnectToken(parsedEnvelope.data.payload.displayConnectToken ?? null);
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

      // --- Lobby ---
      case EVENTS.VOTE_UPDATE:
        setVotes((parsedEnvelope.data.payload as VoteUpdatePayload).votes);
        return;

      case EVENTS.LOBBY_UPDATE:
        setLobby(parsedEnvelope.data.payload);
        setDisplayConnected(parsedEnvelope.data.payload.displayConnected);
        setShowAnswerTextOnPlayerDevices(parsedEnvelope.data.payload.settings.showAnswerTextOnPlayerDevices);
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

      // --- Game Flow: Countdown → Question → Answer → Reveal → Scoreboard ---
      case EVENTS.GAME_STARTED:
        setGamePlanDraft(parsedEnvelope.data.payload.resolvedGamePlan);
        setSelectedPlanMode(
          parsedEnvelope.data.payload.resolvedGamePlan.mode === "preset" &&
            parsedEnvelope.data.payload.resolvedGamePlan.presetId
            ? parsedEnvelope.data.payload.resolvedGamePlan.presetId
            : "custom",
        );
        setConfirmFinishNow(false);
        setConfirmRemovePlayerId(null);
        setScreen("question");
        return;

      case EVENTS.QUESTION_COUNTDOWN:
        setCountdownSeconds(Math.ceil(parsedEnvelope.data.payload.countdownMs / 1000));
        setCurrentQuestionIndex(parsedEnvelope.data.payload.questionIndex);
        setTotalQuestionCount(parsedEnvelope.data.payload.totalQuestionCount);
        setConfirmFinishNow(false);
        setConfirmRemovePlayerId(null);
        setScreen("countdown");
        return;

      case EVENTS.QUESTION_SHOW:
        setQuestion(parsedEnvelope.data.payload);
        setRemainingMs(parsedEnvelope.data.payload.durationMs);
        setCurrentQuestionIndex(parsedEnvelope.data.payload.questionIndex);
        setTotalQuestionCount(parsedEnvelope.data.payload.totalQuestionCount);
        setConfirmFinishNow(false);
        setConfirmRemovePlayerId(null);
        setScreen("question");
        setAnswerProgress(null);
        setRevealExplanation(null);
        setRevealEstimateContext(null);
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
        setRevealEstimateContext(parsedEnvelope.data.payload.estimateContext ?? null);
        setRoundResults(parsedEnvelope.data.payload.playerResults);
        setNextQuestionReadyProgress(null);
        setConfirmFinishNow(false);
        setConfirmRemovePlayerId(null);
        setScreen("reveal");
        return;

      case EVENTS.SCORE_UPDATE:
        setScoreboard(parsedEnvelope.data.payload);
        setNextQuestionReadyProgress(null);
        setConfirmFinishNow(false);
        setConfirmRemovePlayerId(null);
        setScreen("scoreboard");
        return;

      // --- Game End & Restart ---
      case EVENTS.GAME_FINISHED:
        setFinalResult(parsedEnvelope.data.payload);
        setConfirmFinishNow(false);
        setConfirmRemovePlayerId(null);
        setScreen("finished");
        return;

      case EVENTS.ROOM_RESET: {
        const resetPayload = parsedEnvelope.data.payload;
        // Host-Neustart behaelt den Raum, entfernt aber alle laufenden Runden- und Votingdaten.
        setRoomInfo({
          roomId: resetPayload.roomId,
          joinCode: resetPayload.joinCode,
        });
        setQuestion(null);
        setRemainingMs(0);
        setAnswerProgress(null);
        setRevealedAnswer(null);
        setRevealExplanation(null);
        setRevealEstimateContext(null);
        setRoundResults([]);
        setScoreboard(null);
        setNextQuestionReadyProgress(null);
        setFinalResult(null);
        setCurrentQuestionIndex(null);
        setTotalQuestionCount(null);
        setCatalog(null);
        setGamePlanDraft(null);
        setSelectedPlanMode("normal_evening");
        setVotes({});
        setScreen("lobby");
        setNotice(null);
        return;
      }

      case EVENTS.NEXT_QUESTION_READY_PROGRESS:
        setNextQuestionReadyProgress(parsedEnvelope.data.payload);
        return;

      case EVENTS.ROOM_CLOSED:
        // Raum geschlossen: lokale Host-Session verwerfen und zur Startansicht zurueck.
        resetLobbyState();
        updateStoredSession(null);
        return;

      case EVENTS.ERROR_PROTOCOL:
        setIsConnectingHost(false);
        if (
          parsedEnvelope.data.payload.code === PROTOCOL_ERROR_CODES.SESSION_NOT_FOUND ||
          parsedEnvelope.data.payload.code === PROTOCOL_ERROR_CODES.ROOM_NOT_FOUND
        ) {
          // Eine nicht mehr gueltige Session darf nicht weiter automatisch resumed werden.
          updateStoredSession(null);
          resetLobbyState();
          if (pendingHostConnectRef.current) {
            closeSocket();
          }
        }
        setNotice({
          kind: "error",
          text: getHostErrorMessage(parsedEnvelope.data.payload.code, parsedEnvelope.data.payload.message),
        });
        return;

      default:
        return;
    }
  });

  useEffect(() => {
    onMessage(handleServerMessage);
  }, [onMessage]);

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
  }, [screen, countdownSeconds]);

  const handleCreateRoom = useEffectEvent(() => {
    setIsConnectingHost(true);
    setNotice(null);
    const sent = sendEvent(EVENTS.HOST_CREATE_ROOM, { clientInfo: createHostClientInfo() });
    if (!sent) {
      setIsConnectingHost(false);
      setNotice({ kind: "error", text: "Server ist nicht verbunden. Bitte kurz warten." });
    }
  });

  const handleOpenDisplay = useEffectEvent(() => {
    if (!roomInfo || !displayConnectToken) return;
    const url = getDisplayUrl(displayConnectToken, roomInfo.roomId);
    const popup = window.open(url, "quiz-display", "noopener");
    if (!popup) {
      setNotice({
        kind: "info",
        text: `Display-Fenster wurde blockiert. Bitte manuell öffnen: ${url}`,
      });
    }
  });

  const handleRestartInfo = useEffectEvent(() => {
    if (roomInfo) {
      const sent = sendEvent(EVENTS.GAME_RESTART, { roomId: roomInfo.roomId });
      if (!sent) {
        updateStoredSession(null);
        window.location.href = window.location.pathname;
      }
    } else {
      updateStoredSession(null);
      window.location.href = window.location.pathname;
    }
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
    const nextDraft = gamePlanDraft ? { ...gamePlanDraft, showAnswerTextOnPlayerDevices: enabled } : null;
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
    displayConnected,
    displayConnectToken,
    question,
    remainingMs,
    answerProgress,
    revealedAnswer,
    revealExplanation,
    revealEstimateContext,
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
    handleCreateRoom,
    handleOpenDisplay,
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

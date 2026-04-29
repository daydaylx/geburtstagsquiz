import { useEffect, useEffectEvent, useRef, useState } from "react";
import QRCode from "qrcode";

import {
  EVENTS,
  PROTOCOL_ERROR_CODES,
  parseServerToClientEnvelope,
  serializeEnvelope,
  type AnswerProgressPayload,
  type CatalogSummaryPayload,
  type ClientToServerEventPayloadMap,
  type GameFinishedPayload,
  type LobbyUpdatePayload,
  type NextQuestionReadyProgressPayload,
  type QuestionRevealPayload,
  type QuestionShowPayload,
  type ScoreUpdatePayload,
} from "@quiz/shared-protocol";
import {
  GameState,
  QuestionType,
  type DisplayShowLevel,
  type GamePlan,
  type GamePlanPresetId,
  type RevealMode,
} from "@quiz/shared-types";
import { getReconnectDelay, getWebSocketProtocol, isLoopbackHostname } from "@quiz/shared-utils";

import {
  clearHostStoredSession,
  loadHostStoredSession,
  saveHostStoredSession,
  type HostStoredSession,
} from "./storage.js";

type ConnectionState = "connecting" | "connected" | "reconnecting";
type HostScreen =
  | "start"
  | "lobby"
  | "countdown"
  | "question"
  | "reveal"
  | "scoreboard"
  | "finished";

interface HostRoomInfo {
  roomId: string;
  joinCode: string;
}

interface HostNotice {
  kind: "info" | "error";
  text: string;
}

const FLOW_STEPS = ["Lobby", "Kategorien", "Frage", "Auflösung", "Endstand"] as const;
const PRESET_IDS: GamePlanPresetId[] = [
  "quick_dirty",
  "normal_evening",
  "full_evening",
  "chaos_party",
];
const QUESTION_COUNT_CHOICES = [10, 15, 20, 25, 30] as const;
const TIMER_CHOICES = [20_000, 30_000, 45_000, 60_000] as const;
const REVEAL_CHOICES: Array<{ label: string; value: number; mode: RevealMode }> = [
  { label: "Kurz", value: 3_000, mode: "auto" },
  { label: "Normal", value: 5_000, mode: "auto" },
  { label: "Lang", value: 8_000, mode: "auto" },
  { label: "Host entscheidet", value: 15_000, mode: "manual_with_fallback" },
];
const DEFAULT_CUSTOM_TYPES = [
  QuestionType.MultipleChoice,
  QuestionType.MajorityGuess,
  QuestionType.Estimate,
  QuestionType.Logic,
  QuestionType.Ranking,
];

function getViteEnv(name: string): string | undefined {
  return (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.[name];
}

function getPublicHost(): string {
  return getViteEnv("VITE_PUBLIC_HOST") ?? window.location.hostname;
}

function applyFallbackPlayerOrigin(url: URL): void {
  url.hostname = getPublicHost();

  const explicitPort = getViteEnv("VITE_PLAYER_PORT");
  if (explicitPort) {
    url.port = explicitPort;
    return;
  }

  if (isLoopbackHostname(url.hostname)) {
    url.port = "5174";
    return;
  }

  const labels = url.hostname.split(".");
  if (labels.length > 2 && ["tv", "host", "play"].includes(labels[0])) {
    url.hostname = ["play", ...labels.slice(1)].join(".");
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
  applyFallbackPlayerOrigin(url);
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

function getAnswerDisplayLabel(index: number): string {
  return index < 26 ? String.fromCharCode(65 + index) : `${index + 1}`;
}

function getPresetLabel(presetId: GamePlanPresetId): string {
  switch (presetId) {
    case "quick_dirty":
      return "Kurz & dreckig";
    case "normal_evening":
      return "Normaler Abendmodus";
    case "full_evening":
      return "Voller Quizabend";
    case "chaos_party":
      return "Chaos-/Party-Modus";
  }
}

function getPresetHint(presetId: GamePlanPresetId): string {
  switch (presetId) {
    case "quick_dirty":
      return "12 Fragen, schnell, wenig Frust.";
    case "normal_evening":
      return "20 Fragen, gemischt, Geburtstags-Default.";
    case "full_evening":
      return "30 Fragen, langer Mix.";
    case "chaos_party":
      return "18 Fragen, Tempo und Lacher.";
  }
}

function getQuestionTypeLabel(type: QuestionType): string {
  switch (type) {
    case QuestionType.MultipleChoice:
      return "Multiple Choice";
    case QuestionType.Estimate:
      return "Schätzfragen";
    case QuestionType.MajorityGuess:
      return "Mehrheitsfragen";
    case QuestionType.Ranking:
      return "Ranking";
    case QuestionType.Logic:
      return "Denkfragen";
    case QuestionType.OpenText:
      return "Freitext";
  }
}

function getShowLevelLabel(level: DisplayShowLevel): string {
  switch (level) {
    case "minimal":
      return "Minimal";
    case "normal":
      return "Normal";
    case "high":
      return "High";
  }
}

function getAvailableQuestionTypes(catalog: CatalogSummaryPayload): QuestionType[] {
  return catalog.questionTypes.map((entry) => entry.type);
}

function getDefaultCategoryIds(catalog: CatalogSummaryPayload, includeHard: boolean): string[] {
  return catalog.categories
    .filter((category) => includeHard || category.difficulty !== "hard")
    .map((category) => category.id);
}

function buildPresetGamePlan(
  presetId: GamePlanPresetId,
  catalog: CatalogSummaryPayload,
  showAnswerTextOnPlayerDevices: boolean,
): GamePlan {
  const includeHard = presetId === "normal_evening" || presetId === "full_evening";
  const categoryIds = getDefaultCategoryIds(catalog, includeHard);
  const allTypes = getAvailableQuestionTypes(catalog);

  const byPreset: Record<GamePlanPresetId, Omit<GamePlan, "categoryIds">> = {
    quick_dirty: {
      mode: "preset",
      presetId,
      questionCount: 12,
      questionTypes: [
        QuestionType.MultipleChoice,
        QuestionType.MajorityGuess,
        QuestionType.Estimate,
        QuestionType.Logic,
      ].filter((type) => allTypes.includes(type)),
      timerMs: 20_000,
      revealDurationMs: 3_000,
      revealMode: "auto",
      showAnswerTextOnPlayerDevices,
      enableDemoQuestion: true,
      displayShowLevel: "high",
      rankingScoringMode: "partial_with_bonus",
    },
    normal_evening: {
      mode: "preset",
      presetId,
      questionCount: 20,
      questionTypes: DEFAULT_CUSTOM_TYPES.filter((type) => allTypes.includes(type)),
      timerMs: 30_000,
      revealDurationMs: 5_000,
      revealMode: "auto",
      showAnswerTextOnPlayerDevices,
      enableDemoQuestion: true,
      displayShowLevel: "high",
      rankingScoringMode: "partial_with_bonus",
    },
    full_evening: {
      mode: "preset",
      presetId,
      questionCount: 30,
      questionTypes: allTypes,
      timerMs: 30_000,
      revealDurationMs: 5_000,
      revealMode: "auto",
      showAnswerTextOnPlayerDevices,
      enableDemoQuestion: true,
      displayShowLevel: "high",
      rankingScoringMode: "partial_with_bonus",
    },
    chaos_party: {
      mode: "preset",
      presetId,
      questionCount: 18,
      questionTypes: [
        QuestionType.MultipleChoice,
        QuestionType.MajorityGuess,
        QuestionType.Estimate,
      ].filter((type) => allTypes.includes(type)),
      timerMs: 20_000,
      revealDurationMs: 3_000,
      revealMode: "auto",
      showAnswerTextOnPlayerDevices,
      enableDemoQuestion: true,
      displayShowLevel: "high",
      rankingScoringMode: "partial_with_bonus",
    },
  };

  return {
    ...byPreset[presetId],
    categoryIds,
  };
}

function buildCustomGamePlan(
  catalog: CatalogSummaryPayload,
  showAnswerTextOnPlayerDevices: boolean,
): GamePlan {
  const allTypes = getAvailableQuestionTypes(catalog);

  return {
    mode: "custom",
    questionCount: 20,
    categoryIds: catalog.categories.map((category) => category.id),
    questionTypes: DEFAULT_CUSTOM_TYPES.filter((type) => allTypes.includes(type)),
    timerMs: 30_000,
    revealDurationMs: 5_000,
    revealMode: "auto",
    showAnswerTextOnPlayerDevices,
    enableDemoQuestion: true,
    displayShowLevel: "high",
    rankingScoringMode: "partial_with_bonus",
  };
}

function createHostClientInfo() {
  return { deviceType: "browser", appVersion: "0.0.1" };
}

export function App() {
  const initialSession = loadHostStoredSession();
  const urlParams = new URLSearchParams(window.location.search);
  const hostToken = urlParams.get("hostToken");

  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
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

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const hostSessionRef = useRef<HostStoredSession | null>(initialSession);
  const shouldReconnectRef = useRef(true);
  const intentionalReconnectRef = useRef(false);
  const pendingHostConnectRef = useRef(false);

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
    const sent = sendClientEvent(EVENTS.HOST_CONNECT, {
      hostToken,
      clientInfo: createHostClientInfo(),
    });

    if (!sent) {
      setIsConnectingHost(false);
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
        setIsConnectingHost(false);
        if (
          parsedEnvelope.data.payload.code === PROTOCOL_ERROR_CODES.SESSION_NOT_FOUND ||
          parsedEnvelope.data.payload.code === PROTOCOL_ERROR_CODES.ROOM_NOT_FOUND
        ) {
          updateStoredSession(null);
          resetLobbyState();
          if (pendingHostConnectRef.current) {
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

  useEffect(() => {
    if (screen !== "countdown" || countdownSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setCountdownSeconds((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [screen, countdownSeconds]);

  const handleRestartInfo = useEffectEvent(() => {
    setNotice({
      kind: "info",
      text: "Um ein neues Spiel zu starten, klicke bitte am TV-Bildschirm auf 'Neues Quiz'.",
    });
  });

  const handleStartGame = useEffectEvent(() => {
    if (roomInfo && gamePlanDraft) {
      setNotice(null);
      sendClientEvent(EVENTS.GAME_START, { roomId: roomInfo.roomId, gamePlan: gamePlanDraft });
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
    const sent = sendClientEvent(EVENTS.ROOM_SETTINGS_UPDATE, {
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
      sendClientEvent(EVENTS.GAME_NEXT_QUESTION, { roomId: roomInfo.roomId });
    }
  });

  const handleForceCloseQuestion = useEffectEvent(() => {
    if (!roomInfo) return;
    setNotice(null);
    sendClientEvent(EVENTS.QUESTION_FORCE_CLOSE, { roomId: roomInfo.roomId });
  });

  const handleShowScoreboard = useEffectEvent(() => {
    if (!roomInfo) return;
    setNotice(null);
    sendClientEvent(EVENTS.GAME_SHOW_SCOREBOARD, { roomId: roomInfo.roomId });
  });

  const handleFinishNow = useEffectEvent(() => {
    if (!roomInfo) return;
    setNotice(null);
    sendClientEvent(EVENTS.GAME_FINISH_NOW, { roomId: roomInfo.roomId });
  });

  const handleRemovePlayer = useEffectEvent((playerId: string) => {
    if (!roomInfo) return;
    setNotice(null);
    sendClientEvent(EVENTS.PLAYER_REMOVE, { roomId: roomInfo.roomId, playerId });
  });

  const handlePlanDraftChange = useEffectEvent((nextDraft: GamePlan) => {
    setGamePlanDraft(nextDraft);
    setShowAnswerTextOnPlayerDevices(nextDraft.showAnswerTextOnPlayerDevices);
    if (!roomInfo || screen !== "lobby") return;
    sendClientEvent(EVENTS.ROOM_SETTINGS_UPDATE, {
      roomId: roomInfo.roomId,
      showAnswerTextOnPlayerDevices: nextDraft.showAnswerTextOnPlayerDevices,
      gamePlanDraft: nextDraft,
    });
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
  const latestScoreChanges = scoreboard?.scoreChanges ?? [];

  const effectiveTotalQuestionCount =
    totalQuestionCount ?? question?.totalQuestionCount ?? finalResult?.totalQuestionCount ?? null;
  const currentQuestionNumber = currentQuestionIndex !== null ? currentQuestionIndex + 1 : 0;
  const visibleQuestionNumber =
    screen === "finished" ? effectiveTotalQuestionCount || 0 : currentQuestionNumber;
  const questionProgressPercent = effectiveTotalQuestionCount
    ? (visibleQuestionNumber / effectiveTotalQuestionCount) * 100
    : 0;
  const playerJoinUrl = roomInfo?.joinCode ? getPlayerJoinUrl(roomInfo.joinCode) : null;

  const currentFlowStepIndex =
    screen === "finished"
      ? 4
      : screen === "scoreboard" || screen === "reveal"
        ? 3
        : screen === "question" || screen === "countdown"
          ? 2
          : 1;

  const renderStagePanel = () => {
    if (screen === "lobby" && roomInfo) {
      return (
        <div className="host-panel-content host-lobby-stage">
          <p className="host-section-label host-section-label--compact">Status</p>
          <h2 className="host-stage-title">Verbunden mit TV-Display</h2>
          <p className="host-lobby-hint">
            Warte auf Spieler... Die Spieler können über den QR-Code am Fernseher beitreten.
          </p>
          <div className="host-lobby-stats">
            <div className="host-stat-card">
              <span className="host-stat-value">{connectedPlayerCount}</span>
              <span className="host-stat-label">Spieler bereit</span>
            </div>
            <div className="host-stat-card">
              <span className="host-stat-value">{gamePlanDraft?.questionCount ?? "-"}</span>
              <span className="host-stat-label">Fragen</span>
            </div>
          </div>
          {catalog && gamePlanDraft ? (
            <div className="host-plan-builder">
              <div className="host-section-head">
                <p className="host-section-label">Spielplan</p>
                <span className="host-online-count">{catalog.totalQuestions} Fragen verfügbar</span>
              </div>
              <div className="host-preset-grid">
                {PRESET_IDS.map((presetId) => (
                  <button
                    className="host-preset-button"
                    data-active={selectedPlanMode === presetId ? "true" : undefined}
                    key={presetId}
                    onClick={() => {
                      setSelectedPlanMode(presetId);
                      handlePlanDraftChange(
                        buildPresetGamePlan(
                          presetId,
                          catalog,
                          gamePlanDraft.showAnswerTextOnPlayerDevices,
                        ),
                      );
                    }}
                    type="button"
                  >
                    <strong>{getPresetLabel(presetId)}</strong>
                    <small>{getPresetHint(presetId)}</small>
                  </button>
                ))}
                <button
                  className="host-preset-button"
                  data-active={selectedPlanMode === "custom" ? "true" : undefined}
                  onClick={() => {
                    setSelectedPlanMode("custom");
                    handlePlanDraftChange(
                      buildCustomGamePlan(catalog, gamePlanDraft.showAnswerTextOnPlayerDevices),
                    );
                  }}
                  type="button"
                >
                  <strong>Freie Auswahl</strong>
                  <small>Fragen, Kategorien und Typen selbst setzen.</small>
                </button>
              </div>

              {selectedPlanMode === "custom" && (
                <div className="host-custom-plan">
                  <div className="host-choice-row">
                    <span>Fragen</span>
                    <div className="host-segmented">
                      {QUESTION_COUNT_CHOICES.map((count) => (
                        <button
                          data-active={gamePlanDraft.questionCount === count ? "true" : undefined}
                          key={count}
                          onClick={() =>
                            handlePlanDraftChange({ ...gamePlanDraft, questionCount: count })
                          }
                          type="button"
                        >
                          {count}
                        </button>
                      ))}
                    </div>
                    <input
                      className="host-small-number-input"
                      max={catalog.maxQuestionCount}
                      min={5}
                      onChange={(event) => {
                        const nextCount = Math.max(
                          5,
                          Math.min(catalog.maxQuestionCount, Number(event.target.value) || 5),
                        );
                        handlePlanDraftChange({ ...gamePlanDraft, questionCount: nextCount });
                      }}
                      type="number"
                      value={gamePlanDraft.questionCount}
                    />
                  </div>
                  <div className="host-choice-row">
                    <span>Timer</span>
                    <div className="host-segmented">
                      {TIMER_CHOICES.map((timerMs) => (
                        <button
                          data-active={gamePlanDraft.timerMs === timerMs ? "true" : undefined}
                          key={timerMs}
                          onClick={() => handlePlanDraftChange({ ...gamePlanDraft, timerMs })}
                          type="button"
                        >
                          {timerMs / 1000}s
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="host-choice-row">
                    <span>Reveal</span>
                    <div className="host-segmented">
                      {REVEAL_CHOICES.map((choice) => (
                        <button
                          data-active={
                            gamePlanDraft.revealDurationMs === choice.value &&
                            gamePlanDraft.revealMode === choice.mode
                              ? "true"
                              : undefined
                          }
                          key={`${choice.mode}-${choice.value}`}
                          onClick={() =>
                            handlePlanDraftChange({
                              ...gamePlanDraft,
                              revealDurationMs: choice.value,
                              revealMode: choice.mode,
                            })
                          }
                          type="button"
                        >
                          {choice.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="host-choice-row">
                    <span>Show</span>
                    <div className="host-segmented">
                      {(["minimal", "normal", "high"] as const).map((displayShowLevel) => (
                        <button
                          data-active={
                            gamePlanDraft.displayShowLevel === displayShowLevel ? "true" : undefined
                          }
                          key={displayShowLevel}
                          onClick={() =>
                            handlePlanDraftChange({ ...gamePlanDraft, displayShowLevel })
                          }
                          type="button"
                        >
                          {getShowLevelLabel(displayShowLevel)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="host-checkbox-pill host-checkbox-pill--wide">
                    <input
                      checked={gamePlanDraft.enableDemoQuestion}
                      onChange={(event) =>
                        handlePlanDraftChange({
                          ...gamePlanDraft,
                          enableDemoQuestion: event.target.checked,
                        })
                      }
                      type="checkbox"
                    />
                    <span>Demo-/Testfrage vor dem echten Spiel</span>
                  </label>
                  <div className="host-checkbox-grid">
                    {catalog.categories.map((category) => (
                      <label className="host-checkbox-pill" key={category.id}>
                        <input
                          checked={gamePlanDraft.categoryIds.includes(category.id)}
                          onChange={(event) => {
                            const categoryIds = event.target.checked
                              ? [...gamePlanDraft.categoryIds, category.id]
                              : gamePlanDraft.categoryIds.filter((id) => id !== category.id);
                            handlePlanDraftChange({ ...gamePlanDraft, categoryIds });
                          }}
                          type="checkbox"
                        />
                        <span>{category.name}</span>
                      </label>
                    ))}
                  </div>
                  <div className="host-checkbox-grid host-checkbox-grid--types">
                    {catalog.questionTypes.map((entry) => (
                      <label className="host-checkbox-pill" key={entry.type}>
                        <input
                          checked={gamePlanDraft.questionTypes.includes(entry.type)}
                          onChange={(event) => {
                            const questionTypes = event.target.checked
                              ? [...gamePlanDraft.questionTypes, entry.type]
                              : gamePlanDraft.questionTypes.filter((type) => type !== entry.type);
                            handlePlanDraftChange({ ...gamePlanDraft, questionTypes });
                          }}
                          type="checkbox"
                        />
                        <span>
                          {getQuestionTypeLabel(entry.type)} ({entry.count})
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="host-plan-summary">
                <span>{gamePlanDraft.questionCount} Fragen</span>
                <span>{gamePlanDraft.timerMs / 1000}s Timer</span>
                <span>
                  {gamePlanDraft.revealMode === "manual_with_fallback"
                    ? "Manuelles Reveal"
                    : `${gamePlanDraft.revealDurationMs / 1000}s Reveal`}
                </span>
                <span>Show: {getShowLevelLabel(gamePlanDraft.displayShowLevel)}</span>
                <span>Demo: {gamePlanDraft.enableDemoQuestion ? "an" : "aus"}</span>
              </div>
            </div>
          ) : (
            <div className="host-estimate-display">Lade Fragenkatalog...</div>
          )}
        </div>
      );
    }

    if (screen === "countdown") {
      return (
        <div className="host-panel-content host-countdown-panel">
          <p className="host-section-label">Nächste Frage</p>
          <div className="host-countdown-number">
            {countdownSeconds > 0 ? countdownSeconds : "Frage!"}
          </div>
          <p className="host-lobby-hint">Timer startet gleich auf dem TV.</p>
        </div>
      );
    }

    if (screen === "question" && question) {
      return (
        <div className="host-panel-content">
          <div className="host-stage-head">
            <p className="host-section-label">
              {question.isDemoQuestion
                ? "Testfrage"
                : `Frage ${currentQuestionNumber}${effectiveTotalQuestionCount ? ` / ${effectiveTotalQuestionCount}` : ""}`}
            </p>
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
            question.type === QuestionType.Logic ||
            question.type === QuestionType.MajorityGuess) && (
            <div className="host-options-grid">
              {question.options.map((opt, index) => (
                <div className="host-option-card" key={opt.id}>
                  <span className="host-option-id">{getAnswerDisplayLabel(index)}</span>
                  <span className="host-option-label">{opt.label}</span>
                </div>
              ))}
            </div>
          )}
          {question.type === QuestionType.Estimate && (
            <div className="host-estimate-display">
              Schätzungen laufen... ({question.unit} · {question.context})
            </div>
          )}
          {question.type === QuestionType.OpenText && (
            <div className="host-estimate-display">Texteingaben laufen...</div>
          )}
          {question.type === QuestionType.Ranking && (
            <div className="host-ranking-list">
              {question.items.map((item, index) => (
                <div className="host-ranking-item" key={item.id}>
                  <span className="host-option-id">{getAnswerDisplayLabel(index)}</span>
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
                {answerProgress &&
                  answerProgress.totalEligiblePlayers - answerProgress.answeredCount > 0 && (
                    <span className="host-pending-count">
                      {" "}
                      · {answerProgress.totalEligiblePlayers - answerProgress.answeredCount} noch
                      offen
                    </span>
                  )}
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
            question.type === QuestionType.Logic ||
            question.type === QuestionType.MajorityGuess) && (
            <div className="host-options-grid host-options-grid--reveal">
              {question.options.map((opt, index) => {
                const isCorrectAnswer =
                  (revealedAnswer?.type === "option" && revealedAnswer.value === opt.id) ||
                  (revealedAnswer?.type === "options" && revealedAnswer.value.includes(opt.id));
                return (
                  <div
                    className="host-option-card"
                    data-state={isCorrectAnswer ? "correct" : "dimmed"}
                    key={opt.id}
                  >
                    <span className="host-option-id">{getAnswerDisplayLabel(index)}</span>
                    <span className="host-option-label">{opt.label}</span>
                  </div>
                );
              })}
            </div>
          )}
          {question.type === QuestionType.Estimate && revealedAnswer?.type === "number" && (
            <div className="host-estimate-display host-estimate-display--reveal">
              <span>Richtig: </span>
              <strong className="host-estimate-correct-value">
                {revealedAnswer.value} {question.unit}
              </strong>
              <span className="host-estimate-context">({question.context})</span>
            </div>
          )}
          {question.type === QuestionType.OpenText && revealedAnswer?.type === "text" && (
            <div className="host-estimate-display host-estimate-display--reveal">
              <span>Richtig: </span>
              <strong className="host-estimate-correct-value">{revealedAnswer.value}</strong>
            </div>
          )}
          {question.type === QuestionType.Ranking && revealedAnswer?.type === "ranking" && (
            <div className="host-ranking-list">
              {revealedAnswer.value.map((id, i) => {
                const itemIndex = question.items.findIndex((x) => x.id === id);
                const item = itemIndex >= 0 ? question.items[itemIndex] : undefined;
                return (
                  <div className="host-ranking-item host-ranking-item--reveal" key={id}>
                    <span className="host-ranking-position">{i + 1}.</span>
                    <span className="host-option-id">
                      {itemIndex >= 0 ? getAnswerDisplayLabel(itemIndex) : id}
                    </span>
                    <span>{item?.label ?? id}</span>
                  </div>
                );
              })}
            </div>
          )}
          {revealExplanation && <p className="host-explanation">{revealExplanation}</p>}
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
          <div
            className="host-scoreboard-list"
            data-final={screen === "finished" ? "true" : undefined}
          >
            {latestScoreboard.map((entry, index) => {
              const gap =
                index > 0 && latestScoreboard[0] ? latestScoreboard[0].score - entry.score : 0;
              return (
                <article
                  className="host-scoreboard-item"
                  data-placement={index < 3 ? String(index + 1) : undefined}
                  key={entry.playerId}
                >
                  <div className="host-scoreboard-main">
                    <span className="host-scoreboard-rank">{index + 1}.</span>
                    <span className="host-scoreboard-name">{entry.name}</span>
                  </div>
                  <div className="host-scoreboard-score">
                    {entry.score}
                    {gap > 0 && <span className="host-score-gap">−{gap}</span>}
                  </div>
                </article>
              );
            })}
          </div>
          {screen === "scoreboard" && latestScoreChanges.length > 0 && (
            <div className="host-score-change-list">
              {latestScoreChanges.slice(0, 4).map((change) => (
                <div className="host-score-change" key={change.playerId}>
                  +{change.delta} Punkte für {change.name}
                  {change.previousRank !== change.rank ? ` · jetzt Platz ${change.rank}` : ""}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    return <div className="host-empty">Warte auf Server...</div>;
  };

  const primaryActionLabel =
    screen === "lobby"
      ? "Quiz starten"
      : screen === "question"
        ? "Frage schließen"
        : screen === "reveal"
          ? "Zum Zwischenstand"
          : screen === "scoreboard"
            ? "Nächste Frage"
            : screen === "finished"
              ? "Neues Spiel"
              : "Warten...";
  const isPrimaryDisabled =
    screen === "lobby"
      ? connectionState !== "connected" || connectedPlayerCount === 0 || !gamePlanDraft || !catalog
      : screen === "question" || screen === "reveal"
        ? false
        : screen === "scoreboard"
          ? false
          : screen !== "finished";

  const startBlockReason =
    screen === "lobby" && isPrimaryDisabled
      ? connectionState !== "connected"
        ? "Nicht verbunden mit Server"
        : !catalog
          ? "Warte auf Fragenkatalog..."
          : !gamePlanDraft
            ? "Spielplan wird geladen..."
            : "Mindestens 1 Spieler benötigt"
      : null;

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
            <h2 className="host-stage-title host-stage-title--hero">
              {isConnectingHost ? "Verbindung wird hergestellt..." : "Warte auf Host-Verbindung"}
            </h2>
            <p className="host-start-hint">
              {hostToken
                ? "Der Server koppelt dein Gerät gerade als Spielleiter."
                : "Bitte scanne den Host-QR-Code auf dem TV-Display, um das Quiz zu steuern."}
            </p>
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
                {playerJoinUrl && (
                  <div className="host-join-url-row">
                    <p className="host-join-url host-join-url--sidebar">{playerJoinUrl}</p>
                    <button
                      className="host-copy-url-button"
                      onClick={() => navigator.clipboard.writeText(playerJoinUrl)}
                      title="Link kopieren"
                      type="button"
                    >
                      📋
                    </button>
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
                        <div className="host-player-actions">
                          <span className="host-player-score">{p.score}</span>
                          {confirmRemovePlayerId === p.playerId ? (
                            <>
                              <button
                                className="host-small-danger-button"
                                onClick={() => {
                                  handleRemovePlayer(p.playerId);
                                  setConfirmRemovePlayerId(null);
                                }}
                                type="button"
                              >
                                Sicher?
                              </button>
                              <button
                                className="host-small-cancel-button"
                                onClick={() => setConfirmRemovePlayerId(null)}
                                type="button"
                              >
                                ✕
                              </button>
                            </>
                          ) : (
                            <button
                              className="host-small-danger-button"
                              onClick={() => setConfirmRemovePlayerId(p.playerId)}
                              type="button"
                            >
                              Entfernen
                            </button>
                          )}
                        </div>
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
            {["countdown", "question", "reveal", "scoreboard"].includes(screen) && (
              <div className="host-fallback-actions">
                {confirmFinishNow ? (
                  <>
                    <button
                      className="host-secondary-button host-secondary-button--danger"
                      onClick={() => {
                        handleFinishNow();
                        setConfirmFinishNow(false);
                      }}
                      type="button"
                    >
                      Wirklich beenden?
                    </button>
                    <button
                      className="host-small-cancel-button"
                      onClick={() => setConfirmFinishNow(false)}
                      type="button"
                    >
                      ✕
                    </button>
                  </>
                ) : (
                  <button
                    className="host-secondary-button"
                    onClick={() => setConfirmFinishNow(true)}
                    type="button"
                  >
                    Spiel beenden
                  </button>
                )}
              </div>
            )}
            <button
              className="host-primary-button"
              disabled={isPrimaryDisabled}
              onClick={
                screen === "lobby"
                  ? handleStartGame
                  : screen === "question"
                    ? handleForceCloseQuestion
                    : screen === "reveal"
                      ? handleShowScoreboard
                      : screen === "scoreboard"
                        ? handleAdvanceQuestion
                        : handleRestartInfo
              }
              type="button"
            >
              {primaryActionLabel}
            </button>
            {startBlockReason && <p className="host-start-block-reason">{startBlockReason}</p>}
          </footer>
        </>
      ) : null}
    </main>
  );
}

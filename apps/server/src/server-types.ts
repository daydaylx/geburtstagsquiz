import type { ClientRole, Room, RoundResult, ScoreChange, SubmittedAnswer } from "@quiz/shared-types";
import type WebSocket from "ws";

export interface TrackedWebSocket extends WebSocket {
  connectionId: string;
  isAlive: boolean;
  sessionId: string | null;
}

export interface SessionRecord {
  sessionId: string;
  role: ClientRole;
  roomId: string;
  playerId?: string;
  socket: TrackedWebSocket | null;
}

export interface RoomRecord extends Room {
  createdAt: number;
  lastActivityAt: number;
  hostToken: string;
  hostTokenUsed: boolean;
  displayToken: string;
  displaySessionId: string | null;
  displayDisconnectTimer: ReturnType<typeof setTimeout> | null;
  hostDisconnectTimer: ReturnType<typeof setTimeout> | null;
  playerDisconnectTimers: Map<string, ReturnType<typeof setTimeout>>;
  countdownTimer: ReturnType<typeof setTimeout> | null;
  questionTimer: ReturnType<typeof setTimeout> | null;
  timerTickInterval: ReturnType<typeof setInterval> | null;
  revealTimer: ReturnType<typeof setTimeout> | null;
  currentAnswers: Map<string, SubmittedAnswer>;
  nextQuestionReadyPlayerIds: Set<string>;
  questionStartedAt: number | null;
  lastRoundResult: RoundResult | null;
  lastScoreChanges: ScoreChange[];
  completedRoundResults: RoundResult[];
  completedAnswers: SubmittedAnswer[];
}

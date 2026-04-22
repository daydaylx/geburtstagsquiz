import { z } from "zod";

import {
  CLIENT_ROLES,
  GameState,
  PlayerState,
  QuestionType,
  RoomState,
} from "@quiz/shared-types";
import {
  isJoinCodeFormat,
  JOIN_CODE_LENGTH,
  normalizeJoinCode,
  normalizePlayerName,
  PLAYER_NAME_MAX_LENGTH,
  PLAYER_NAME_MIN_LENGTH,
} from "@quiz/shared-utils";

import { PROTOCOL_ERROR_CODE_VALUES } from "./error-codes.js";
import { EVENTS } from "./events.js";

type InferSchemaMap<T extends Record<string, z.ZodTypeAny>> = {
  [K in keyof T]: z.infer<T[K]>;
};

const idSchema = z.string().min(1);

const displayNameSchema = z
  .string()
  .transform(normalizePlayerName)
  .pipe(
    z.string().min(PLAYER_NAME_MIN_LENGTH).max(PLAYER_NAME_MAX_LENGTH, {
      message: `Name must be between ${PLAYER_NAME_MIN_LENGTH} and ${PLAYER_NAME_MAX_LENGTH} characters`,
    }),
  );

const joinCodeSchema = z
  .string()
  .transform(normalizeJoinCode)
  .pipe(
    z.string().refine(isJoinCodeFormat, {
      message: `Join code must be ${JOIN_CODE_LENGTH} characters using the shared alphabet`,
    }),
  );

export const RoomStateSchema = z.nativeEnum(RoomState);
export const GameStateSchema = z.nativeEnum(GameState);
export const PlayerStateSchema = z.nativeEnum(PlayerState);
export const QuestionTypeSchema = z.nativeEnum(QuestionType);
export const ClientRoleSchema = z.enum(CLIENT_ROLES);

export const ClientInfoSchema = z
  .object({
    deviceType: z.string().min(1),
    appVersion: z.string().min(1),
  })
  .strict();

export const QuestionOptionSchema = z
  .object({
    id: idSchema,
    label: z.string().min(1),
  })
  .strict();

export const AnswerSchema = z
  .object({
    type: z.literal("option"),
    value: idSchema,
  })
  .strict();

export const CorrectAnswerSchema = AnswerSchema;

export const LobbyPlayerSchema = z
  .object({
    playerId: idSchema,
    name: z.string().min(1),
    connected: z.boolean(),
    score: z.number().int().nonnegative(),
  })
  .strict();

export const ScoreboardEntrySchema = z
  .object({
    playerId: idSchema,
    name: z.string().min(1),
    score: z.number().int().nonnegative(),
  })
  .strict();

export const ConnectionAckPayloadSchema = z
  .object({
    connectionId: idSchema,
    serverTime: z.string().min(1),
  })
  .strict();

export const ConnectionResumePayloadSchema = z
  .object({
    sessionId: idSchema,
    roomId: idSchema,
  })
  .strict();

export const ConnectionResumedPayloadSchema = z
  .object({
    role: ClientRoleSchema,
    roomId: idSchema,
    roomState: z.literal(RoomState.Waiting),
    sessionId: idSchema,
    joinCode: joinCodeSchema,
    playerId: idSchema.optional(),
    playerState: z.enum([PlayerState.Connected, PlayerState.Ready]).optional(),
  })
  .strict();

export const RoomCreatePayloadSchema = z
  .object({
    hostName: displayNameSchema,
    clientInfo: ClientInfoSchema,
  })
  .strict();

export const RoomCreatedPayloadSchema = z
  .object({
    roomId: idSchema,
    joinCode: joinCodeSchema,
    roomState: z.literal(RoomState.Waiting),
    hostSessionId: idSchema,
  })
  .strict();

export const RoomJoinPayloadSchema = z
  .object({
    joinCode: joinCodeSchema,
    playerName: displayNameSchema,
    sessionId: z.string().min(1).nullable().optional(),
  })
  .strict();

export const PlayerJoinedPayloadSchema = z
  .object({
    roomId: idSchema,
    playerId: idSchema,
    sessionId: idSchema,
    playerState: z.literal(PlayerState.Connected),
    roomState: z.literal(RoomState.Waiting),
  })
  .strict();

export const LobbyUpdatePayloadSchema = z
  .object({
    roomId: idSchema,
    roomState: z.literal(RoomState.Waiting),
    hostConnected: z.boolean(),
    players: z.array(LobbyPlayerSchema),
    playerCount: z.number().int().nonnegative(),
  })
  .strict();

export const PlayerReconnectedPayloadSchema = z
  .object({
    roomId: idSchema,
    playerId: idSchema,
    playerState: z.literal(PlayerState.Connected),
    connected: z.literal(true),
  })
  .strict();

export const PlayerDisconnectedPayloadSchema = z
  .object({
    roomId: idSchema,
    playerId: idSchema,
    playerState: z.literal(PlayerState.Disconnected),
    connected: z.literal(false),
  })
  .strict();

export const GameStartPayloadSchema = z
  .object({
    roomId: idSchema,
  })
  .strict();

export const GameStartedPayloadSchema = z
  .object({
    roomId: idSchema,
    roomState: z.literal(RoomState.InGame),
    gameState: z.literal(GameState.Idle),
    questionIndex: z.number().int().nonnegative(),
  })
  .strict();

export const QuestionShowPayloadSchema = z
  .object({
    roomId: idSchema,
    questionId: idSchema,
    questionIndex: z.number().int().nonnegative(),
    type: z.literal(QuestionType.MultipleChoice),
    text: z.string().min(1),
    options: z.array(QuestionOptionSchema),
    durationMs: z.number().int().positive(),
    gameState: z.literal(GameState.QuestionActive),
  })
  .strict();

export const QuestionTimerPayloadSchema = z
  .object({
    roomId: idSchema,
    questionId: idSchema,
    remainingMs: z.number().int().nonnegative(),
  })
  .strict();

export const AnswerSubmitPayloadSchema = z
  .object({
    roomId: idSchema,
    questionId: idSchema,
    playerId: idSchema,
    answer: AnswerSchema,
    requestId: idSchema,
  })
  .strict();

export const AnswerAcceptedPayloadSchema = z
  .object({
    roomId: idSchema,
    questionId: idSchema,
    playerId: idSchema,
    status: z.literal("accepted"),
  })
  .strict();

export const AnswerRejectedReasonSchema = z.enum([
  "duplicate",
  "late",
  "invalid_payload",
  "invalid_state",
  "unauthorized",
] as const);

export const AnswerRejectedPayloadSchema = z
  .object({
    roomId: idSchema,
    questionId: idSchema,
    playerId: idSchema,
    status: z.literal("rejected"),
    reason: AnswerRejectedReasonSchema,
  })
  .strict();

export const AnswerProgressPayloadSchema = z
  .object({
    roomId: idSchema,
    questionId: idSchema,
    answeredCount: z.number().int().nonnegative(),
    totalEligiblePlayers: z.number().int().nonnegative(),
  })
  .strict();

export const QuestionClosePayloadSchema = z
  .object({
    roomId: idSchema,
    questionId: idSchema,
    gameState: z.literal(GameState.AnswerLocked),
  })
  .strict();

export const QuestionRevealPayloadSchema = z
  .object({
    roomId: idSchema,
    questionId: idSchema,
    correctAnswer: CorrectAnswerSchema,
    gameState: z.literal(GameState.Revealing),
  })
  .strict();

export const ScoreUpdatePayloadSchema = z
  .object({
    roomId: idSchema,
    questionId: idSchema,
    scoreboard: z.array(ScoreboardEntrySchema),
    gameState: z.literal(GameState.Scoreboard),
  })
  .strict();

export const GameNextQuestionPayloadSchema = z
  .object({
    roomId: idSchema,
  })
  .strict();

export const GameFinishedPayloadSchema = z
  .object({
    roomId: idSchema,
    roomState: z.literal(RoomState.Completed),
    gameState: z.literal(GameState.Completed),
    finalScoreboard: z.array(ScoreboardEntrySchema),
  })
  .strict();

export const RoomClosePayloadSchema = z
  .object({
    roomId: idSchema,
  })
  .strict();

export const RoomClosedPayloadSchema = z
  .object({
    roomId: idSchema,
    roomState: z.literal(RoomState.Closed),
  })
  .strict();

export const ProtocolErrorCodeSchema = z.enum(PROTOCOL_ERROR_CODE_VALUES);

export const ErrorPayloadSchema = z
  .object({
    code: ProtocolErrorCodeSchema,
    message: z.string().min(1),
    context: z
      .object({
        event: z.nativeEnum(EVENTS).optional(),
        roomId: z.string().nullable().optional(),
        questionId: z.string().nullable().optional(),
      })
      .strict(),
  })
  .strict();

export const HOST_TO_SERVER_EVENT_SCHEMAS = {
  [EVENTS.CONNECTION_RESUME]: ConnectionResumePayloadSchema,
  [EVENTS.ROOM_CREATE]: RoomCreatePayloadSchema,
  [EVENTS.GAME_START]: GameStartPayloadSchema,
  [EVENTS.GAME_NEXT_QUESTION]: GameNextQuestionPayloadSchema,
  [EVENTS.ROOM_CLOSE]: RoomClosePayloadSchema,
} as const;

export const PLAYER_TO_SERVER_EVENT_SCHEMAS = {
  [EVENTS.CONNECTION_RESUME]: ConnectionResumePayloadSchema,
  [EVENTS.ROOM_JOIN]: RoomJoinPayloadSchema,
  [EVENTS.ANSWER_SUBMIT]: AnswerSubmitPayloadSchema,
} as const;

export const CLIENT_TO_SERVER_EVENT_SCHEMAS = {
  ...HOST_TO_SERVER_EVENT_SCHEMAS,
  ...PLAYER_TO_SERVER_EVENT_SCHEMAS,
} as const;

export const SERVER_TO_HOST_EVENT_SCHEMAS = {
  [EVENTS.CONNECTION_ACK]: ConnectionAckPayloadSchema,
  [EVENTS.CONNECTION_RESUMED]: ConnectionResumedPayloadSchema,
  [EVENTS.ROOM_CREATED]: RoomCreatedPayloadSchema,
  [EVENTS.LOBBY_UPDATE]: LobbyUpdatePayloadSchema,
  [EVENTS.PLAYER_RECONNECTED]: PlayerReconnectedPayloadSchema,
  [EVENTS.PLAYER_DISCONNECTED]: PlayerDisconnectedPayloadSchema,
  [EVENTS.GAME_STARTED]: GameStartedPayloadSchema,
  [EVENTS.QUESTION_SHOW]: QuestionShowPayloadSchema,
  [EVENTS.QUESTION_TIMER]: QuestionTimerPayloadSchema,
  [EVENTS.ANSWER_PROGRESS]: AnswerProgressPayloadSchema,
  [EVENTS.QUESTION_CLOSE]: QuestionClosePayloadSchema,
  [EVENTS.QUESTION_REVEAL]: QuestionRevealPayloadSchema,
  [EVENTS.SCORE_UPDATE]: ScoreUpdatePayloadSchema,
  [EVENTS.GAME_FINISHED]: GameFinishedPayloadSchema,
  [EVENTS.ROOM_CLOSED]: RoomClosedPayloadSchema,
  [EVENTS.ERROR_PROTOCOL]: ErrorPayloadSchema,
} as const;

export const SERVER_TO_PLAYER_EVENT_SCHEMAS = {
  [EVENTS.CONNECTION_ACK]: ConnectionAckPayloadSchema,
  [EVENTS.CONNECTION_RESUMED]: ConnectionResumedPayloadSchema,
  [EVENTS.PLAYER_JOINED]: PlayerJoinedPayloadSchema,
  [EVENTS.LOBBY_UPDATE]: LobbyUpdatePayloadSchema,
  [EVENTS.PLAYER_RECONNECTED]: PlayerReconnectedPayloadSchema,
  [EVENTS.PLAYER_DISCONNECTED]: PlayerDisconnectedPayloadSchema,
  [EVENTS.GAME_STARTED]: GameStartedPayloadSchema,
  [EVENTS.QUESTION_SHOW]: QuestionShowPayloadSchema,
  [EVENTS.QUESTION_TIMER]: QuestionTimerPayloadSchema,
  [EVENTS.ANSWER_ACCEPTED]: AnswerAcceptedPayloadSchema,
  [EVENTS.ANSWER_REJECTED]: AnswerRejectedPayloadSchema,
  [EVENTS.QUESTION_CLOSE]: QuestionClosePayloadSchema,
  [EVENTS.QUESTION_REVEAL]: QuestionRevealPayloadSchema,
  [EVENTS.SCORE_UPDATE]: ScoreUpdatePayloadSchema,
  [EVENTS.GAME_FINISHED]: GameFinishedPayloadSchema,
  [EVENTS.ROOM_CLOSED]: RoomClosedPayloadSchema,
  [EVENTS.ERROR_PROTOCOL]: ErrorPayloadSchema,
} as const;

export const SERVER_TO_CLIENT_EVENT_SCHEMAS = {
  ...SERVER_TO_HOST_EVENT_SCHEMAS,
  ...SERVER_TO_PLAYER_EVENT_SCHEMAS,
} as const;

export type ConnectionAckPayload = z.infer<typeof ConnectionAckPayloadSchema>;
export type ConnectionResumePayload = z.infer<typeof ConnectionResumePayloadSchema>;
export type ConnectionResumedPayload = z.infer<typeof ConnectionResumedPayloadSchema>;
export type RoomCreatePayload = z.infer<typeof RoomCreatePayloadSchema>;
export type RoomCreatedPayload = z.infer<typeof RoomCreatedPayloadSchema>;
export type RoomJoinPayload = z.infer<typeof RoomJoinPayloadSchema>;
export type PlayerJoinedPayload = z.infer<typeof PlayerJoinedPayloadSchema>;
export type LobbyUpdatePayload = z.infer<typeof LobbyUpdatePayloadSchema>;
export type PlayerReconnectedPayload = z.infer<typeof PlayerReconnectedPayloadSchema>;
export type PlayerDisconnectedPayload = z.infer<typeof PlayerDisconnectedPayloadSchema>;
export type GameStartPayload = z.infer<typeof GameStartPayloadSchema>;
export type GameStartedPayload = z.infer<typeof GameStartedPayloadSchema>;
export type QuestionShowPayload = z.infer<typeof QuestionShowPayloadSchema>;
export type QuestionTimerPayload = z.infer<typeof QuestionTimerPayloadSchema>;
export type AnswerSubmitPayload = z.infer<typeof AnswerSubmitPayloadSchema>;
export type AnswerAcceptedPayload = z.infer<typeof AnswerAcceptedPayloadSchema>;
export type AnswerRejectedPayload = z.infer<typeof AnswerRejectedPayloadSchema>;
export type AnswerProgressPayload = z.infer<typeof AnswerProgressPayloadSchema>;
export type QuestionClosePayload = z.infer<typeof QuestionClosePayloadSchema>;
export type QuestionRevealPayload = z.infer<typeof QuestionRevealPayloadSchema>;
export type ScoreUpdatePayload = z.infer<typeof ScoreUpdatePayloadSchema>;
export type GameNextQuestionPayload = z.infer<typeof GameNextQuestionPayloadSchema>;
export type GameFinishedPayload = z.infer<typeof GameFinishedPayloadSchema>;
export type RoomClosePayload = z.infer<typeof RoomClosePayloadSchema>;
export type RoomClosedPayload = z.infer<typeof RoomClosedPayloadSchema>;
export type ErrorPayload = z.infer<typeof ErrorPayloadSchema>;

export type HostToServerEventPayloadMap = InferSchemaMap<typeof HOST_TO_SERVER_EVENT_SCHEMAS>;
export type PlayerToServerEventPayloadMap = InferSchemaMap<typeof PLAYER_TO_SERVER_EVENT_SCHEMAS>;
export type ClientToServerEventPayloadMap = InferSchemaMap<typeof CLIENT_TO_SERVER_EVENT_SCHEMAS>;
export type ServerToHostEventPayloadMap = InferSchemaMap<typeof SERVER_TO_HOST_EVENT_SCHEMAS>;
export type ServerToPlayerEventPayloadMap = InferSchemaMap<typeof SERVER_TO_PLAYER_EVENT_SCHEMAS>;
export type ServerToClientEventPayloadMap = InferSchemaMap<typeof SERVER_TO_CLIENT_EVENT_SCHEMAS>;

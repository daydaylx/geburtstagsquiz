import { z } from "zod";

import { CLIENT_ROLES, GameState, PlayerState, QuestionType, RoomState } from "@quiz/shared-types";
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
    z
      .string()
      .min(PLAYER_NAME_MIN_LENGTH)
      .max(PLAYER_NAME_MAX_LENGTH, {
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
export const QuestionDisplayGameStateSchema = z.enum([
  GameState.QuestionActive,
  GameState.AnswerLocked,
  GameState.Revealing,
  GameState.Scoreboard,
] as const);

export const RoomSettingsSchema = z
  .object({
    showAnswerTextOnPlayerDevices: z.boolean(),
  })
  .strict();

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

export const QuestionControllerOptionSchema = z
  .object({
    id: idSchema,
    label: z.string().min(1),
    text: z.string().min(1).optional(),
  })
  .strict();

export const OptionAnswerSchema = z
  .object({
    type: z.literal("option"),
    value: idSchema,
  })
  .strict();

export const NumberAnswerSchema = z
  .object({
    type: z.literal("number"),
    value: z.number(),
  })
  .strict();

export const RankingAnswerSchema = z
  .object({
    type: z.literal("ranking"),
    value: z.array(z.string().min(1)),
  })
  .strict();

export const TextAnswerSchema = z
  .object({
    type: z.literal("text"),
    value: z.string().min(1),
  })
  .strict();

export const AnswerSchema = z.discriminatedUnion("type", [
  OptionAnswerSchema,
  NumberAnswerSchema,
  RankingAnswerSchema,
  TextAnswerSchema,
]);

export const OptionsCorrectAnswerSchema = z
  .object({
    type: z.literal("options"),
    value: z.array(idSchema),
  })
  .strict();

export const CorrectAnswerSchema = z.discriminatedUnion("type", [
  OptionAnswerSchema,
  NumberAnswerSchema,
  RankingAnswerSchema,
  TextAnswerSchema,
  OptionsCorrectAnswerSchema,
]);

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

export const PlayerRoundResultSchema = z
  .object({
    playerId: idSchema,
    answer: AnswerSchema.nullable(),
    isCorrect: z.boolean(),
    pointsEarned: z.number().int().nonnegative(),
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
    roomState: RoomStateSchema,
    sessionId: idSchema,
    joinCode: joinCodeSchema,
    gameState: GameStateSchema.nullable().optional(),
    playerId: idSchema.optional(),
    playerState: PlayerStateSchema.optional(),
    currentAnswer: AnswerSchema.nullable().optional(),
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

export const RoomSettingsUpdatePayloadSchema = z
  .object({
    roomId: idSchema,
    showAnswerTextOnPlayerDevices: z.boolean(),
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
    playerState: z.literal(PlayerState.Ready),
    roomState: z.literal(RoomState.Waiting),
  })
  .strict();

export const DisplayCreateRoomPayloadSchema = z
  .object({
    clientInfo: ClientInfoSchema.optional(),
  })
  .strict();

export const DisplayRoomCreatedPayloadSchema = z
  .object({
    roomId: idSchema,
    displaySessionId: idSchema,
    displayToken: idSchema,
    joinCode: joinCodeSchema,
    hostToken: idSchema,
  })
  .strict();

export const DisplayHostPairedPayloadSchema = z
  .object({
    hostConnected: z.boolean(),
  })
  .strict();

export const HostConnectPayloadSchema = z
  .object({
    hostToken: z.string().min(1),
    clientInfo: ClientInfoSchema.optional(),
  })
  .strict();

export const HostConnectedPayloadSchema = z
  .object({
    roomId: idSchema,
    hostSessionId: idSchema,
    joinCode: joinCodeSchema,
    roomState: RoomStateSchema,
    gameState: GameStateSchema.nullable().optional(),
  })
  .strict();

export const LobbyUpdatePayloadSchema = z
  .object({
    roomId: idSchema,
    roomState: RoomStateSchema,
    hostConnected: z.boolean(),
    displayConnected: z.boolean(),
    settings: RoomSettingsSchema,
    players: z.array(LobbyPlayerSchema),
    playerCount: z.number().int().nonnegative(),
  })
  .strict();

export const PlayerReconnectedPayloadSchema = z
  .object({
    roomId: idSchema,
    playerId: idSchema,
    playerState: PlayerStateSchema,
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
    totalQuestionCount: z.number().int().nonnegative(),
  })
  .strict();

const questionShowBaseFields = {
  roomId: idSchema,
  questionId: idSchema,
  questionIndex: z.number().int().nonnegative(),
  totalQuestionCount: z.number().int().nonnegative(),
  text: z.string().min(1),
  durationMs: z.number().int().positive(),
  gameState: QuestionDisplayGameStateSchema,
};

const questionControllerBaseFields = {
  roomId: idSchema,
  questionId: idSchema,
  questionIndex: z.number().int().nonnegative(),
  totalQuestionCount: z.number().int().nonnegative(),
  durationMs: z.number().int().positive(),
  gameState: QuestionDisplayGameStateSchema,
};

export const QuestionShowPayloadSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...questionShowBaseFields,
      type: z.literal(QuestionType.MultipleChoice),
      options: z.array(QuestionOptionSchema),
    })
    .strict(),
  z
    .object({
      ...questionShowBaseFields,
      type: z.literal(QuestionType.Logic),
      options: z.array(QuestionOptionSchema),
    })
    .strict(),
  z
    .object({
      ...questionShowBaseFields,
      type: z.literal(QuestionType.Estimate),
      unit: z.string().min(1),
      context: z.string().min(1),
    })
    .strict(),
  z
    .object({
      ...questionShowBaseFields,
      type: z.literal(QuestionType.MajorityGuess),
      options: z.array(QuestionOptionSchema),
    })
    .strict(),
  z
    .object({
      ...questionShowBaseFields,
      type: z.literal(QuestionType.Ranking),
      items: z.array(QuestionOptionSchema),
    })
    .strict(),
  z
    .object({
      ...questionShowBaseFields,
      type: z.literal(QuestionType.OpenText),
    })
    .strict(),
]);

export const QuestionControllerPayloadSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...questionControllerBaseFields,
      type: z.literal(QuestionType.MultipleChoice),
      options: z.array(QuestionControllerOptionSchema),
    })
    .strict(),
  z
    .object({
      ...questionControllerBaseFields,
      type: z.literal(QuestionType.Logic),
      options: z.array(QuestionControllerOptionSchema),
    })
    .strict(),
  z
    .object({
      roomId: idSchema,
      questionId: idSchema,
      questionIndex: z.number().int().nonnegative(),
      totalQuestionCount: z.number().int().nonnegative(),
      type: z.literal(QuestionType.Estimate),
      unit: z.string().min(1),
      durationMs: z.number().int().positive(),
      gameState: QuestionDisplayGameStateSchema,
    })
    .strict(),
  z
    .object({
      ...questionControllerBaseFields,
      type: z.literal(QuestionType.MajorityGuess),
      options: z.array(QuestionControllerOptionSchema),
    })
    .strict(),
  z
    .object({
      ...questionControllerBaseFields,
      type: z.literal(QuestionType.Ranking),
      items: z.array(QuestionControllerOptionSchema),
    })
    .strict(),
  z
    .object({
      ...questionControllerBaseFields,
      type: z.literal(QuestionType.OpenText),
    })
    .strict(),
]);

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
    playerResults: z.array(PlayerRoundResultSchema),
    gameState: z.literal(GameState.Revealing),
    explanation: z.string().optional(),
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

export const NextQuestionReadyPayloadSchema = z
  .object({
    roomId: idSchema,
    questionId: idSchema,
    playerId: idSchema,
  })
  .strict();

export const NextQuestionReadyProgressPayloadSchema = z
  .object({
    roomId: idSchema,
    questionId: idSchema,
    readyCount: z.number().int().nonnegative(),
    totalEligiblePlayers: z.number().int().nonnegative(),
    readyPlayerIds: z.array(idSchema),
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
    totalQuestionCount: z.number().int().nonnegative(),
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

export const DISPLAY_TO_SERVER_EVENT_SCHEMAS = {
  [EVENTS.DISPLAY_CREATE_ROOM]: DisplayCreateRoomPayloadSchema,
  [EVENTS.CONNECTION_RESUME]: ConnectionResumePayloadSchema,
} as const;

export const HOST_TO_SERVER_EVENT_SCHEMAS = {
  [EVENTS.HOST_CONNECT]: HostConnectPayloadSchema,
  [EVENTS.CONNECTION_RESUME]: ConnectionResumePayloadSchema,
  [EVENTS.ROOM_CREATE]: RoomCreatePayloadSchema,
  [EVENTS.ROOM_SETTINGS_UPDATE]: RoomSettingsUpdatePayloadSchema,
  [EVENTS.GAME_START]: GameStartPayloadSchema,
  [EVENTS.GAME_NEXT_QUESTION]: GameNextQuestionPayloadSchema,
  [EVENTS.ROOM_CLOSE]: RoomClosePayloadSchema,
} as const;

export const PLAYER_TO_SERVER_EVENT_SCHEMAS = {
  [EVENTS.CONNECTION_RESUME]: ConnectionResumePayloadSchema,
  [EVENTS.ROOM_JOIN]: RoomJoinPayloadSchema,
  [EVENTS.ANSWER_SUBMIT]: AnswerSubmitPayloadSchema,
  [EVENTS.NEXT_QUESTION_READY]: NextQuestionReadyPayloadSchema,
} as const;

export const CLIENT_TO_SERVER_EVENT_SCHEMAS = {
  ...DISPLAY_TO_SERVER_EVENT_SCHEMAS,
  ...HOST_TO_SERVER_EVENT_SCHEMAS,
  ...PLAYER_TO_SERVER_EVENT_SCHEMAS,
} as const;

export const SERVER_TO_DISPLAY_EVENT_SCHEMAS = {
  [EVENTS.DISPLAY_ROOM_CREATED]: DisplayRoomCreatedPayloadSchema,
  [EVENTS.DISPLAY_HOST_PAIRED]: DisplayHostPairedPayloadSchema,
  [EVENTS.CONNECTION_ACK]: ConnectionAckPayloadSchema,
  [EVENTS.CONNECTION_RESUMED]: ConnectionResumedPayloadSchema,
  [EVENTS.LOBBY_UPDATE]: LobbyUpdatePayloadSchema,
  [EVENTS.GAME_STARTED]: GameStartedPayloadSchema,
  [EVENTS.QUESTION_SHOW]: QuestionShowPayloadSchema,
  [EVENTS.QUESTION_TIMER]: QuestionTimerPayloadSchema,
  [EVENTS.ANSWER_PROGRESS]: AnswerProgressPayloadSchema,
  [EVENTS.QUESTION_CLOSE]: QuestionClosePayloadSchema,
  [EVENTS.QUESTION_REVEAL]: QuestionRevealPayloadSchema,
  [EVENTS.SCORE_UPDATE]: ScoreUpdatePayloadSchema,
  [EVENTS.NEXT_QUESTION_READY_PROGRESS]: NextQuestionReadyProgressPayloadSchema,
  [EVENTS.GAME_FINISHED]: GameFinishedPayloadSchema,
  [EVENTS.ROOM_CLOSED]: RoomClosedPayloadSchema,
  [EVENTS.ERROR_PROTOCOL]: ErrorPayloadSchema,
} as const;

export const SERVER_TO_HOST_EVENT_SCHEMAS = {
  [EVENTS.HOST_CONNECTED]: HostConnectedPayloadSchema,
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
  [EVENTS.NEXT_QUESTION_READY_PROGRESS]: NextQuestionReadyProgressPayloadSchema,
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
  [EVENTS.QUESTION_CONTROLLER]: QuestionControllerPayloadSchema,
  [EVENTS.QUESTION_TIMER]: QuestionTimerPayloadSchema,
  [EVENTS.ANSWER_ACCEPTED]: AnswerAcceptedPayloadSchema,
  [EVENTS.ANSWER_REJECTED]: AnswerRejectedPayloadSchema,
  [EVENTS.QUESTION_CLOSE]: QuestionClosePayloadSchema,
  [EVENTS.QUESTION_REVEAL]: QuestionRevealPayloadSchema,
  [EVENTS.SCORE_UPDATE]: ScoreUpdatePayloadSchema,
  [EVENTS.NEXT_QUESTION_READY_PROGRESS]: NextQuestionReadyProgressPayloadSchema,
  [EVENTS.GAME_FINISHED]: GameFinishedPayloadSchema,
  [EVENTS.ROOM_CLOSED]: RoomClosedPayloadSchema,
  [EVENTS.ERROR_PROTOCOL]: ErrorPayloadSchema,
} as const;

export const SERVER_TO_CLIENT_EVENT_SCHEMAS = {
  ...SERVER_TO_DISPLAY_EVENT_SCHEMAS,
  ...SERVER_TO_HOST_EVENT_SCHEMAS,
  ...SERVER_TO_PLAYER_EVENT_SCHEMAS,
} as const;

export type ConnectionAckPayload = z.infer<typeof ConnectionAckPayloadSchema>;
export type ConnectionResumePayload = z.infer<typeof ConnectionResumePayloadSchema>;
export type ConnectionResumedPayload = z.infer<typeof ConnectionResumedPayloadSchema>;
export type DisplayCreateRoomPayload = z.infer<typeof DisplayCreateRoomPayloadSchema>;
export type DisplayRoomCreatedPayload = z.infer<typeof DisplayRoomCreatedPayloadSchema>;
export type DisplayHostPairedPayload = z.infer<typeof DisplayHostPairedPayloadSchema>;
export type HostConnectPayload = z.infer<typeof HostConnectPayloadSchema>;
export type HostConnectedPayload = z.infer<typeof HostConnectedPayloadSchema>;
export type RoomCreatePayload = z.infer<typeof RoomCreatePayloadSchema>;
export type RoomCreatedPayload = z.infer<typeof RoomCreatedPayloadSchema>;
export type RoomSettingsUpdatePayload = z.infer<typeof RoomSettingsUpdatePayloadSchema>;
export type RoomJoinPayload = z.infer<typeof RoomJoinPayloadSchema>;
export type PlayerJoinedPayload = z.infer<typeof PlayerJoinedPayloadSchema>;
export type LobbyUpdatePayload = z.infer<typeof LobbyUpdatePayloadSchema>;
export type PlayerReconnectedPayload = z.infer<typeof PlayerReconnectedPayloadSchema>;
export type PlayerDisconnectedPayload = z.infer<typeof PlayerDisconnectedPayloadSchema>;
export type GameStartPayload = z.infer<typeof GameStartPayloadSchema>;
export type GameStartedPayload = z.infer<typeof GameStartedPayloadSchema>;
export type QuestionShowPayload = z.infer<typeof QuestionShowPayloadSchema>;
export type QuestionControllerPayload = z.infer<typeof QuestionControllerPayloadSchema>;
export type QuestionTimerPayload = z.infer<typeof QuestionTimerPayloadSchema>;
export type AnswerSubmitPayload = z.infer<typeof AnswerSubmitPayloadSchema>;
export type AnswerAcceptedPayload = z.infer<typeof AnswerAcceptedPayloadSchema>;
export type AnswerRejectedPayload = z.infer<typeof AnswerRejectedPayloadSchema>;
export type AnswerProgressPayload = z.infer<typeof AnswerProgressPayloadSchema>;
export type QuestionClosePayload = z.infer<typeof QuestionClosePayloadSchema>;
export type QuestionRevealPayload = z.infer<typeof QuestionRevealPayloadSchema>;
export type ScoreUpdatePayload = z.infer<typeof ScoreUpdatePayloadSchema>;
export type NextQuestionReadyPayload = z.infer<typeof NextQuestionReadyPayloadSchema>;
export type NextQuestionReadyProgressPayload = z.infer<
  typeof NextQuestionReadyProgressPayloadSchema
>;
export type GameNextQuestionPayload = z.infer<typeof GameNextQuestionPayloadSchema>;
export type GameFinishedPayload = z.infer<typeof GameFinishedPayloadSchema>;
export type RoomClosePayload = z.infer<typeof RoomClosePayloadSchema>;
export type RoomClosedPayload = z.infer<typeof RoomClosedPayloadSchema>;
export type ErrorPayload = z.infer<typeof ErrorPayloadSchema>;

export type DisplayToServerEventPayloadMap = InferSchemaMap<typeof DISPLAY_TO_SERVER_EVENT_SCHEMAS>;
export type HostToServerEventPayloadMap = InferSchemaMap<typeof HOST_TO_SERVER_EVENT_SCHEMAS>;
export type PlayerToServerEventPayloadMap = InferSchemaMap<typeof PLAYER_TO_SERVER_EVENT_SCHEMAS>;
export type ClientToServerEventPayloadMap = InferSchemaMap<typeof CLIENT_TO_SERVER_EVENT_SCHEMAS>;
export type ServerToDisplayEventPayloadMap = InferSchemaMap<typeof SERVER_TO_DISPLAY_EVENT_SCHEMAS>;
export type ServerToHostEventPayloadMap = InferSchemaMap<typeof SERVER_TO_HOST_EVENT_SCHEMAS>;
export type ServerToPlayerEventPayloadMap = InferSchemaMap<typeof SERVER_TO_PLAYER_EVENT_SCHEMAS>;
export type ServerToClientEventPayloadMap = InferSchemaMap<typeof SERVER_TO_CLIENT_EVENT_SCHEMAS>;

import { z } from "zod";

import {
  CLIENT_ROLES,
  GAME_PLAN_PRESET_IDS,
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
export const GamePlanPresetIdSchema = z.enum(GAME_PLAN_PRESET_IDS);
export const DisplayShowLevelSchema = z.enum(["minimal", "normal", "high"] as const);
export const RevealModeSchema = z.enum(["auto", "manual_with_fallback"] as const);
export const RankingScoringModeSchema = z.enum(["exact", "partial_with_bonus"] as const);
export const ClientRoleSchema = z.enum(CLIENT_ROLES);
export const QuestionDisplayGameStateSchema = z.enum([
  GameState.QuestionActive,
  GameState.AnswerLocked,
  GameState.Revealing,
  GameState.Scoreboard,
] as const);

export const GamePlanSchema = z
  .object({
    mode: z.enum(["preset", "custom"] as const),
    presetId: GamePlanPresetIdSchema.optional(),
    questionCount: z.number().int().positive(),
    categoryIds: z.array(idSchema).min(1),
    questionTypes: z.array(QuestionTypeSchema).min(1),
    timerMs: z.number().int().positive(),
    revealDurationMs: z.number().int().positive(),
    revealMode: RevealModeSchema,
    showAnswerTextOnPlayerDevices: z.boolean(),
    enableDemoQuestion: z.boolean(),
    displayShowLevel: DisplayShowLevelSchema,
    rankingScoringMode: RankingScoringModeSchema,
  })
  .strict();

export const ResolvedGamePlanSchema = GamePlanSchema.extend({
  label: z.string().min(1),
}).strict();

export const RoomSettingsSchema = z
  .object({
    showAnswerTextOnPlayerDevices: z.boolean(),
    gamePlanDraft: GamePlanSchema.optional(),
  })
  .strict();

export const CatalogQuestionTypeSummarySchema = z
  .object({
    type: QuestionTypeSchema,
    count: z.number().int().nonnegative(),
  })
  .strict();

export const CatalogCategorySummarySchema = z
  .object({
    id: idSchema,
    slug: z.string().min(1),
    name: z.string().min(1),
    difficulty: z.string().min(1).optional(),
    tags: z.array(z.string().min(1)),
    questionCount: z.number().int().nonnegative(),
    questionTypes: z.array(CatalogQuestionTypeSummarySchema),
  })
  .strict();

export const CatalogSummaryPayloadSchema = z
  .object({
    totalQuestions: z.number().int().nonnegative(),
    maxQuestionCount: z.number().int().nonnegative(),
    categories: z.array(CatalogCategorySummarySchema),
    questionTypes: z.array(CatalogQuestionTypeSummarySchema),
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
    detail: z
      .object({
        exactPositions: z.number().int().nonnegative().optional(),
        totalPositions: z.number().int().nonnegative().optional(),
        bonusPoints: z.number().int().nonnegative().optional(),
        submittedText: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const ScoreChangeSchema = z
  .object({
    playerId: idSchema,
    name: z.string().min(1),
    previousScore: z.number().int().nonnegative(),
    score: z.number().int().nonnegative(),
    delta: z.number().int().nonnegative(),
    previousRank: z.number().int().positive(),
    rank: z.number().int().positive(),
  })
  .strict();

export const GameFinalStatsSchema = z
  .object({
    mostCorrect: z
      .object({
        playerId: idSchema,
        name: z.string().min(1),
        count: z.number().int().nonnegative(),
      })
      .strict()
      .optional(),
    fastestAnswer: z
      .object({
        playerId: idSchema,
        name: z.string().min(1),
        submittedAtMs: z.number().int().nonnegative(),
      })
      .strict()
      .optional(),
    closestGap: z
      .object({
        points: z.number().int().nonnegative(),
      })
      .strict()
      .optional(),
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

export const RoomSettingsUpdatePayloadSchema = z
  .object({
    roomId: idSchema,
    showAnswerTextOnPlayerDevices: z.boolean(),
    gamePlanDraft: GamePlanSchema.optional(),
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
    gamePlan: GamePlanSchema,
  })
  .strict();

export const GameStartedPayloadSchema = z
  .object({
    roomId: idSchema,
    roomState: z.literal(RoomState.InGame),
    gameState: z.literal(GameState.Idle),
    questionIndex: z.number().int().nonnegative(),
    totalQuestionCount: z.number().int().nonnegative(),
    resolvedGamePlan: ResolvedGamePlanSchema,
  })
  .strict();

export const QuestionCountdownPayloadSchema = z
  .object({
    roomId: idSchema,
    questionIndex: z.number().int().nonnegative(),
    totalQuestionCount: z.number().int().nonnegative(),
    countdownMs: z.number().int().positive(),
    displayShowLevel: DisplayShowLevelSchema,
    isDemoQuestion: z.boolean().optional(),
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
  isDemoQuestion: z.boolean().optional(),
};

const questionControllerBaseFields = {
  roomId: idSchema,
  questionId: idSchema,
  questionIndex: z.number().int().nonnegative(),
  totalQuestionCount: z.number().int().nonnegative(),
  durationMs: z.number().int().positive(),
  gameState: QuestionDisplayGameStateSchema,
  isDemoQuestion: z.boolean().optional(),
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
      isDemoQuestion: z.boolean().optional(),
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

export const QuestionForceClosePayloadSchema = z
  .object({
    roomId: idSchema,
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
    scoreChanges: z.array(ScoreChangeSchema),
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

export const GameShowScoreboardPayloadSchema = z
  .object({
    roomId: idSchema,
  })
  .strict();

export const GameFinishNowPayloadSchema = z
  .object({
    roomId: idSchema,
  })
  .strict();

export const PlayerRemovePayloadSchema = z
  .object({
    roomId: idSchema,
    playerId: idSchema,
  })
  .strict();

export const GameFinishedPayloadSchema = z
  .object({
    roomId: idSchema,
    roomState: z.literal(RoomState.Completed),
    gameState: z.literal(GameState.Completed),
    totalQuestionCount: z.number().int().nonnegative(),
    finalScoreboard: z.array(ScoreboardEntrySchema),
    finalStats: GameFinalStatsSchema.optional(),
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
  [EVENTS.ROOM_SETTINGS_UPDATE]: RoomSettingsUpdatePayloadSchema,
  [EVENTS.GAME_START]: GameStartPayloadSchema,
  [EVENTS.GAME_NEXT_QUESTION]: GameNextQuestionPayloadSchema,
  [EVENTS.QUESTION_FORCE_CLOSE]: QuestionForceClosePayloadSchema,
  [EVENTS.GAME_SHOW_SCOREBOARD]: GameShowScoreboardPayloadSchema,
  [EVENTS.GAME_FINISH_NOW]: GameFinishNowPayloadSchema,
  [EVENTS.PLAYER_REMOVE]: PlayerRemovePayloadSchema,
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
  [EVENTS.QUESTION_COUNTDOWN]: QuestionCountdownPayloadSchema,
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
  [EVENTS.CATALOG_SUMMARY]: CatalogSummaryPayloadSchema,
  [EVENTS.CONNECTION_ACK]: ConnectionAckPayloadSchema,
  [EVENTS.CONNECTION_RESUMED]: ConnectionResumedPayloadSchema,
  [EVENTS.LOBBY_UPDATE]: LobbyUpdatePayloadSchema,
  [EVENTS.PLAYER_RECONNECTED]: PlayerReconnectedPayloadSchema,
  [EVENTS.PLAYER_DISCONNECTED]: PlayerDisconnectedPayloadSchema,
  [EVENTS.GAME_STARTED]: GameStartedPayloadSchema,
  [EVENTS.QUESTION_COUNTDOWN]: QuestionCountdownPayloadSchema,
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
  [EVENTS.QUESTION_COUNTDOWN]: QuestionCountdownPayloadSchema,
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
export type CatalogSummaryPayload = z.infer<typeof CatalogSummaryPayloadSchema>;
export type RoomSettingsUpdatePayload = z.infer<typeof RoomSettingsUpdatePayloadSchema>;
export type RoomJoinPayload = z.infer<typeof RoomJoinPayloadSchema>;
export type PlayerJoinedPayload = z.infer<typeof PlayerJoinedPayloadSchema>;
export type LobbyUpdatePayload = z.infer<typeof LobbyUpdatePayloadSchema>;
export type PlayerReconnectedPayload = z.infer<typeof PlayerReconnectedPayloadSchema>;
export type PlayerDisconnectedPayload = z.infer<typeof PlayerDisconnectedPayloadSchema>;
export type GameStartPayload = z.infer<typeof GameStartPayloadSchema>;
export type GameStartedPayload = z.infer<typeof GameStartedPayloadSchema>;
export type QuestionCountdownPayload = z.infer<typeof QuestionCountdownPayloadSchema>;
export type QuestionShowPayload = z.infer<typeof QuestionShowPayloadSchema>;
export type QuestionControllerPayload = z.infer<typeof QuestionControllerPayloadSchema>;
export type QuestionTimerPayload = z.infer<typeof QuestionTimerPayloadSchema>;
export type AnswerSubmitPayload = z.infer<typeof AnswerSubmitPayloadSchema>;
export type AnswerAcceptedPayload = z.infer<typeof AnswerAcceptedPayloadSchema>;
export type AnswerRejectedPayload = z.infer<typeof AnswerRejectedPayloadSchema>;
export type AnswerProgressPayload = z.infer<typeof AnswerProgressPayloadSchema>;
export type QuestionClosePayload = z.infer<typeof QuestionClosePayloadSchema>;
export type QuestionForceClosePayload = z.infer<typeof QuestionForceClosePayloadSchema>;
export type QuestionRevealPayload = z.infer<typeof QuestionRevealPayloadSchema>;
export type ScoreUpdatePayload = z.infer<typeof ScoreUpdatePayloadSchema>;
export type NextQuestionReadyPayload = z.infer<typeof NextQuestionReadyPayloadSchema>;
export type NextQuestionReadyProgressPayload = z.infer<
  typeof NextQuestionReadyProgressPayloadSchema
>;
export type GameNextQuestionPayload = z.infer<typeof GameNextQuestionPayloadSchema>;
export type GameShowScoreboardPayload = z.infer<typeof GameShowScoreboardPayloadSchema>;
export type GameFinishNowPayload = z.infer<typeof GameFinishNowPayloadSchema>;
export type PlayerRemovePayload = z.infer<typeof PlayerRemovePayloadSchema>;
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

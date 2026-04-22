import { z } from "zod";

import type {
  ClientToServerEventName,
  ServerToClientEventName,
} from "./events.js";
import {
  CLIENT_TO_SERVER_EVENT_SCHEMAS,
  SERVER_TO_CLIENT_EVENT_SCHEMAS,
} from "./schemas.js";

type EnvelopeSchemaMap = Record<string, z.ZodTypeAny>;

type EnvelopeFromSchemaMap<TSchemas extends EnvelopeSchemaMap> = {
  [TEvent in keyof TSchemas]: {
    event: TEvent;
    payload: z.infer<TSchemas[TEvent]>;
  };
}[keyof TSchemas];

export interface SocketEnvelope<TEvent extends string, TPayload> {
  event: TEvent;
  payload: TPayload;
}

export type ClientToServerEnvelope = SocketEnvelope<
  ClientToServerEventName,
  import("./schemas.js").ClientToServerEventPayloadMap[ClientToServerEventName]
>;

export type ServerToClientEnvelope = SocketEnvelope<
  ServerToClientEventName,
  import("./schemas.js").ServerToClientEventPayloadMap[ServerToClientEventName]
>;

const SocketEnvelopeBaseSchema = z
  .object({
    event: z.string().min(1),
    payload: z.unknown(),
  })
  .strict();

function parseEnvelope<TSchemas extends EnvelopeSchemaMap>(
  rawMessage: string,
  schemas: TSchemas,
):
  | { success: true; data: EnvelopeFromSchemaMap<TSchemas> }
  | { success: false; error: string; event?: string } {
  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(rawMessage);
  } catch {
    return {
      success: false,
      error: "Message is not valid JSON",
    };
  }

  const baseParse = SocketEnvelopeBaseSchema.safeParse(parsedJson);

  if (!baseParse.success) {
    return {
      success: false,
      error: "Message does not match the socket envelope shape",
    };
  }

  const payloadSchema = schemas[baseParse.data.event];

  if (!payloadSchema) {
    return {
      success: false,
      error: "Unknown event",
      event: baseParse.data.event,
    };
  }

  const payloadParse = payloadSchema.safeParse(baseParse.data.payload);

  if (!payloadParse.success) {
    return {
      success: false,
      error: "Payload validation failed",
      event: baseParse.data.event,
    };
  }

  return {
    success: true,
    data: {
      event: baseParse.data.event,
      payload: payloadParse.data,
    } as EnvelopeFromSchemaMap<TSchemas>,
  };
}

export function parseClientToServerEnvelope(rawMessage: string) {
  return parseEnvelope(rawMessage, CLIENT_TO_SERVER_EVENT_SCHEMAS);
}

export function parseServerToClientEnvelope(rawMessage: string) {
  return parseEnvelope(rawMessage, SERVER_TO_CLIENT_EVENT_SCHEMAS);
}

export function serializeEnvelope<TEvent extends string, TPayload>(
  event: TEvent,
  payload: TPayload,
): string {
  return JSON.stringify({
    event,
    payload,
  } satisfies SocketEnvelope<TEvent, TPayload>);
}

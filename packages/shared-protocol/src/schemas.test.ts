import { describe, expect, it } from "vitest";

import {
  parseClientToServerEnvelope,
  parseServerToClientEnvelope,
  serializeEnvelope,
  EVENTS,
} from "./index.js";

describe("parseClientToServerEnvelope", () => {
  it("accepts a valid answer:submit payload", () => {
    const envelope = serializeEnvelope(EVENTS.ANSWER_SUBMIT, {
      roomId: "room-1",
      questionId: "q1",
      playerId: "p1",
      answer: { type: "option", value: "A" },
      requestId: "req-1",
    });

    const result = parseClientToServerEnvelope(envelope);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.event).toBe(EVENTS.ANSWER_SUBMIT);
      expect(result.data.payload).toEqual({
        roomId: "room-1",
        questionId: "q1",
        playerId: "p1",
        answer: { type: "option", value: "A" },
        requestId: "req-1",
      });
    }
  });

  it("accepts a valid room:join payload", () => {
    const envelope = serializeEnvelope(EVENTS.ROOM_JOIN, {
      joinCode: "ABC234",
      playerName: "Alice",
      sessionId: null,
    });

    const result = parseClientToServerEnvelope(envelope);

    expect(result.success).toBe(true);
  });

  it("rejects a payload with missing required fields", () => {
    const raw = JSON.stringify({ event: EVENTS.ANSWER_SUBMIT, payload: { roomId: "room-1" } });

    const result = parseClientToServerEnvelope(raw);

    expect(result.success).toBe(false);
  });

  it("rejects completely invalid JSON", () => {
    const result = parseClientToServerEnvelope("not json");

    expect(result.success).toBe(false);
  });
});

describe("parseServerToClientEnvelope", () => {
  it("accepts a valid question:show payload", () => {
    const envelope = JSON.stringify({
      event: EVENTS.QUESTION_SHOW,
      payload: {
        roomId: "room-1",
        questionId: "q1",
        questionIndex: 0,
        totalQuestionCount: 7,
        type: "multiple_choice",
        text: "Testfrage?",
        options: [
          { id: "A", label: "Antwort A" },
          { id: "B", label: "Antwort B" },
        ],
        durationMs: 15000,
        gameState: "question_active",
      },
    });

    const result = parseServerToClientEnvelope(envelope);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.event).toBe(EVENTS.QUESTION_SHOW);
      if (result.data.event === EVENTS.QUESTION_SHOW) {
        expect(result.data.payload.text).toBe("Testfrage?");
      }
    }
  });

  it("accepts a resumed question:show payload in scoreboard state", () => {
    const envelope = JSON.stringify({
      event: EVENTS.QUESTION_SHOW,
      payload: {
        roomId: "room-1",
        questionId: "q1",
        questionIndex: 0,
        totalQuestionCount: 7,
        type: "multiple_choice",
        text: "Testfrage?",
        options: [
          { id: "A", label: "Antwort A" },
          { id: "B", label: "Antwort B" },
        ],
        durationMs: 15000,
        gameState: "scoreboard",
      },
    });

    const result = parseServerToClientEnvelope(envelope);

    expect(result.success).toBe(true);
    if (result.success && result.data.event === EVENTS.QUESTION_SHOW) {
      expect(result.data.payload.gameState).toBe("scoreboard");
    }
  });

  it("accepts a valid score:update payload", () => {
    const envelope = JSON.stringify({
      event: EVENTS.SCORE_UPDATE,
      payload: {
        roomId: "room-1",
        questionId: "q1",
        scoreboard: [{ playerId: "p1", name: "Alice", score: 10 }],
        gameState: "scoreboard",
      },
    });

    const result = parseServerToClientEnvelope(envelope);

    expect(result.success).toBe(true);
  });

  it("accepts an in-game connection:resumed payload with current answer", () => {
    const envelope = JSON.stringify({
      event: EVENTS.CONNECTION_RESUMED,
      payload: {
        role: "player",
        roomId: "room-1",
        roomState: "in_game",
        gameState: "question_active",
        sessionId: "session-1",
        joinCode: "ABC234",
        playerId: "p1",
        playerState: "answered",
        currentAnswer: {
          type: "option",
          value: "B",
        },
      },
    });

    const result = parseServerToClientEnvelope(envelope);

    expect(result.success).toBe(true);
    if (result.success && result.data.event === EVENTS.CONNECTION_RESUMED) {
      expect(result.data.payload.roomState).toBe("in_game");
      expect(result.data.payload.currentAnswer).toEqual({
        type: "option",
        value: "B",
      });
    }
  });

  it("rejects unknown events", () => {
    const raw = JSON.stringify({ event: "unknown:event", payload: {} });

    const result = parseServerToClientEnvelope(raw);

    expect(result.success).toBe(false);
  });
});

describe("serializeEnvelope roundtrip", () => {
  it("roundtrips a room:create payload through serialize and parse", () => {
    const payload = {
      hostName: "Host",
      clientInfo: { deviceType: "browser", appVersion: "0.0.1" },
    };
    const serialized = serializeEnvelope(EVENTS.ROOM_CREATE, payload);
    const result = parseClientToServerEnvelope(serialized);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.event).toBe(EVENTS.ROOM_CREATE);
      expect(result.data.payload).toEqual(payload);
    }
  });
});

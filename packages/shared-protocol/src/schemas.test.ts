import { describe, expect, it } from "vitest";

import {
  parseClientToServerEnvelope,
  parseServerToClientEnvelope,
  serializeEnvelope,
  EVENTS,
} from "./index.js";

const sampleGamePlan = {
  mode: "preset" as const,
  presetId: "normal_evening" as const,
  questionCount: 20,
  categoryIds: ["cat-01", "cat-02"],
  questionTypes: ["multiple_choice", "majority_guess", "estimate", "logic", "ranking"],
  timerMs: 30000,
  revealDurationMs: 5000,
  revealMode: "auto" as const,
  showAnswerTextOnPlayerDevices: false,
  enableDemoQuestion: true,
  displayShowLevel: "high" as const,
  rankingScoringMode: "partial_with_bonus" as const,
};

describe("parseClientToServerEnvelope", () => {
  it("accepts a valid answer:submit payload (option)", () => {
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

  it("accepts a valid answer:submit payload (number/estimate)", () => {
    const envelope = serializeEnvelope(EVENTS.ANSWER_SUBMIT, {
      roomId: "room-1",
      questionId: "q-est-01",
      playerId: "p1",
      answer: { type: "number", value: 13.5 },
      requestId: "req-2",
    });

    const result = parseClientToServerEnvelope(envelope);

    expect(result.success).toBe(true);
    if (result.success && result.data.event === EVENTS.ANSWER_SUBMIT) {
      expect(result.data.payload.answer.type).toBe("number");
    }
  });

  it("accepts a valid answer:submit payload (ranking)", () => {
    const envelope = serializeEnvelope(EVENTS.ANSWER_SUBMIT, {
      roomId: "room-1",
      questionId: "q-rank-01",
      playerId: "p1",
      answer: { type: "ranking", value: ["B", "A", "C", "D"] },
      requestId: "req-3",
    });

    const result = parseClientToServerEnvelope(envelope);

    expect(result.success).toBe(true);
    if (result.success && result.data.event === EVENTS.ANSWER_SUBMIT) {
      expect(result.data.payload.answer.type).toBe("ranking");
    }
  });

  it("accepts a valid answer:submit payload (text)", () => {
    const envelope = serializeEnvelope(EVENTS.ANSWER_SUBMIT, {
      roomId: "room-1",
      questionId: "q-text-01",
      playerId: "p1",
      answer: { type: "text", value: "Karl Klammer" },
      requestId: "req-4",
    });

    const result = parseClientToServerEnvelope(envelope);

    expect(result.success).toBe(true);
    if (result.success && result.data.event === EVENTS.ANSWER_SUBMIT) {
      expect(result.data.payload.answer.type).toBe("text");
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

  it("accepts a valid next-question:ready payload", () => {
    const envelope = serializeEnvelope(EVENTS.NEXT_QUESTION_READY, {
      roomId: "room-1",
      questionId: "q1",
      playerId: "p1",
    });

    const result = parseClientToServerEnvelope(envelope);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.event).toBe(EVENTS.NEXT_QUESTION_READY);
    }
  });

  it("accepts a valid room:settings:update payload", () => {
    const envelope = serializeEnvelope(EVENTS.ROOM_SETTINGS_UPDATE, {
      roomId: "room-1",
      showAnswerTextOnPlayerDevices: true,
    });

    const result = parseClientToServerEnvelope(envelope);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.event).toBe(EVENTS.ROOM_SETTINGS_UPDATE);
    }
  });

  it("accepts a valid game:start payload with game plan", () => {
    const envelope = serializeEnvelope(EVENTS.GAME_START, {
      roomId: "room-1",
      gamePlan: sampleGamePlan,
    });

    const result = parseClientToServerEnvelope(envelope);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.event).toBe(EVENTS.GAME_START);
    }
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

  it("accepts a reduced question:controller payload without question text", () => {
    const envelope = JSON.stringify({
      event: EVENTS.QUESTION_CONTROLLER,
      payload: {
        roomId: "room-1",
        questionId: "q1",
        questionIndex: 0,
        totalQuestionCount: 7,
        type: "multiple_choice",
        options: [
          { id: "A", label: "A" },
          { id: "B", label: "B" },
        ],
        durationMs: 15000,
        gameState: "question_active",
      },
    });

    const result = parseServerToClientEnvelope(envelope);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.event).toBe(EVENTS.QUESTION_CONTROLLER);
    }
  });

  it("accepts a majority question:controller payload with options", () => {
    const envelope = JSON.stringify({
      event: EVENTS.QUESTION_CONTROLLER,
      payload: {
        roomId: "room-1",
        questionId: "q-majority-01",
        questionIndex: 2,
        totalQuestionCount: 10,
        type: "majority_guess",
        options: [
          { id: "A", label: "A" },
          { id: "B", label: "B" },
        ],
        durationMs: 15000,
        gameState: "question_active",
      },
    });

    const result = parseServerToClientEnvelope(envelope);

    expect(result.success).toBe(true);
  });

  it("accepts an open text question:controller payload", () => {
    const envelope = JSON.stringify({
      event: EVENTS.QUESTION_CONTROLLER,
      payload: {
        roomId: "room-1",
        questionId: "q-text-01",
        questionIndex: 2,
        totalQuestionCount: 10,
        type: "open_text",
        durationMs: 15000,
        gameState: "question_active",
      },
    });

    const result = parseServerToClientEnvelope(envelope);

    expect(result.success).toBe(true);
  });

  it("rejects question:controller payloads that include full question text", () => {
    const envelope = JSON.stringify({
      event: EVENTS.QUESTION_CONTROLLER,
      payload: {
        roomId: "room-1",
        questionId: "q1",
        questionIndex: 0,
        totalQuestionCount: 7,
        type: "multiple_choice",
        text: "This should stay on the host.",
        options: [{ id: "A", label: "A" }],
        durationMs: 15000,
        gameState: "question_active",
      },
    });

    const result = parseServerToClientEnvelope(envelope);

    expect(result.success).toBe(false);
  });

  it("accepts a valid score:update payload", () => {
    const envelope = JSON.stringify({
      event: EVENTS.SCORE_UPDATE,
      payload: {
        roomId: "room-1",
        questionId: "q1",
        scoreboard: [{ playerId: "p1", name: "Alice", score: 10 }],
        scoreChanges: [
          {
            playerId: "p1",
            name: "Alice",
            previousScore: 7,
            score: 10,
            delta: 3,
            previousRank: 2,
            rank: 1,
          },
        ],
        gameState: "scoreboard",
      },
    });

    const result = parseServerToClientEnvelope(envelope);

    expect(result.success).toBe(true);
  });

  it("accepts a valid next-question:ready-progress payload", () => {
    const envelope = JSON.stringify({
      event: EVENTS.NEXT_QUESTION_READY_PROGRESS,
      payload: {
        roomId: "room-1",
        questionId: "q1",
        readyCount: 1,
        totalEligiblePlayers: 2,
        readyPlayerIds: ["p1"],
        gameState: "scoreboard",
      },
    });

    const result = parseServerToClientEnvelope(envelope);

    expect(result.success).toBe(true);
    if (result.success && result.data.event === EVENTS.NEXT_QUESTION_READY_PROGRESS) {
      expect(result.data.payload.readyCount).toBe(1);
      expect(result.data.payload.totalEligiblePlayers).toBe(2);
    }
  });

  it("accepts a question:reveal payload with player round results", () => {
    const envelope = JSON.stringify({
      event: EVENTS.QUESTION_REVEAL,
      payload: {
        roomId: "room-1",
        questionId: "q1",
        correctAnswer: { type: "option", value: "B" },
        playerResults: [
          {
            playerId: "p1",
            answer: { type: "option", value: "B" },
            isCorrect: true,
            pointsEarned: 10,
          },
          {
            playerId: "p2",
            answer: null,
            isCorrect: false,
            pointsEarned: 0,
          },
        ],
        gameState: "revealing",
      },
    });

    const result = parseServerToClientEnvelope(envelope);

    expect(result.success).toBe(true);
    if (result.success && result.data.event === EVENTS.QUESTION_REVEAL) {
      expect(result.data.payload.playerResults).toHaveLength(2);
      expect(result.data.payload.playerResults[0].isCorrect).toBe(true);
      expect(result.data.payload.explanation).toBeUndefined();
    }
  });

  it("passes explanation through in question:reveal payload", () => {
    const envelope = JSON.stringify({
      event: EVENTS.QUESTION_REVEAL,
      payload: {
        roomId: "room-1",
        questionId: "q1",
        correctAnswer: { type: "option", value: "A" },
        playerResults: [],
        gameState: "revealing",
        explanation: "Die erste Pille nimmst du sofort – macht genau 1 Stunde.",
      },
    });

    const result = parseServerToClientEnvelope(envelope);

    expect(result.success).toBe(true);
    if (result.success && result.data.event === EVENTS.QUESTION_REVEAL) {
      expect(result.data.payload.explanation).toBe(
        "Die erste Pille nimmst du sofort – macht genau 1 Stunde.",
      );
    }
  });

  it("accepts question:reveal payloads with multiple correct options", () => {
    const envelope = JSON.stringify({
      event: EVENTS.QUESTION_REVEAL,
      payload: {
        roomId: "room-1",
        questionId: "q-majority-01",
        correctAnswer: { type: "options", value: ["A", "B"] },
        playerResults: [],
        gameState: "revealing",
      },
    });

    const result = parseServerToClientEnvelope(envelope);

    expect(result.success).toBe(true);
  });

  it("accepts question:reveal payloads with text answers", () => {
    const envelope = JSON.stringify({
      event: EVENTS.QUESTION_REVEAL,
      payload: {
        roomId: "room-1",
        questionId: "q-text-01",
        correctAnswer: { type: "text", value: "Karl Klammer" },
        playerResults: [
          {
            playerId: "p1",
            answer: { type: "text", value: "Clippy" },
            isCorrect: true,
            pointsEarned: 1,
          },
        ],
        gameState: "revealing",
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

  it("accepts a valid estimate question:show payload", () => {
    const envelope = JSON.stringify({
      event: EVENTS.QUESTION_SHOW,
      payload: {
        roomId: "room-1",
        questionId: "q-est-01",
        questionIndex: 3,
        totalQuestionCount: 10,
        type: "estimate",
        text: "Wie lang ist der durchschnittliche erigierte Penis? (cm)",
        unit: "cm",
        context: "weltweit, BJU International 2015",
        durationMs: 20000,
        gameState: "question_active",
      },
    });

    const result = parseServerToClientEnvelope(envelope);

    expect(result.success).toBe(true);
    if (result.success && result.data.event === EVENTS.QUESTION_SHOW) {
      expect(result.data.payload.type).toBe("estimate");
    }
  });

  it("accepts a valid ranking question:show payload", () => {
    const envelope = JSON.stringify({
      event: EVENTS.QUESTION_SHOW,
      payload: {
        roomId: "room-1",
        questionId: "q-rank-01",
        questionIndex: 5,
        totalQuestionCount: 10,
        type: "ranking",
        text: "Sortiere diese Messenger vom ältesten zum neuesten.",
        items: [
          { id: "A", label: "WhatsApp" },
          { id: "B", label: "ICQ" },
        ],
        durationMs: 30000,
        gameState: "question_active",
      },
    });

    const result = parseServerToClientEnvelope(envelope);

    expect(result.success).toBe(true);
    if (result.success && result.data.event === EVENTS.QUESTION_SHOW) {
      expect(result.data.payload.type).toBe("ranking");
    }
  });

  it("accepts a valid open text question:show payload", () => {
    const envelope = JSON.stringify({
      event: EVENTS.QUESTION_SHOW,
      payload: {
        roomId: "room-1",
        questionId: "q-text-01",
        questionIndex: 5,
        totalQuestionCount: 10,
        type: "open_text",
        text: "Was war Karl Klammer?",
        durationMs: 30000,
        gameState: "question_active",
      },
    });

    const result = parseServerToClientEnvelope(envelope);

    expect(result.success).toBe(true);
  });

  it("rejects unknown events", () => {
    const raw = JSON.stringify({ event: "unknown:event", payload: {} });

    const result = parseServerToClientEnvelope(raw);

    expect(result.success).toBe(false);
  });
});

describe("serializeEnvelope roundtrip", () => {
  it("roundtrips a display:create-room payload through serialize and parse", () => {
    const payload = {
      clientInfo: { deviceType: "browser", appVersion: "0.0.1" },
    };
    const serialized = serializeEnvelope(EVENTS.DISPLAY_CREATE_ROOM, payload);
    const result = parseClientToServerEnvelope(serialized);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.event).toBe(EVENTS.DISPLAY_CREATE_ROOM);
      expect(result.data.payload).toEqual(payload);
    }
  });
});

describe("display and host events – schema validation", () => {
  it("accepts display:create-room with empty payload", () => {
    const envelope = serializeEnvelope(EVENTS.DISPLAY_CREATE_ROOM, {});
    const result = parseClientToServerEnvelope(envelope);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.event).toBe(EVENTS.DISPLAY_CREATE_ROOM);
    }
  });

  it("accepts display:create-room with optional clientInfo", () => {
    const envelope = serializeEnvelope(EVENTS.DISPLAY_CREATE_ROOM, {
      clientInfo: { deviceType: "tv", appVersion: "0.0.1" },
    });
    const result = parseClientToServerEnvelope(envelope);
    expect(result.success).toBe(true);
  });

  it("accepts host:connect with valid hostToken", () => {
    const envelope = serializeEnvelope(EVENTS.HOST_CONNECT, {
      hostToken: "abc123def456",
    });
    const result = parseClientToServerEnvelope(envelope);
    expect(result.success).toBe(true);
    if (result.success && result.data.event === EVENTS.HOST_CONNECT) {
      expect(result.data.payload.hostToken).toBe("abc123def456");
    }
  });

  it("rejects host:connect with empty hostToken", () => {
    const raw = JSON.stringify({ event: EVENTS.HOST_CONNECT, payload: { hostToken: "" } });
    const result = parseClientToServerEnvelope(raw);
    expect(result.success).toBe(false);
  });

  it("accepts display:room-created payload", () => {
    const envelope = JSON.stringify({
      event: EVENTS.DISPLAY_ROOM_CREATED,
      payload: {
        roomId: "room-1",
        displaySessionId: "sess-display-1",
        displayToken: "tok-display-1",
        joinCode: "ABC234",
        hostToken: "long-host-token-abc",
      },
    });
    const result = parseServerToClientEnvelope(envelope);
    expect(result.success).toBe(true);
    if (result.success && result.data.event === EVENTS.DISPLAY_ROOM_CREATED) {
      expect(result.data.payload.joinCode).toBe("ABC234");
    }
  });

  it("accepts host:connected payload", () => {
    const envelope = JSON.stringify({
      event: EVENTS.HOST_CONNECTED,
      payload: {
        roomId: "room-1",
        hostSessionId: "sess-host-1",
        joinCode: "ABC234",
        roomState: "waiting",
        gameState: null,
      },
    });
    const result = parseServerToClientEnvelope(envelope);
    expect(result.success).toBe(true);
    if (result.success && result.data.event === EVENTS.HOST_CONNECTED) {
      expect(result.data.payload.hostSessionId).toBe("sess-host-1");
    }
  });

  it("accepts display:host-paired payload", () => {
    const envelope = JSON.stringify({
      event: EVENTS.DISPLAY_HOST_PAIRED,
      payload: { hostConnected: true },
    });
    const result = parseServerToClientEnvelope(envelope);
    expect(result.success).toBe(true);
  });

  it("accepts catalog:summary payload", () => {
    const envelope = JSON.stringify({
      event: EVENTS.CATALOG_SUMMARY,
      payload: {
        totalQuestions: 2,
        maxQuestionCount: 2,
        categories: [
          {
            id: "cat-01",
            slug: "cat-one",
            name: "Kategorie 1",
            tags: ["test"],
            questionCount: 2,
            questionTypes: [{ type: "multiple_choice", count: 2 }],
          },
        ],
        questionTypes: [{ type: "multiple_choice", count: 2 }],
      },
    });

    const result = parseServerToClientEnvelope(envelope);
    expect(result.success).toBe(true);
  });

  it("accepts connection:resumed with role display", () => {
    const envelope = JSON.stringify({
      event: EVENTS.CONNECTION_RESUMED,
      payload: {
        role: "display",
        roomId: "room-1",
        roomState: "waiting",
        sessionId: "sess-display-1",
        joinCode: "ABC234",
        gameState: null,
      },
    });
    const result = parseServerToClientEnvelope(envelope);
    expect(result.success).toBe(true);
    if (result.success && result.data.event === EVENTS.CONNECTION_RESUMED) {
      expect(result.data.payload.role).toBe("display");
    }
  });

  it("accepts lobby:update with displayConnected field", () => {
    const envelope = JSON.stringify({
      event: EVENTS.LOBBY_UPDATE,
      payload: {
        roomId: "room-1",
        roomState: "waiting",
        hostConnected: false,
        displayConnected: true,
        settings: { showAnswerTextOnPlayerDevices: false },
        players: [],
        playerCount: 0,
      },
    });
    const result = parseServerToClientEnvelope(envelope);
    expect(result.success).toBe(true);
    if (result.success && result.data.event === EVENTS.LOBBY_UPDATE) {
      expect(result.data.payload.displayConnected).toBe(true);
    }
  });

  it("rejects lobby:update missing displayConnected", () => {
    const raw = JSON.stringify({
      event: EVENTS.LOBBY_UPDATE,
      payload: {
        roomId: "room-1",
        roomState: "waiting",
        hostConnected: false,
        settings: { showAnswerTextOnPlayerDevices: false },
        players: [],
        playerCount: 0,
      },
    });
    const result = parseServerToClientEnvelope(raw);
    expect(result.success).toBe(false);
  });
});

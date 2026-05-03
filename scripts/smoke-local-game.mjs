#!/usr/bin/env node
import process from "node:process";
import { randomUUID } from "node:crypto";

const WS_URL = process.env.SMOKE_WS_URL ?? process.env.VITE_SERVER_SOCKET_URL ?? "ws://localhost:3001";
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? "15000");

const WebSocketCtor =
  globalThis.WebSocket ?? (await import("ws").then((module) => module.WebSocket));

function withTimeout(promise, label) {
  let timeout;
  return Promise.race([
    promise.finally(() => clearTimeout(timeout)),
    new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error(`${label} timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS);
    }),
  ]);
}

class SmokeClient {
  constructor(label) {
    this.label = label;
    this.messages = [];
    this.waiters = [];
    this.socket = null;
  }

  async connect() {
    await withTimeout(
      new Promise((resolve, reject) => {
        const socket = new WebSocketCtor(WS_URL);
        this.socket = socket;

        socket.addEventListener("message", (event) => {
          const message = JSON.parse(event.data);
          this.messages.push(message);
          this.flushWaiters();
        });
        socket.addEventListener("error", () => reject(new Error(`${this.label} websocket error`)));
        socket.addEventListener("close", () => {
          for (const waiter of this.waiters.splice(0)) {
            waiter.reject(new Error(`${this.label} socket closed before ${waiter.event}`));
          }
        });

        this.waitFor("connection:ack").then(resolve, reject);
      }),
      `${this.label} connect`,
    );

    return this;
  }

  send(event, payload) {
    if (!this.socket || this.socket.readyState !== WebSocketCtor.OPEN) {
      throw new Error(`${this.label} socket is not open`);
    }

    this.socket.send(JSON.stringify({ event, payload }));
  }

  waitFor(event, predicate = () => true) {
    const existing = this.messages.find(
      (message) => message.event === event && predicate(message.payload),
    );
    if (existing) {
      return Promise.resolve(existing.payload);
    }

    return withTimeout(
      new Promise((resolve, reject) => {
        this.waiters.push({ event, predicate, resolve, reject });
      }),
      `${this.label} wait ${event}`,
    );
  }

  flushWaiters() {
    for (const waiter of [...this.waiters]) {
      const match = this.messages.find(
        (message) => message.event === waiter.event && waiter.predicate(message.payload),
      );
      if (!match) continue;

      this.waiters = this.waiters.filter((entry) => entry !== waiter);
      waiter.resolve(match.payload);
    }
  }

  close() {
    this.socket?.close();
  }
}

function answerForQuestion(question) {
  switch (question.type) {
    case "multiple_choice":
    case "logic":
    case "majority_guess":
      return { type: "option", value: question.options[0].id };

    case "estimate":
      return { type: "number", value: 0 };

    case "ranking":
      return { type: "ranking", value: question.items.map((item) => item.id) };

    case "open_text":
      return { type: "text", value: "Smoke Test" };

    default:
      throw new Error(`Unsupported question type in smoke test: ${question.type}`);
  }
}

function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
}

function makeSmokeGamePlan(catalog) {
  return {
    mode: "custom",
    questionCount: 6,
    categoryIds: catalog.categories.map((category) => category.id),
    questionTypes: catalog.questionTypes
      .map((entry) => entry.type)
      .filter((type) =>
        ["multiple_choice", "logic", "majority_guess", "estimate"].includes(type),
      ),
    timerMs: 90000,
    revealDurationMs: 30000,
    revealMode: "manual_with_fallback",
    showAnswerTextOnPlayerDevices: false,
    enableDemoQuestion: false,
    displayShowLevel: "minimal",
    rankingScoringMode: "partial_with_bonus",
  };
}

async function resumeSession(label, sessionId, roomId) {
  const client = await new SmokeClient(label).connect();
  client.send("connection:resume", { sessionId, roomId });
  await client.waitFor("connection:resumed", (payload) => payload.sessionId === sessionId);
  return client;
}

async function answerCurrentQuestion({
  room,
  display,
  host,
  player1,
  player2,
  joined1,
  joined2,
  questionIndex,
}) {
  const displayQuestion = await display.waitFor(
    "question:show",
    (payload) => payload.questionIndex === questionIndex,
  );
  const playerQuestion1 = await player1.waitFor(
    "question:controller",
    (payload) => payload.questionId === displayQuestion.questionId,
  );
  const playerQuestion2 = await player2.waitFor(
    "question:controller",
    (payload) => payload.questionId === displayQuestion.questionId,
  );

  if (displayQuestion.durationMs !== 90000) {
    throw new Error(`expected 90s question timer, got ${displayQuestion.durationMs}`);
  }

  await display.waitFor(
    "question:timer",
    (payload) => payload.questionId === displayQuestion.questionId && payload.remainingMs > 0,
  );

  player1.send("answer:submit", {
    roomId: room.roomId,
    questionId: playerQuestion1.questionId,
    playerId: joined1.playerId,
    answer: answerForQuestion(playerQuestion1),
    requestId: randomUUID(),
  });
  player2.send("answer:submit", {
    roomId: room.roomId,
    questionId: playerQuestion2.questionId,
    playerId: joined2.playerId,
    answer: answerForQuestion(playerQuestion2),
    requestId: randomUUID(),
  });

  await player1.waitFor(
    "answer:accepted",
    (payload) => payload.questionId === displayQuestion.questionId,
  );
  await player2.waitFor(
    "answer:accepted",
    (payload) => payload.questionId === displayQuestion.questionId,
  );
  await display.waitFor(
    "answer:progress",
    (payload) => payload.questionId === displayQuestion.questionId && payload.answeredCount === 2,
  );
  await host.waitFor(
    "answer:progress",
    (payload) => payload.questionId === displayQuestion.questionId && payload.answeredCount === 2,
  );

  const displayReveal = await display.waitFor(
    "question:reveal",
    (payload) => payload.questionId === displayQuestion.questionId,
  );
  const hostReveal = await host.waitFor(
    "question:reveal",
    (payload) => payload.questionId === displayQuestion.questionId,
  );
  assertNonEmptyString(displayReveal.explanation, "display reveal explanation");
  assertNonEmptyString(hostReveal.explanation, "host reveal explanation");
  await player1.waitFor(
    "question:reveal",
    (payload) => payload.questionId === displayQuestion.questionId,
  );
  await display.waitFor(
    "next-question:ready-progress",
    (payload) =>
      payload.questionId === displayQuestion.questionId &&
      payload.readyCount === 0 &&
      payload.totalEligiblePlayers === 2 &&
      payload.gameState === "revealing",
  );

  return displayQuestion;
}

async function readyFromReveal({ room, player1, player2, joined1, joined2, questionId }) {
  player1.send("next-question:ready", {
    roomId: room.roomId,
    questionId,
    playerId: joined1.playerId,
  });
  player2.send("next-question:ready", {
    roomId: room.roomId,
    questionId,
    playerId: joined2.playerId,
  });
}

async function readyFromScoreboard({ room, player1, player2, joined1, joined2, questionId }) {
  await readyFromReveal({ room, player1, player2, joined1, joined2, questionId });
}

const clients = [];

try {
  const display = await new SmokeClient("display").connect();
  clients.push(display);
  display.send("display:create-room", {});
  const room = await display.waitFor("display:room-created");

  const host = await new SmokeClient("host").connect();
  clients.push(host);
  host.send("host:connect", {
    hostToken: room.hostToken,
    clientInfo: { deviceType: "smoke", appVersion: "local" },
  });
  const hostConnected = await host.waitFor("host:connected");
  const catalog = await host.waitFor("catalog:summary");

  const player1 = await new SmokeClient("player-1").connect();
  clients.push(player1);
  player1.send("room:join", { joinCode: room.joinCode, playerName: "Smoke 1" });
  const joined1 = await player1.waitFor("player:joined");

  const player2 = await new SmokeClient("player-2").connect();
  clients.push(player2);
  player2.send("room:join", { joinCode: room.joinCode, playerName: "Smoke 2" });
  const joined2 = await player2.waitFor("player:joined");

  host.send("game:start", { roomId: room.roomId, gamePlan: makeSmokeGamePlan(catalog) });

  for (let questionIndex = 0; questionIndex < 4; questionIndex++) {
    const displayQuestion = await answerCurrentQuestion({
      room,
      display,
      host,
      player1,
      player2,
      joined1,
      joined2,
      questionIndex,
    });
    await readyFromReveal({
      room,
      player1,
      player2,
      joined1,
      joined2,
      questionId: displayQuestion.questionId,
    });
  }

  const fifthQuestion = await answerCurrentQuestion({
    room,
    display,
    host,
    player1,
    player2,
    joined1,
    joined2,
    questionIndex: 4,
  });
  await readyFromReveal({
    room,
    player1,
    player2,
    joined1,
    joined2,
    questionId: fifthQuestion.questionId,
  });

  const displayScore = await display.waitFor(
    "score:update",
    (payload) => payload.questionId === fifthQuestion.questionId,
  );
  const hostScore = await host.waitFor(
    "score:update",
    (payload) => payload.questionId === fifthQuestion.questionId,
  );
  await player1.waitFor(
    "score:update",
    (payload) => payload.questionId === fifthQuestion.questionId,
  );
  if (!Array.isArray(displayScore.scoreChanges) || !Array.isArray(hostScore.scoreChanges)) {
    throw new Error("score:update must include scoreChanges arrays");
  }
  await readyFromScoreboard({
    room,
    player1,
    player2,
    joined1,
    joined2,
    questionId: fifthQuestion.questionId,
  });

  const finalQuestion = await answerCurrentQuestion({
    room,
    display,
    host,
    player1,
    player2,
    joined1,
    joined2,
    questionIndex: 5,
  });
  await readyFromReveal({
    room,
    player1,
    player2,
    joined1,
    joined2,
    questionId: finalQuestion.questionId,
  });
  await display.waitFor("game:finished", (payload) => payload.finalScoreboard.length === 2);

  clients.push(await resumeSession("display-resume", room.displaySessionId, room.roomId));
  clients.push(await resumeSession("host-resume", hostConnected.hostSessionId, room.roomId));
  clients.push(await resumeSession("player-1-resume", joined1.sessionId, room.roomId));

  console.log("smoke ok: 90s timer, reveal readiness, scoreboard after question 5, final standings, reconnect");
} finally {
  for (const client of clients.reverse()) {
    client.close();
  }
}

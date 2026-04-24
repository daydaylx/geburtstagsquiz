# AGENTS.md

## Project Overview

**Quiz Dual Screen** — a private, browser-based multiplayer quiz for a single evening event. German-language Millennials quiz. One Node server, a host screen (laptop/TV), and players on smartphones.

This is NOT a product, platform, SaaS, or long-term system. Every change must justify itself against: "does this help the quiz evening work reliably?"

## Essential Commands

```bash
pnpm dev              # Start all apps in parallel (server on :3001, web-host, web-player)
pnpm build            # Build all packages and apps
pnpm typecheck        # TypeScript type-check all packages and apps
pnpm test             # Run vitest (tests in packages/*/src/**/*.test.ts)
pnpm review:questions # Start question review tool (tools/question-review/server.mjs)
```

- **Package manager**: pnpm (>=9), monorepo via `pnpm-workspace.yaml`
- **Node**: >=20
- **Test runner**: vitest, configured at root with `include: ["packages/*/src/**/*.test.ts"]`
- **Server dev**: `tsx watch src/index.ts` (in apps/server)
- **Client dev**: Vite (in apps/web-host, apps/web-player)

## Monorepo Structure

```
apps/
  server/          → Node.js WebSocket server (room, game, timer, scoring)
  web-host/        → React 19 + Vite host screen (lobby, question display, scoreboard)
  web-player/      → React 19 + Vite player UI (join, answer, status)
packages/
  shared-types/    → TypeScript types and enums (Question, Player, Room, Scoreboard, etc.)
  shared-protocol/ → Event names, zod schemas, envelope parse/serialize (single source of truth for wire format)
  shared-utils/    → Pure helpers (join-code, player names, network, assertions)
  quiz-engine/     → Evaluation functions (multiple-choice, estimate, ranking, scoreboard)
tools/
  question-review/ → Standalone Node server for reviewing quiz questions in a browser
```

### Package Alias Paths (tsconfig.base.json)

```
@quiz/shared-types    → packages/shared-types/src/index.ts
@quiz/shared-protocol → packages/shared-protocol/src/index.ts
@quiz/shared-utils    → packages/shared-utils/src/index.ts
@quiz/quiz-engine     → packages/quiz-engine/src/index.ts
```

All apps reference these via `workspace:*` dependencies. Import paths use `.js` extensions (e.g., `from "./config.js"`) despite writing TypeScript.

## Architecture

### Server is Authoritative

The server decides: room state, active question, timer, valid answers, points, scoreboard. Clients display and submit — they never decide game logic.

### WebSocket Protocol

All communication uses a JSON envelope: `{ event: "room:create", payload: {...} }`.

- **Event names** are constants in `packages/shared-protocol/src/events.ts` (the `EVENTS` object)
- **Payload schemas** are zod schemas in `packages/shared-protocol/src/schemas.ts`
- **Parsing/serialization** in `packages/shared-protocol/src/envelope.ts`

When adding an event: define the name in `EVENTS`, create the zod schema, add to the appropriate direction map (`CLIENT_TO_SERVER_EVENT_SCHEMAS` or `SERVER_TO_*`), and export the payload type. If docs and code disagree, code wins.

### State Machines

- **RoomState**: `waiting → in_game → completed → closed` (enum in `shared-types`)
- **GameState**: `idle → question_active → answer_locked → revealing → scoreboard → completed`
- **PlayerState**: `ready → answering → answered` (and `disconnected` for grace period)

Game flow is linear: `idle → question_active → answer_locked → revealing → scoreboard → idle/completed`. No branching, no pause states.

### Server In-Memory State

All state lives in memory (`apps/server/src/state.ts`): `roomsById`, `roomIdByJoinCode`, `sessionsById`. Server restart = everything lost. This is intentional.

### Server Modules

| File | Purpose |
|---|---|
| `index.ts` | HTTP server, WebSocket upgrade, message routing (switch on event name) |
| `config.ts` | Constants: PORT (3001), heartbeat (15s), player grace (30s), host grace (5min), question duration (60s), reveal duration (5s) |
| `state.ts` | Global Maps (roomsById, sessionsById, roomIdByJoinCode), logRoomEvent |
| `room.ts` | createRoom, closeRoom, removePlayerFromRoom, attachSocketToSession, join code generation |
| `lobby.ts` | handleRoomJoin, handleConnectionResume, resumeSession, broadcastLobbyUpdate |
| `game.ts` | handleGameStart, handleGameNextQuestion, handleAnswerSubmit, handleNextQuestionReady, startQuestion, closeQuestion, evaluateQuestion, showScoreboard, advanceFromScoreboard, finishGame |
| `connection.ts` | broadcastToRoom, syncSessionToRoomState (for reconnect snapshots) |
| `session.ts` | handleSocketClose (grace timers, disconnect logic) |
| `protocol.ts` | sendEvent, sendProtocolError, toLobbyUpdatePayload |
| `server-types.ts` | TrackedWebSocket, SessionRecord, RoomRecord interfaces |
| `quiz-data.ts` | Hardcoded quiz data (the Millennials quiz with ~130+ questions) |

### Question Types

Five types supported (`QuestionType` enum):

| Type | Answer format | Evaluation |
|---|---|---|
| `multiple_choice` | `{ type: "option", value: "A" }` | Exact match |
| `logic` | `{ type: "option", value: "A" }` | Exact match (same as MC, different UI label) |
| `estimate` | `{ type: "number", value: 42.5 }` | Closest answer wins |
| `majority_guess` | `{ type: "number", value: 55 }` | Closest answer wins (same eval as estimate) |
| `ranking` | `{ type: "ranking", value: ["B","A","C"] }` | Exact order match |

### Client Architecture

Both clients are single-file React 19 apps (`App.tsx`) with no routing library. State management is purely `useState` + `useRef` + `useEffectEvent`. No external state management.

- Clients auto-reconnect with exponential backoff via `getReconnectDelay()` from shared-utils
- Session persistence via `localStorage` (`storage.ts` in each app)
- Vite env vars: `VITE_PUBLIC_HOST`, `VITE_SERVER_PORT`, `VITE_PLAYER_PORT`
- Player join URL includes `?joinCode=...` for QR scanning

## Key Patterns and Conventions

### Import Extensions

All local imports use `.js` extension: `from "./config.js"`. This is required by the ESM/moduleResolution:"bundler" setup.

### Zod Schema Strictness

All zod schemas use `.strict()` — extra fields cause validation failure. When adding payload fields, the schema must match exactly.

### Event Name Convention

Event names use `namespace:action` format: `room:create`, `game:start`, `answer:submit`, `question:show`, etc. Server-to-client often uses past tense: `room:created`, `game:started`, `player:joined`.

### Timer Architecture

Server sends `question:timer` events every 500ms during active questions. The server-side `questionTimer` setTimeout (from `config.ts` QUESTION_DURATION_MS = 60s) is the authoritative timer. `question:close` is the definitive "too late" signal. Note: `quiz-data.ts` has per-question `durationMs` values, but `game.ts` overrides them all to `QUESTION_DURATION_MS` at game start.

### Next-Question Auto-Advance

After scoreboard, players tap "ready" on their phones (`next-question:ready`). When ALL connected players are ready, the server auto-advances to the next question. Disconnected players don't block. `game:next-question` from host exists as a manual fallback but isn't in normal UI flow.

### Duplicate Answer Prevention

Server checks `room.currentAnswers.has(player.id)` — only the first valid answer per player per question counts. Submissions are rejected with reason "duplicate".

## Gotchas and Non-Obvious Details

- **`.yarnrc.yml` and `.yarnrc` exist but are empty** — this project uses pnpm, not yarn. The files are vestigial.
- **Quiz data is hardcoded** in `apps/server/src/quiz-data.ts` (~2000 lines). There is no database, no API for loading quizzes. `getDefaultQuiz()` returns the one quiz.
- **`RoomState.Created` exists in the enum** but isn't used as a runtime state — new rooms go directly to `Waiting`.
- **`PlayerState.Connected` and `Reconnecting` exist in the enum** but aren't used as documented runtime states in the actual flow.
- **`game:next-question`** is wired in the server but NOT exposed in the host UI's normal flow. It's a technical fallback. The normal flow is auto-advance via player readiness.
- **Both web clients have `useEffectEvent`** — this is a React 19 experimental hook. Don't replace with `useCallback`.
- **Timer ticks happen every 500ms** (`setInterval` in `game.ts:startQuestion`), not 1s.
- **Reconnect during game**: `syncSessionToRoomState` in `connection.ts` replays the full state for the reconnecting client (question, timer, answers, scoreboard depending on game state). This is the largest function in the codebase.
- **The `.kilo/` directory** is a separate agent worktree — not part of the quiz app itself.
- **`tools/question-review/`** is a standalone Node HTTP server (`server.mjs`, not TypeScript) for reviewing quiz questions. Run with `node tools/question-review/server.mjs`.
- **No linter or formatter is configured** — there is no ESLint, Prettier, or similar tool in the project.
- **Root `vitest.config.ts`** only includes `packages/*/src/**/*.test.ts` — server and app tests would need a config change to be discovered.

## Testing

Tests exist in:
- `packages/quiz-engine/src/multiple-choice.test.ts` — MC evaluation
- `packages/quiz-engine/src/estimate.test.ts` — Estimate evaluation
- `packages/quiz-engine/src/scoreboard.test.ts` — Scoreboard helpers
- `packages/shared-protocol/src/schemas.test.ts` — Envelope parsing roundtrips

Tests use vitest (`describe`/`it`/`expect`). Run all with `pnpm test`. There are no server-level integration tests, no E2E tests, and no client tests. The quiz-engine evaluation functions are the most critical to test when changing scoring logic.

## Hard Boundaries (What NOT to Build)

- No accounts, profiles, or authentication
- No cloud storage, database, or persistence
- No admin system, moderation, or global highscores
- No teams, jokers, buzzer modes (unless explicitly requested)
- No editor, import, or quiz management UI
- No multi-tenant, scaling, or platform thinking
- Technically possible ≠ automatically appropriate

## Review Checklist

Before and after any change:
- Does this directly help the quiz evening?
- Is the core flow simpler, or just theoretically cleaner?
- Is any logic duplicated?
- Is the server still authoritative?
- Is a new abstraction genuinely needed?
- Is the player UI still usable on a phone?
- Is the host screen still readable from a distance?

## Documentation Files to Update on Relevant Changes

- `README.md`
- `docs/architecture.md`
- `docs/event-protocol.md`
- `docs/state-machine.md`
- `docs/IMPLEMENTATION.md`
- `docs/CONSTRAINTS.md`
- `docs/GAME-RULES.md`

Code and docs must not diverge. When in doubt, code is truth.

## Bottom Line

When the choice is between "architecturally elegant" and "reliable for the evening", reliability wins.

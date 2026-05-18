# Copilot Instructions

Read `AGENTS.md` before making broad suggestions. This repo is a private one-evening birthday quiz, not a reusable SaaS platform.

## Project Shape

- Four services: `apps/server` (`3001`), `apps/web-host` (`5173`), `apps/web-player` (`5174`), `apps/web-display` (`5175`).
- The server is authoritative for room state, active question, timers, answers, scoring and scoreboard.
- Shared protocol and types live in `packages/shared-protocol` and `packages/shared-types`.
- UI language is German.
- Styling is app-local CSS in `apps/*/src/styles.css`; there is no Tailwind setup.

## Commands

Use pnpm via Corepack:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm dev
corepack pnpm run validate
```

`validate` runs lint, typecheck, tests and build.

## Coding Rules

- Keep changes small and directly tied to the task.
- Use existing helpers and patterns before adding abstractions.
- Local TypeScript imports use `.js` extensions.
- Zod payload schemas are strict; update event constants, schemas, direction maps, exports, server dispatch and clients together.
- Do not send full question/answer data to players; player question payloads are reduced controller payloads.
- Do not introduce dependencies, persistence, accounts, admin systems, Durable Objects or global high scores without explicit instruction.

## Hard Limits

- Do not edit quiz questions, scoring, game mechanics or UI design unless explicitly asked.
- Do not write secrets, tokens, certificates, `.cloudflared/` contents or real `.env` files.
- Do not perform Cloudflare, DNS, tunnel-routing, secret or deployment actions without explicit `[CONFIRM]`.
- Do not touch `disaai.de`, `www.disaai.de` or existing Disa-AI deployments.

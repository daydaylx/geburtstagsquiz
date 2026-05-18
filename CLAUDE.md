# CLAUDE.md

Kanonische Regeln stehen in `AGENTS.md`. Diese Datei ist der kurze operative Einstieg fuer Claude Code.

## Projekt

Privates Geburtstagsquiz fuer einen Abend: Node/WebSocket-Server, Display/TV, Host-Controller und Player-UI. Der Server ist die einzige Spielwahrheit; Clients senden nur Absichten oder zeigen Zustand.

## Erst Lesen

- `AGENTS.md`
- `WORKFLOW.md`
- betroffene Dateien
- bei Protokoll-/State-Aenderungen: `docs/event-protocol.md` und `docs/state-machine.md`
- bei Tunnel-/Domain-Themen: `docs/DEPLOYMENT-CLOUDFLARE-TUNNEL.md`

Vor Datei-Edits:

```bash
git status --short
```

## Befehle

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm dev
corepack pnpm run validate
```

Einzelservices:

```bash
corepack pnpm --filter @quiz/server run dev
corepack pnpm --filter @quiz/web-host run dev
corepack pnpm --filter @quiz/web-display run dev
corepack pnpm --filter @quiz/web-player run dev
```

Smoke-Test bei laufendem Server:

```bash
corepack pnpm run smoke:local
SMOKE_WS_URL=wss://api.quiz.disaai.de corepack pnpm run smoke:local
```

## Workflow

1. Repo-Status und relevante Doku pruefen.
2. Betroffene Module lesen, besonders shared protocol/types bei Server- oder Client-Events.
3. Kleine, direkte Aenderung umsetzen.
4. Passende Tests/Checks ausfuehren.
5. Im Abschluss nennen, was geaendert wurde und welche Checks liefen.

## No-Go

- Keine Features, UI-Redesigns, Fragenkatalog-, Spielmechanik- oder Scoring-Aenderungen ohne ausdruecklichen Auftrag.
- Keine neuen Dependencies ohne klare Begruendung.
- Keine Datenbank, Persistenz, Durable Objects, Accounts, Adminsysteme oder globalen Highscores einfuehren.
- Keine Secrets, Tokens, Zertifikate, `.cloudflared/`-Inhalte oder echte `.env`-Dateien schreiben.
- Keine Cloudflare-, DNS-, Tunnel-Routing-, Secret- oder Deployment-Aktionen ohne explizites `[CONFIRM]`.
- `disaai.de`, `www.disaai.de` und bestehende Disa-AI-Deployments nicht anfassen.

## Wichtige Pfade

- Server: `apps/server/src`
- Host: `apps/web-host/src`
- Display: `apps/web-display/src`
- Player: `apps/web-player/src`
- Protokoll: `packages/shared-protocol/src`
- Shared Types: `packages/shared-types/src`
- Quiz Engine: `packages/quiz-engine/src`
- Abendstart: `quiz.sh`

## Verifikation

Standard:

```bash
corepack pnpm run validate
```

Bei reinen Doku-Aenderungen mindestens:

```bash
git diff --check
```

Wenn ein Check nicht ausgefuehrt werden kann oder fehlschlaegt, den genauen Befehl und Grund nennen.

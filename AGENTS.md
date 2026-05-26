# AGENTS.md

## Project Overview

Privates browserbasiertes Quiz fuer kleine private Runden.

Dieses Repo ist kein Produkt, keine Plattform und kein langfristiges SaaS-System. Ziel ist ein stabiler Ablauf mit getrenntem Display/TV, Host-Controller, Player-UI, WebSocket/API-Backend und Cloudflare Tunnel als oeffentlichem Einstieg.

Jede Aenderung muss gegen diese Frage bestehen: Hilft sie, den Quiz-Abend verlaesslich durchzufuehren?

## Tech Stack

- Monorepo mit pnpm Workspaces (`pnpm@10.33.1` via Corepack), Node.js `>=20`.
- TypeScript ESM mit `.js` Import-Endungen bei lokalen Imports, `moduleResolution: "bundler"`.
- Server: Node.js, `ws`, In-Memory-State, keine Datenbank.
- Web-Apps: React 19 + Vite, je App eigene `styles.css`, kein React Router.
- Protokoll: WebSocket-Envelopes `{ "event": "...", "payload": ... }`, Zod-Schemas in `packages/shared-protocol`.
- Tests: Vitest fuer shared packages und Server. Kein Browser-E2E; Smoke-Test spricht das WebSocket-Protokoll direkt.
- Lint/Format: Biome, konfiguriert in `biome.json`.
- Abendbetrieb: lokale Services hinter bestehendem Cloudflare Tunnel.

## Repository Structure

| Pfad | Zweck |
| --- | --- |
| `apps/server` | Authoritative WebSocket/API-Server: Raeume, Sessions, Timer, Antworten, Punkte |
| `apps/web-display` | Display/TV: Lobby, QR-Codes, Fragen, Reveal, Scoreboard |
| `apps/web-host` | Host-Controller: Raum erstellen, Display koppeln, Einstellungen, Fortschritt, Fallbacks |
| `apps/web-player` | Smartphone-UI: Join, Antwort-Controller, Status |
| `packages/shared-types` | Gemeinsame Interfaces und Enums (`RoomState`, `GameState`, `QuestionType`, etc.) |
| `packages/shared-protocol` | Eventnamen, Zod-Payload-Schemas, Envelope-Parsing, Error-Codes |
| `packages/shared-utils` | Join-Code-, Namen- und Netzwerk-Helfer |
| `packages/shared-hooks` | React-Hook `useWebSocket` mit Auto-Reconnect |
| `packages/quiz-engine` | Reine Auswertungs- und Scoreboard-Logik ohne Side Effects |
| `data/quiz/questions` | Fragenkatalog; nur mit ausdruecklichem Auftrag aendern |
| `docs` | Architektur, State Machine, Event-Protokoll, Deployment, Regeln, Risiken |
| `deploy` | Beispielkonfigurationen; keine echten Credentials |
| `.github/workflows` | CI: Install, Lint, Typecheck, Test, Build |

## Common Commands

### Install

```bash
corepack pnpm install --frozen-lockfile
```

Nutze pnpm. `pnpm-lock.yaml` ist der kanonische Lockfile. Ignorierte leere `package-lock.json`/`yarn.lock` im Arbeitsbaum sind keine Einladung, npm oder Yarn zu verwenden.

### Development

```bash
corepack pnpm dev
```

Startet alle vier Services parallel.

Einzelne Services:

```bash
corepack pnpm --filter @quiz/server run dev
corepack pnpm --filter @quiz/web-host run dev
corepack pnpm --filter @quiz/web-display run dev
corepack pnpm --filter @quiz/web-player run dev
```

Ports:

| Service | Port |
| --- | --- |
| Server | `3001` |
| Host | `5173` |
| Player | `5174` |
| Display/TV | `5175` |

Der Server-Dev-Start nutzt `node --watch --import tsx src/index.ts`. Fallback nur bei Bedarf: `corepack pnpm --filter @quiz/server run dev:tsx`.

### Build

```bash
corepack pnpm build
```

### Preview

Es gibt keinen separaten Root-Preview-Befehl. Fuer den Abend ist `./quiz.sh` der unterstuetzte Runtime-Start. Fuer lokale Entwicklung laufen die Vite-Dev-Server ueber `corepack pnpm dev` oder die Einzelservice-Befehle.

### Lint

```bash
corepack pnpm lint
```

### Test

```bash
corepack pnpm test
```

### Typecheck

```bash
corepack pnpm typecheck
```

### Full Validation

```bash
corepack pnpm run validate
```

Fuehrt `lint`, `typecheck`, `test` und `build` in dieser Reihenfolge aus.

### Smoke-Test

Bei laufendem Server (`localhost:3001`) oder laufendem Tunnel:

```bash
corepack pnpm run smoke:local
SMOKE_WS_URL=wss://api.quiz.disaai.de corepack pnpm run smoke:local
```

Der Smoke-Test verbindet Host, Display und zwei Player per WebSocket, erstellt den Raum ueber den Host, koppelt das Display per Popout-Token, startet einen 90s-Spielplan und prueft den Ablauf bis Endstand und Resume-Snapshots.

### Abendbetrieb

```bash
./quiz.sh
```

Startet lokale Dienste und bestehenden Cloudflare Tunnel. Keine Tunnel-, DNS-, Secret- oder Deployment-Aenderung ohne explizites `[CONFIRM]`.

## Architecture Rules

### Server Is Authoritative

Der Server (`apps/server`) ist die alleinige Spielwahrheit. Display, Host und Player zeigen Zustand an oder senden Absichten, entscheiden aber keine Spielwahrheiten.

Der Server entscheidet ueber:

- Raumstatus
- aktive Frage
- Timer
- Antwortannahme
- Punkte
- Rangliste

### Core State Machine

- **RoomState**: `waiting` -> `in_game` -> `completed` -> `closed`; `created` existiert im Enum, wird aber nicht als Laufzeit-Zustand genutzt.
- **GameState**: `idle` -> `question_active` -> `answer_locked` -> `revealing` -> optional `scoreboard` -> `completed`.
- **PlayerState**: `ready` -> `answering` -> `answered` oder `disconnected`.

Details stehen in `docs/state-machine.md`.

### WebSocket Protocol

Alle Nachrichten nutzen `{ "event": "...", "payload": ... }`.

Beim Aendern eines Events muessen konsistent aktualisiert werden:

1. Eventkonstante in `packages/shared-protocol/src/events.ts`
2. Payload-Schema in `packages/shared-protocol/src/schemas.ts`
3. passende Richtungs-Map in `schemas.ts`
4. Payload-Typ-Export in `schemas.ts`
5. Server-Dispatch und Rollenpruefung, falls das Event neu ist
6. betroffene Clients und Tests

Display und Host erhalten `question:show` mit vollstaendiger Frage. Player erhalten `question:controller` mit reduzierten Daten. Diese Trennung passiert in `apps/server/src/question-payloads.ts`.

## Agent Working Rules

- Erst lesen, dann aendern: `git status --short`, relevante Doku, betroffene Dateien.
- Kleine, gezielte Aenderungen bevorzugen. Keine grossen Refactorings wegen Ordnung.
- Bestehende Patterns, Module, Types und Helfer nutzen, bevor neue Abstraktionen entstehen.
- Keine neuen Dependencies ohne klaren, repo-spezifischen Nutzen.
- Keine Produktlogik aendern, wenn die Aufgabe Dokumentation oder Workflow betrifft.
- Keine Features ohne ausdruecklichen Auftrag.
- Keine UI-Redesigns ohne ausdruecklichen Auftrag.
- Keine Fragenkatalog-Aenderungen ohne ausdruecklichen Auftrag.
- Keine Spielmechanik-, Scoring- oder Fragetyp-Aenderungen ohne ausdruecklichen Auftrag.
- Keine Durable Objects, Datenbank, Persistenz, Accounts, Profile, Adminsysteme oder globale Highscores einfuehren.
- Keine echten Secrets, Tokens, Zertifikate, Tunnel-Credentials oder `.env`-Dateien ins Repo schreiben.
- Keine DNS-, Tunnel-Routing-, Secret-, Cloudflare- oder Deployment-Aktionen ohne explizites `[CONFIRM]`.
- `disaai.de`, `www.disaai.de` und bestehende Disa-AI-Deployments nicht anfassen.
- UI-Sprache bleibt Deutsch.
- Bei UI-Aenderungen vorhandene App-Struktur, CSS-Variablen, responsive Constraints, Lesbarkeit auf TV/Handy und Accessibility pruefen.
- Nach Aenderungen passende Checks ausfuehren oder konkret begruenden, warum sie nicht laufen konnten.
- Nutzer- oder Fremdaenderungen im Arbeitsbaum nicht zuruecksetzen.

## Critical Files

| Datei | Warum kritisch |
| --- | --- |
| `apps/server/src/index.ts` | HTTP/WebSocket-Server, Message-Dispatch, Rollen-Auth |
| `apps/server/src/game.ts` | Spielstart, Frage-Ablauf, Antwortannahme, Reveal, Scoreboard, Finish |
| `apps/server/src/lobby.ts` | Room-Join, Host-/Display-Connect, Resume, Settings, Kategorie-Voting |
| `apps/server/src/session.ts` | Disconnect-Grace-Logik und Socket-Close-Verhalten |
| `apps/server/src/state.ts` | Globale In-Memory-Maps fuer Raeume und Sessions |
| `apps/server/src/config.ts` | Ports, Origins, Grace-Zeiten, Timer-Konstanten |
| `apps/server/src/question-payloads.ts` | Trennt Host/Display-Vollfrage von Player-Controller-Payload |
| `packages/shared-protocol/src/events.ts` | Kanonische Eventnamen |
| `packages/shared-protocol/src/schemas.ts` | Kanonische Payload-Schemas und Rollen-Richtungen |
| `packages/shared-types/src` | Geteilte States, Questions, Answers, GamePlan, Room, Player |
| `packages/quiz-engine/src` | Reine Auswertungs- und Scoreboard-Funktionen |
| `apps/*/src/hooks/use*Session.ts` | Clientseitige Session-State-Maschinen und Event-Handler |
| `apps/*/src/storage.ts` | localStorage-Resume-Daten |
| `apps/*/src/styles.css` | App-lokale Design-Tokens und Layouts |
| `quiz.sh` | Abend-/Hotspot-Start fuer Services plus bestehenden Tunnel |
| `.env.tunnel.example` | Beispielwerte fuer Domain-/Tunnelbetrieb |
| `deploy/cloudflare-tunnel.example.yml` | Beispiel-Mapping fuer Tunnel, keine echten Credentials |
| `.github/workflows/ci.yml` | CI-Reihenfolge und Validierungsstandard |

## Styling / Design System

- Kein Tailwind und kein zentrales Component-Designsystem.
- Jede Web-App hat eine eigene `styles.css` mit lokalen CSS-Variablen und app-spezifischen Klassen.
- Gemeinsame visuelle Basis: dunkler Hintergrund, ruhige Panels, Gold/Cyan-Akzente, Gruen/Rot/Amber fuer Status.
- `docs/DESIGN-DIRECTION.md` beschreibt die Zielrichtung: hochwertige Game-Show, keine Neon-/Cyberpunk-Uebertreibung.
- Display/TV: grosse Hierarchie, aus 3-4 m lesbar, wenig Meta-Rauschen.
- Host: Regiepult, primaere Aktion sichtbar, Status und Fallbacks klar.
- Player: mobile-first, ein-Hand-bedienbar, klare Antwort- und Verbindungszustaende.
- Keine globalen UI-Aenderungen, ohne alle drei Apps und vorhandene Token/Klassen zu pruefen.
- Keine Shared-CSS-Abstraktion einfuehren, nur weil Token aehnlich aussehen; die Apps bleiben bewusst eigenstaendig.

## Testing & Verification

Vitest-Scope in `vitest.config.ts`:

```text
packages/*/src/**/*.test.ts
apps/server/src/**/*.test.ts
```

Regel fuer Abschluss:

```bash
corepack pnpm run validate
```

Bei kleineren Doku-Aenderungen reicht mindestens:

```bash
git diff --check
```

Bei Runtime- oder Protokoll-Aenderungen zusaetzlich:

```bash
corepack pnpm run smoke:local
```

Wenn der Tunnel aktiv ist und Domainbetrieb betroffen ist:

```bash
SMOKE_WS_URL=wss://api.quiz.disaai.de corepack pnpm run smoke:local
```

CI-Reihenfolge bleibt: install -> lint -> typecheck -> test -> build.

## Known Pitfalls

- Der Serverzustand ist In-Memory. Server-Neustart bedeutet: Raum und Spielstand sind weg.
- `display:create-room` und `host:connect` existieren noch als Legacy-/Fallback-Pfad; Host-first mit `host:create-room` und `display:connect-room` ist der primaere Flow.
- Scoreboard erscheint nur nach jeder 5. echten Frage, nicht nach Demo und nicht nach jeder Runde.
- Player duerfen nicht die volle Frage inklusive korrekter Antwort erhalten; `question:controller` bleibt reduziert.
- Zod-Schemas sind `.strict()`: unerwartete Felder brechen Payload-Validierung.
- Lokale Imports brauchen `.js` Endungen trotz TypeScript-Dateien.
- `useEffectEvent` wird in React-Hooks fuer Handler genutzt, die aktuellen State lesen muessen; nicht reflexhaft durch `useCallback` ersetzen.
- Kein React Router; Navigation laeuft ueber Screen-State in den Session-Hooks.
- Vite-Proxies leiten `/ws` und `/api` lokal an `localhost:3001`, falls keine `VITE_SERVER_SOCKET_URL` gesetzt ist.
- Abendbetrieb braucht `VITE_PLAYER_JOIN_BASE_URL=https://play.quiz.disaai.de`, damit QR-Codes nicht auf localhost zeigen.
- `.cloudflared/`, echte `.env`-Dateien, Zertifikate und Credentials sind ignoriert und tabu.
- Es gibt ignorierte leere `package-lock.json`/`yarn.lock`; nicht verwenden, nicht als Paketmanager-Signal interpretieren.

## Cloudflare, DNS and Secrets

- Cloudflare Tunnel verbindet feste Subdomains mit lokal laufenden Diensten.
- `quiz.sh` startet den bestehenden Tunnel automatisch.
- Ziel-Subdomains:
  - `tv.quiz.disaai.de` -> Display/TV
  - `host.quiz.disaai.de` -> Host
  - `play.quiz.disaai.de` -> Player
  - `api.quiz.disaai.de` -> Server/API/WebSocket
- Erlaubte reine Checks ohne `[CONFIRM]`: lokale Dateien lesen, Doku pruefen, `cloudflared --version`, `cloudflared tunnel list`.
- Verboten ohne `[CONFIRM]`: Tunnel erstellen, Tunnel routen, DNS aendern, Secrets setzen, Deployments starten.
- Niemals committen: `.cloudflared/`, Zertifikate, private Keys, Credential-JSON, Tokens, echte Secrets.

## Definition of Done

- Dokumentation und Code widersprechen sich nicht.
- Services, Ports, Subdomains und Befehle sind korrekt beschrieben.
- Server bleibt authoritative.
- Keine neue Feature-Flaeche wurde ohne Auftrag geoeffnet.
- Keine Fragen-, Spielmechanik-, Scoring- oder UI-Redesign-Aenderung wurde eingeschmuggelt.
- Keine Secrets oder produktiven Cloudflare-/DNS-Aenderungen wurden erzeugt.
- Arbeitsbaum wurde vor und nach der Arbeit geprueft.
- Passende Checks wurden ausgefuehrt: mindestens `git diff --check`, fuer Code/Runtime `corepack pnpm run validate`, fuer Runtime-Flows Smoke-Test oder begruendete manuelle Pruefung.
- Falls ein Check nicht lief oder fehlschlug, ist der genaue Befehl und Grund im Abschluss genannt.

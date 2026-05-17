# AGENTS.md

## Projekt

Privates browserbasiertes Geburtstagsquiz fuer einen einzelnen Abend.

Das Repo ist kein Produkt, keine Plattform und kein langfristiges SaaS-System. Ziel ist ein stabiler Ablauf fuer einen Abend mit getrenntem Display/TV, Host-Controller, Player-UI, WebSocket/API-Backend und Cloudflare Tunnel als oeffentlichem Einstieg.

Jede Aenderung muss gegen diese Frage bestehen: Hilft sie, den Quiz-Abend verlaesslich durchzufuehren?

## Architektur

### Vier Services

| Service    | Package            | Port   | Rolle                                                                  |
| ---------- | ------------------ | ------ | ---------------------------------------------------------------------- |
| Server     | `apps/server`      | `3001` | Authoritative WebSocket-API, Timer, Punkte, Raeume                     |
| Display/TV | `apps/web-display` | `5175` | Publikumsbildschirm: Lobby, QR-Codes, Fragen, Reveal, Scoreboard       |
| Host       | `apps/web-host`    | `5173` | Spielleitungs-Controller: Start, Einstellungen, Fortschritt, Fallbacks |
| Player     | `apps/web-player`  | `5174` | Smartphone-UI: Join, Antwort-Controller, Status                        |

### Shared Packages

| Package                    | Zweck                                                                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared-types`    | TypeScript-Interfaces und Enums (`RoomState`, `GameState`, `PlayerState`, `QuestionType`, `Question`, `Player`, `Room`, `Answer`, `GamePlan`, etc.) |
| `packages/shared-protocol` | Eventnamen (`EVENTS`), Zod-Payload-Schemas, Envelope-Parsing und Serialisierung. Definiert das gesamte WebSocket-Protokoll.                         |
| `packages/shared-utils`    | Kleine Helfer: Join-Code-Validierung, Namensnormalisierung, Netzwerk-Helfer                                                                         |
| `packages/shared-hooks`    | React-Hook `useWebSocket` mit Auto-Reconnect, wird von allen drei Web-Apps genutzt                                                                  |
| `packages/quiz-engine`     | Reine Auswertungs- und Scoreboard-Logik ohne Side-Effects (`evaluateMultipleChoice`, `evaluateEstimate`, `evaluateRanking`, etc.)                   |

### Authoritative Server-Architektur

Der Server (`apps/server`) ist die alleinige Spielwahrheit. Display, Host und Player zeigen Zustand an oder senden Absichten (Intents), entscheiden aber keine Spielwahrheiten.

Alle relevanten States:

- **RoomState**: `waiting` → `in_game` → `completed` → `closed` (`created` existiert im Enum, wird aber nicht als Laufzeit-Zustand genutzt)
- **GameState**: `idle` → `question_active` → `answer_locked` → `revealing` → `scoreboard` → `completed`
- **PlayerState**: `ready` → `answering` → `answered` / `disconnected`

Siehe `docs/state-machine.md` fuer die vollstaendige Zustandsmaschine.

## Befehle

### Setup

```bash
corepack pnpm install --frozen-lockfile   # Abhaengigkeiten installieren
```

Voraussetzungen: Node.js `>=20`, pnpm via Corepack (`pnpm@10.33.1`).

### Entwicklung

```bash
corepack pnpm dev                          # Alle 4 Services parallel starten
```

Einzelne Services:

```bash
corepack pnpm --filter @quiz/server run dev          # Server mit --watch via tsx
corepack pnpm --filter @quiz/web-display run dev     # Display auf :5175
corepack pnpm --filter @quiz/web-host run dev        # Host auf :5173
corepack pnpm --filter @quiz/web-player run dev      # Player auf :5174
```

Server-Dev nutzt `node --watch --import tsx src/index.ts` (kein tsx watch). Fallback: `corepack pnpm --filter @quiz/server run dev:tsx` (nutzt `tsx watch`).

### Validierung

```bash
corepack pnpm lint                         # Biome check ueber apps, packages, scripts
corepack pnpm typecheck                    # TypeScript --noEmit ueber alle Packages
corepack pnpm test                         # Vitest (alle Tests in packages/*/src und apps/server/src)
corepack pnpm build                        # tsc + vite build ueber alle Packages
```

CI-Reihenfolge: `install → lint → typecheck → test → build`.

### Smoke-Test

Bei laufendem Server (`localhost:3001`) oder laufendem Tunnel:

```bash
corepack pnpm run smoke:local
SMOKE_WS_URL=wss://api.quiz.disaai.de corepack pnpm run smoke:local
```

Verbindet Host, Display und zwei Player per WebSocket, erstellt den Raum ueber den Host, koppelt das Display per Popout-Token, startet einen 90s-Spielplan und prueft den gesamten Spielablauf bis Endstand und Resume-Snapshots. Der Legacy-Display-first-Fallback wird kurz separat geprueft.

### Tools

```bash
corepack pnpm run review:questions          # Fragenreview-Tool (Browser-UI auf temporaerem Port)
./quiz.sh                                   # Abend-/Hotspot-Start: lokale Dienste + bestehender Cloudflare Tunnel
```

## Test-Scope

Tests liegen in:

- `packages/*/src/**/*.test.ts` — Unit-Tests fuer shared packages und quiz-engine
- `apps/server/src/**/*.test.ts` — Serverseitige Tests

Die vitest-Konfiguration (`vitest.config.ts`) definiert den Scope:

```
include: ["packages/*/src/**/*.test.ts", "apps/server/src/**/*.test.ts"]
```

Es gibt **keine** E2E-Browser-Tests. Der Smoke-Test (`scripts/smoke-local-game.mjs`) testet das WebSocket-Protokoll direkt.

Test-Pattern: Factory-Functions wie `makeQuestion()`, `makePlayer()`, `makeAnswer()` mit `vitest` (`describe`/`it`/`expect`).

## WebSocket-Protokoll

### Envelope-Format

Alle Nachrichten nutzen `{ "event": "...", "payload": ... }`.

- Eventnamen: `packages/shared-protocol/src/events.ts` (`EVENTS` Konstante)
- Payload-Schemas: `packages/shared-protocol/src/schemas.ts` (Zod, strikt)
- Envelope-Parsing: `packages/shared-protocol/src/envelope.ts`
- Error-Codes: `packages/shared-protocol/src/error-codes.ts`

### Richtungs-Schemas

Events sind nach Rolle und Richtung aufgeteilt:

- `DISPLAY_TO_SERVER_EVENT_SCHEMAS` / `HOST_TO_SERVER_EVENT_SCHEMAS` / `PLAYER_TO_SERVER_EVENT_SCHEMAS`
- `SERVER_TO_DISPLAY_EVENT_SCHEMAS` / `SERVER_TO_HOST_EVENT_SCHEMAS` / `SERVER_TO_PLAYER_EVENT_SCHEMAS`

**Beim Aendern eines Events** muessen konsistent aktualisiert werden:

1. Eventkonstante in `events.ts`
2. Payload-Schema in `schemas.ts`
3. Zugehoerige Richtungs-Map (z.B. `HOST_TO_SERVER_EVENT_SCHEMAS`)
4. Payload-Typ-Export in `schemas.ts`

### Event-Routing im Server

Der Server-Message-Handler (`apps/server/src/index.ts`) dispatched per `switch(event)` an Handler-Funktionen. Rolle-basierte Zugriffskontrolle erfolgt ueber `isEventAllowedForRole()` vor dem Dispatch.

Server-seitiges Senden:

- `sendEvent(socket, event, payload)` — Einzeln
- `sendToDisplay/sendToHost/sendToPlayers(room, event, payload)` — Per Rolle
- `broadcastToAllRoomClients/broadcastToHostAndDisplay(room, event, payload)` — Gruppen
- `sendProtocolError(socket, code, message, context)` — Fehler

### Frage-Darstellung nach Rolle

Display und Host erhalten `question:show` mit vollstaendiger Frage inklusive Optionen und Text. Player erhalten `question:controller` mit reduzierten Daten (z.B. ohne korrekte Antwort). Die Transformation passiert in `apps/server/src/question-payloads.ts`.

## Server-Interne Struktur

### State-Management

Globaler In-Memory-State in `apps/server/src/state.ts`:

- `roomsById: Map<string, RoomRecord>`
- `roomIdByJoinCode: Map<string, string>`
- `roomIdByHostToken: Map<string, string>`
- `sessionsById: Map<string, SessionRecord>`

Keine Persistenz, keine Datenbank. Bei Serverneustart ist alles weg.

### Module-Aufteilung

| Datei                  | Zuständigkeit                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------- |
| `index.ts`             | HTTP-Server, WebSocket-Server, Message-Dispatch, Rollen-Auth                        |
| `state.ts`             | Globale Maps und Helfer                                                             |
| `server-types.ts`      | `TrackedWebSocket`, `SessionRecord`, `RoomRecord`                                   |
| `config.ts`            | Port, Origins, Grace-Zeiten, Timer-Konstanten                                       |
| `protocol.ts`          | `sendEvent`, `sendProtocolError`, `toLobbyUpdatePayload`                            |
| `connection.ts`        | `sendToDisplay/Host/Players`, `broadcastToAllRoomClients`, `syncSessionToRoomState` |
| `session.ts`           | Socket-Close-Handler, Disconnect-Grace-Logik                                        |
| `room.ts`              | Raum-Erstellung, Join-Code-Generierung, `closeRoom`, `removePlayerFromRoom`         |
| `lobby.ts`             | Room-Join, Host-/Display-Connect, Connection-Resume, Settings-Update, Kategorie-Voting |
| `game.ts`              | Spiel-Start, Frage-Ablauf, Antwort-Annahme, Reveal, Scoreboard, Finish              |
| `game-plan.ts`         | GamePlan-Aufloesung, Demo-Frage, Fragen-Auswahl, Katalog-Summary                    |
| `game-scoreboard.ts`   | Scoreboard-Berechnung, Score-Changes, Final-Stats                                   |
| `room-selectors.ts`    | Reine Selektoren auf RoomRecord                                                     |
| `room-timers.ts`       | Timer-Cleanup                                                                       |
| `quiz-data.ts`         | Quiz-JSON laden und parsen                                                          |
| `question-payloads.ts` | Question → QuestionShow/Controller-Payload-Transformation                           |
| `answer-validation.ts` | Antwort-Validierung gegen Fragetyp                                                  |

### Disconnect-Grace-Zeiten

| Rolle   | Grace-Zeit | Konsequenz                                                      |
| ------- | ---------- | --------------------------------------------------------------- |
| Display | 45s        | Display wird als getrennt markiert, Lobby-Update gesendet       |
| Host    | 5min       | Raum wird geschlossen (`closeRoom`)                             |
| Player  | 30s        | Spieler wird aus dem Raum entfernt (`removePlayerFromRoom`)     |

Konfiguriert in `apps/server/src/config.ts`. Display schließt den Raum **nicht** — nur der Host-Disconnect schließt den Raum.

## Web-App-Struktur

Alle drei Web-Apps (display, host, player) folgen demselben Muster:

```
src/
  App.tsx                          Hauptkomponente
  main.tsx                         Einstiegspunkt
  storage.ts                       Session-Persistenz in localStorage
  styles.css                       Globale Styles
  hooks/
    useXxxSession.ts               Session-State und Event-Handler
  lib/
    helpers.ts                     Helferfunktionen
    labels.ts (wo vorhanden)       Anzeige-Labels
  components/                      React-Komponenten
```

### Session-Flow

1. `App.tsx` nutzt `useWebSocket()` aus `@quiz/shared-hooks`
2. Uebergibt `{ sendEvent, onMessage, notifyConnected }` an den jeweiligen `useXxxSession`-Hook
3. Der Hook verwaltet gesamten Session-State, verarbeitet eingehende Events und stellt Handler bereit
4. Session-Daten werden in localStorage persistiert (`storage.ts`) fuer Resume nach Reconnect

### WebSocket-Verbindung

- Abendbetrieb: `VITE_SERVER_SOCKET_URL=wss://api.quiz.disaai.de`
- Manuelle Entwicklung: Vite-Proxy leitet `/ws` an `ws://localhost:3001` weiter, falls keine `VITE_SERVER_SOCKET_URL` gesetzt ist
- Auto-Reconnect mit exponentiellem Backoff (`getReconnectDelay`)

### Env-Variablen

| Variable | Verbraucher | Abendwert | Beschreibung |
|---|---|---|---|
| `PORT` | Server | `3001` | Server-Port |
| `HOST` | Server | `0.0.0.0` | Server-Bind-Adresse |
| `VITE_SERVER_SOCKET_URL` | shared-hooks | `wss://api.quiz.disaai.de` | WebSocket-URL |
| `VITE_DISPLAY_URL` | Host | `https://tv.quiz.disaai.de` | Display-URL fuer Popout-Link |
| `VITE_PLAYER_JOIN_BASE_URL` | Host, Display | `https://play.quiz.disaai.de` | Basis-URL fuer Player-Join/QR |
| `VITE_HOST_URL` | quiz.sh (nicht im TS-Code) | `https://host.quiz.disaai.de` | Host-URL fuer Dashboard/Browserstart |
| `ALLOWED_ORIGINS` | Server | localhost-Zielports + Domain-Origins | CORS/WebSocket-Origin-Whitelist, kommagetrennt |

Fallback-Chain fuer Player-URLs (Host + Display): `VITE_PLAYER_JOIN_BASE_URL` → `VITE_PUBLIC_HOST` + `VITE_PLAYER_PORT` → Loopback + Default-Port → Subdomain-Rewrite. Im Abendbetrieb muss `VITE_PLAYER_JOIN_BASE_URL=https://play.quiz.disaai.de` gesetzt sein.

## Codekonventionen

- **TypeScript-Imports** nutzen `.js` Extensions: `from "./config.js"` (ECMAScript-Module mit `moduleResolution: "bundler"`)
- **Zod-Schemas** sind `.strict()` — unerwartete Felder fuehren zu Validierungsfehlern
- **Discriminated Unions** fuer Fragetypen (`type`-Feld) und Antworten
- **Enums** (nicht Union-Types) fuer States: `RoomState`, `GameState`, `PlayerState`, `QuestionType`
- **`useEffectEvent`** in React-Hooks statt `useCallback` fuer Handler die auf aktuellen State zugreifen muessen
- **Kein React Router** — Navigation erfolgt ueber Screen-State-Maschine in den Session-Hooks
- **Join-Codes**: 6-stellig, Alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (ohne I, O, 0, 1)
- **QR-Codes** in Display und Host (Library: `qrcode`)
- **UI-Sprache**: Deutsch

## Quiz-Daten

Fragenkatalog als 11 kategorisierte JSON-Dateien in `data/quiz/questions/cat-*.json` (430 Fragen), geladen von `apps/server/src/quiz-data.ts`.

Fragetypen: `multiple_choice`, `estimate`, `majority_guess`, `ranking`, `logic`, `open_text`. Die JSON-Rohdaten nutzen zusaetzliche Typ-Labels (`standard`, `common_mistake`, `pattern`, `fast_guess`, `estimate_duel`), die beim Laden in `quiz-data.ts` auf die 6 kanonischen Typen normalisiert werden.

GamePlan-Presets: `quick_dirty`, `normal_evening`, `full_evening`, `chaos_party`.

Scoreboard erscheint nur nach jeder 5. echten Frage (nicht nach Demo, nicht nach jeder Runde).

## Ziel-Subdomains

- `tv.quiz.disaai.de` → Display/TV-UI
- `host.quiz.disaai.de` → Host-Controller-UI
- `play.quiz.disaai.de` → Player-UI
- `api.quiz.disaai.de` → WebSocket/API-Backend

`disaai.de`, `www.disaai.de` und bestehende Disa-AI-Deployments duerfen nicht angefasst werden.

## Arbeitsregeln fuer Agenten

- Erst lesen, dann aendern.
- Vor Datei-Edits Repo-Stand, betroffene Dateien und vorhandene Doku pruefen.
- Keine Features ohne ausdruecklichen Auftrag.
- Keine UI-Redesigns ohne ausdruecklichen Auftrag.
- Keine Fragenkatalog-Aenderungen ohne ausdruecklichen Auftrag.
- Keine Spielmechanik-Aenderungen ohne ausdruecklichen Auftrag.
- Keine Durable Objects, Datenbank, Persistenz, Accounts oder Adminsysteme einfuehren.
- Keine Secrets, Tokens, Zertifikate oder Credential-Dateien ins Repo schreiben.
- Keine DNS- oder Cloudflare-Konfigurationsaktionen ohne explizites `[CONFIRM]` des Nutzers.
- Keine produktiven Deployments veraendern, ausser der Nutzer gibt dafuer explizit frei.
- Lokale Zielservices und Tunnel muessen beide stabil sein; der sichtbare Abendbetrieb laeuft ueber die Subdomains.
- Kleine, direkte Aenderungen bevorzugen. Neue Abstraktionen nur, wenn sie aktuelle Doppelung oder aktuelle Komplexitaet klar reduzieren.

## Erlaubte Aenderungen

- Dokumentation aktualisieren oder strukturieren.
- Veraltete Aussagen zu Services, Ports, Workflows und Tunnelbetrieb korrigieren.
- `AGENTS.md`, `CLAUDE.md`, `WORKFLOW.md`, `README.md` und relevante `docs/*` konsistent halten.
- GitHub-Actions-Workflows fuer Install, Typecheck, Test und Build vereinheitlichen.
- `.env*.example` Dateien pruefen und dokumentieren.
- Deploy-/Tunnel-Doku und Beispielkonfigurationen ergaenzen.
- Kleine Config-Korrekturen nur dann, wenn sie direkt zur Dokumentations- oder Workflow-Kohaerenz gehoeren.

## Verbotene Aenderungen

- Neue Spiel-Features bauen.
- UI redesignen.
- Fragenkatalog oder Fragetexte aendern.
- Spielmechanik, Scoring oder Fragetypen ohne Auftrag aendern.
- Durable Objects, neue Datenbanken oder Persistenz einfuehren.
- Accounts, Profile, Adminsysteme oder globale Highscores bauen.
- Cloudflare-Tunnel erstellen, routen oder DNS aendern, wenn der Nutzer das nicht ausdruecklich verlangt.
- DNS-Eintraege aendern, loeschen oder ueberschreiben.
- Secrets oder echte Cloudflare-Credentials committen.
- `disaai.de`, `www.disaai.de` oder bestehende Disa-AI-Deployments anfassen.

## Cloudflare, DNS und Secrets

- Cloudflare Tunnel ist die Verbindung von festen Subdomains zu lokalen Diensten im Abendbetrieb.
- `quiz.sh` startet den bestehenden Tunnel automatisch; Tunnel-Erstellung, Routing und DNS bleiben manuelle Cloudflare-Arbeit.
- Beispielkonfiguration: `deploy/cloudflare-tunnel.example.yml`.
- Dokumentation: `docs/DEPLOYMENT-CLOUDFLARE-TUNNEL.md`.
- Erlaubte reine Checks ohne `[CONFIRM]`: lokale Dateien lesen, Doku pruefen, `cloudflared --version`, `cloudflared tunnel list`.
- Nicht erlaubt ohne `[CONFIRM]`: Tunnel erstellen, Tunnel routen, DNS aendern, Secrets setzen, Deployments starten.
- Niemals committen: `.cloudflared/`, Zertifikate, private Keys, Credential-JSON, Tokens, echte Secrets.

## Git-Status

- Vor Aenderungen `git status --short` pruefen.
- Nutzer- oder Fremdaenderungen nicht zuruecksetzen.
- Unrelated dirty files ignorieren.
- Wenn eigene Aenderungen mit bestehenden fremden Aenderungen kollidieren, erst verstehen und dann vorsichtig integrieren.

## Definition of Done

- Dokumentation und Code widersprechen sich nicht.
- Aktuelle Services, Ports und Subdomains sind korrekt beschrieben.
- Keine neue Feature-Flaeche wurde ohne Auftrag geoeffnet.
- Server bleibt authoritative.
- Keine Secrets oder produktiven Cloudflare-/DNS-Aenderungen wurden erzeugt.
- `corepack pnpm typecheck`, `corepack pnpm test` und `corepack pnpm build` laufen oder Abweichungen sind klar dokumentiert.
- Fuer Runtime-relevante Aenderungen ist der Flow mindestens per Smoke-Test oder begruendeter manueller Pruefung abgedeckt.

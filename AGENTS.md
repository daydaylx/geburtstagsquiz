# AGENTS.md

## Projekt

Privates browserbasiertes Geburtstagsquiz fuer einen einzelnen Abend.

Das Repo ist kein Produkt, keine Plattform und kein langfristiges SaaS-System. Ziel ist ein stabiler lokaler Ablauf mit getrenntem Display/TV, Host-Controller, Player-UI und WebSocket/API-Backend.

Jede Aenderung muss gegen diese Frage bestehen: Hilft sie, den Quiz-Abend verlaesslich durchzufuehren?

## Architektur

- `apps/server`: Node.js WebSocket/API-Backend, autoritative Spielwahrheit fuer Raum, Timer, Antworten, Punkte und Rangliste.
- `apps/web-display`: Display/TV-UI fuer Publikum, Lobby, QR-Codes, Fragen, Reveal und Scoreboard.
- `apps/web-host`: Host-Controller-UI fuer Spielleitung, Start, Einstellungen, Fortschritt und manuelle Fallbacks.
- `apps/web-player`: Player-UI fuer Smartphones, Join, Antwort-Controller, Antwortstatus und Bereitschaft fuer die naechste Frage.

Shared Packages:

- `packages/shared-types`: gemeinsame Typen und Enums.
- `packages/shared-protocol`: Eventnamen, Zod-Schemas und Envelope-Parsing.
- `packages/shared-utils`: kleine gemeinsame Helfer.
- `packages/quiz-engine`: reine Auswertungs- und Scoreboard-Logik.

Der Server ist authoritative. Display, Host und Player zeigen Zustand an oder senden Absichten, entscheiden aber keine Spielwahrheiten.

## Lokale Ports

- Server/API: `3001`
- Host: `5173`
- Player: `5174`
- Display/TV: `5175`

Vite-Proxies leiten `/ws` und `/api` lokal an `localhost:3001` weiter. Fuer Domain-/Tunnelbetrieb kann `VITE_SERVER_SOCKET_URL` gesetzt werden.

## Ziel-Subdomains

- `tv.quiz.disaai.de` -> Display/TV-UI
- `host.quiz.disaai.de` -> Host-Controller-UI
- `play.quiz.disaai.de` -> Player-UI
- `api.quiz.disaai.de` -> WebSocket/API-Backend

`disaai.de` und `www.disaai.de` duerfen nicht veraendert werden. Bestehende Disa-AI-Deployments duerfen nicht angefasst werden. Arbeiten an Domains beziehen sich ausschliesslich auf Subdomains unter `quiz.disaai.de`.

## Arbeitsregeln fuer Agenten

- Erst lesen, dann aendern.
- Vor Datei-Edits Repo-Stand, betroffene Dateien und vorhandene Doku pruefen.
- Keine Features ohne ausdruecklichen Auftrag.
- Keine UI-Redesigns ohne ausdruecklichen Auftrag.
- Keine Fragenkatalog-Aenderungen ohne ausdruecklichen Auftrag.
- Keine Spielmechanik-Aenderungen ohne ausdruecklichen Auftrag.
- Keine Durable Objects, Datenbank, Persistenz, Accounts oder Adminsysteme einfuehren.
- Keine Secrets, Tokens, Zertifikate oder Credential-Dateien ins Repo schreiben.
- Keine echten DNS- oder Cloudflare-Aktionen ohne explizites `[CONFIRM]` des Nutzers.
- Keine produktiven Deployments veraendern, ausser der Nutzer gibt dafuer explizit frei.
- Lokale Stabilitaet hat Vorrang vor Tunnel-/Domain-Themen.
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
- Cloudflare-Tunnel erstellen oder starten, wenn der Nutzer das nicht ausdruecklich verlangt.
- DNS-Eintraege aendern, loeschen oder ueberschreiben.
- Secrets oder echte Cloudflare-Credentials committen.
- `disaai.de`, `www.disaai.de` oder bestehende Disa-AI-Deployments anfassen.

## Setup

Voraussetzungen:

- Node.js `>=20`
- pnpm ueber Corepack, Repo-Package-Manager aktuell `pnpm@10.33.1`

Installation:

```bash
corepack pnpm install --frozen-lockfile
```

Lokale Entwicklung:

```bash
corepack pnpm dev
```

Standard-URLs:

- Display/TV: `http://localhost:5175`
- Host: `http://localhost:5173`
- Player: `http://localhost:5174`
- Server Health: `http://localhost:3001/health`
- WebSocket: `ws://localhost:3001`

Abend-/Hotspot-Start:

```bash
./quiz.sh
```

Im Menue "Lokal" oder "Tunnel" waehlen. Ctrl+C stoppt alle Dienste sauber.

Lokaler Protokoll-Smoke-Test bei laufendem Server:

```bash
corepack pnpm run smoke:local
```

Fragenreview-Tool:

```bash
corepack pnpm run review:questions
```

## Validierung

Vor Abschluss einer Aenderung nach Moeglichkeit ausfuehren:

```bash
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

Wenn lokale Dienste laufen und die Aenderung Runtime-/Workflow-relevant ist:

```bash
corepack pnpm run smoke:local
```

Tests liegen vor allem in `packages/*/src/**/*.test.ts` und serverseitigen Tests. Es gibt keine vollstaendige E2E-Browser-Testabdeckung.

## Protokoll- und Codekonventionen

- WebSocket-Nachrichten nutzen `{ "event": "...", "payload": ... }`.
- Eventnamen stehen in `packages/shared-protocol/src/events.ts`.
- Payload-Schemas stehen in `packages/shared-protocol/src/schemas.ts` und sind strikt.
- Beim Aendern eines Events: Eventkonstante, Schema, Richtungsmap und Payload-Typ konsistent halten.
- Lokale TypeScript-Imports nutzen `.js` Extensions, z. B. `from "./config.js"`.
- Keine ad-hoc String-Protokolle bauen, wenn Shared-Protocol-Schemas existieren.
- Keine Client-Logik zur Spielwahrheit machen.

## Cloudflare, DNS und Secrets

- Cloudflare Tunnel ist nur eine optionale Verbindung von festen Subdomains zu lokalen Diensten.
- Lokale Tests muessen vor Tunnel-/Domainarbeit stabil sein.
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
- Fuer Runtime-relevante Aenderungen ist der lokale Flow mindestens per Smoke-Test oder begruendeter manueller Pruefung abgedeckt.

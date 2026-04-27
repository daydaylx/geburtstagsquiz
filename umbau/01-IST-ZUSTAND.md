# 01 - Ist-Zustand

## Kurzbild

Das Repo ist aktuell ein 2-UI-System:

- `apps/web-host`: Hostscreen, TV-Anzeige, QR/Lobby, Steuerung, Frage, Reveal, Scoreboard.
- `apps/web-player`: Handy-UI fuer Join, Antwort, Ergebnis, Ready.
- `apps/server`: Node/WebSocket-Server mit In-Memory-Raeumen.

Das Konzept fordert ein 3-UI-System. Diese Trennung ist keine reine UI-Arbeit, weil Rollen, Sessions, Protokoll und Broadcasts betroffen sind.

## Aktuelle Architektur

- Monorepo mit pnpm und Workspaces fuer `apps/*` und `packages/*`.
- Shared-Pakete:
  - `packages/shared-types`: Enums, Fragen, Player, Room, Scoreboard.
  - `packages/shared-protocol`: Events, zod-Schemas, Envelope-Parsing.
  - `packages/shared-utils`: Join-Code, Namen, Reconnect/Netzwerk.
  - `packages/quiz-engine`: Auswertung fuer MC, Logic, Estimate, Majority, Ranking, OpenText.
- Serverzustand lebt in Maps in `apps/server/src/state.ts`.
- Server-Flow liegt vor allem in `room.ts`, `lobby.ts`, `game.ts`, `connection.ts`, `session.ts`.

## Host und Player

Aktuelle Rollen:

```ts
CLIENT_ROLES = ["host", "player"]
```

Eine `display`-Rolle gibt es noch nicht. Der Host bekommt aktuell die volle Frage per `question:show`; Player bekommen reduzierte Controller-Daten per `question:controller`.

## Wo Host-UI TV-Anzeige und Steuerung vermischt

`apps/web-host/src/App.tsx` ist die groesste UI-Datei und enthaelt gleichzeitig:

- Raum erstellen und Host-Session speichern.
- Join-Code, Player-Link und QR.
- Grosse Lobby-/Stage-Anzeige fuer TV.
- Frage mit Antwortoptionen, Timer und Fortschritt.
- Reveal mit richtiger Antwort, Erklaerung und Rundenergebnis.
- Scoreboard und Endstand.
- Controller-Aktionen wie `game:start`, `game:next-question`, `room:settings:update`.
- Spielerstatus und Einstellungen.

Das ist fuer den jetzigen Betrieb brauchbar, verhindert aber eine klare TV/Controller-Trennung.

## Sessions und Reconnect

- Host-Session wird in `apps/web-host/src/storage.ts` unter `quiz:host-session:v1` gespeichert.
- Player-Session wird in `apps/web-player/src/storage.ts` unter `quiz:player-session:v1` gespeichert.
- `connection:resume` nutzt `sessionId` und `roomId`.
- `attachSocketToSession` in `apps/server/src/room.ts` schliesst eine vorherige Socket-Verbindung derselben Session.
- Host hat `5min` Grace-Zeit, Player `30s`.
- `syncSessionToRoomState` in `apps/server/src/connection.ts` replayt Lobby, Frage, Timer, Reveal, Scoreboard oder Endstand.

Risiko fuer den Umbau: Wenn Display und Host dieselbe Session oder denselben Resume-Pfad teilen, kann ein Geraet das andere verdraengen.

## Broadcasts

`broadcastToRoom` sendet aktuell an Host und alle Player. Es gibt keine Zielgruppe Display. Einzelne Sonderfaelle:

- `sendQuestionToRoom` sendet Host `question:show`, Player `question:controller`.
- `answer:progress` geht aktuell nur gezielt an den Host.
- `lobby:update`, Timer, Reveal, Scoreboard und Finished gehen ueber Broadcast an Host und Player.

Fuer Display braucht es explizite Zielgruppenfunktionen statt "alle ausser X".

## Fragenkatalog und Shuffle

Der aktuelle Code ist weiter als das Konzept annimmt:

- `Question` enthaelt bereits `explanation?: string`.
- `QuestionType.OpenText` existiert.
- `question:reveal` transportiert bereits optional `explanation`.
- `quiz-data.ts` laedt zwei JSON-Dateien und dedupliziert per Frage-ID.
- Aktueller Katalog: 520 Fragen, 518 mit Erklaerung.
- `getEveningQuestions` waehlt 30 Fragen, setzt `QUESTION_DURATION_MS`, mutiert das Original nicht und hat Tests.

Offene Kritik: Die aktuelle Verteilung ist proportional zum Katalog. Dadurch dominiert Multiple Choice stark. Fuer einen abwechslungsreichen Abend kann eine bewusstere Verteilung besser sein als reine Proportionalitaet.

## URL-/Env-Logik

Aktuell:

- Host/Player bauen WebSocket-URLs aus `window.location`, `VITE_PUBLIC_HOST`, `VITE_SERVER_PORT`.
- Host baut Player-Link ueber `VITE_PLAYER_PORT`.
- Lokale Vite-Ports: Host `5173`, Player `5174`.
- Startskripte setzen `VITE_PUBLIC_HOST`, `VITE_SERVER_PORT`, `VITE_PLAYER_PORT`.

Problem fuer Domainbetrieb: Bei `play.domain` darf der Client nicht `localhost` oder einen geratenen Port verwenden. Ziel ist eine explizite Socket-URL.

## Tests

Aktuell entdeckt Vitest:

- `packages/*/src/**/*.test.ts`
- `apps/server/src/**/*.test.ts`

Vorhanden sind Tests fuer:

- Quiz-Engine-Auswertung.
- Protokollschemas.
- Antwortvalidierung.
- `getAnswerProgress`, `getEveningQuestions`, `getDefaultQuiz`.

Es fehlen noch echte Serverrollen-/Autorisierungstests fuer `display`, weil diese Rolle noch nicht existiert.

## Betroffene Dateien fuer spaetere Umsetzung

- `packages/shared-types/src/common.ts`
- `packages/shared-types/src/room.ts`
- `packages/shared-protocol/src/events.ts`
- `packages/shared-protocol/src/schemas.ts`
- `apps/server/src/server-types.ts`
- `apps/server/src/room.ts`
- `apps/server/src/lobby.ts`
- `apps/server/src/connection.ts`
- `apps/server/src/session.ts`
- `apps/server/src/game.ts`
- `apps/server/src/question-payloads.ts`
- `apps/web-host/src/App.tsx`
- `apps/web-host/src/storage.ts`
- `apps/web-player/src/App.tsx`
- neue App: `apps/web-display`

## Aktuelle Schwaechen

- Host-UI ist gleichzeitig TV-Buehne und Controller.
- Display-Rolle fehlt.
- Broadcasts sind nicht sauber nach Publikum getrennt.
- Domain-/Socket-URL-Regeln sind zu portbasiert fuer Subdomains.
- Reconnect ist pragmatisch, aber `syncSessionToRoomState` ist eine grosse Risiko-Stelle.
- Start-/Stop-Skripte kennen keine Display-App.


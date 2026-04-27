# 09 - Agent-Prompts

## Grundregel fuer alle Folgeprompts

Jeder Prompt soll klein bleiben:

- Erst analysieren.
- Konkreten Plan zeigen.
- Auf mein Go warten.
- Dann nur diese Phase umsetzen.
- Nach Codeaenderungen `pnpm typecheck`, `pnpm test`, `pnpm build`.

## Prompt Phase 2 - Serverrollen/Protokoll

```text
Du arbeitest im Repo geburtstagsquiz.

Ziel:
Fuehre serverseitig und im Shared-Protokoll die Rolle `display` ein.

Grenzen:
- Erst analysieren.
- Plan zeigen.
- Auf mein Go warten.
- Keine UI-App bauen.
- Keine Domain-/Cloudflare-Aenderungen.
- Keine neuen Dependencies.

Pruefe:
- packages/shared-types/src/common.ts
- packages/shared-types/src/room.ts
- packages/shared-protocol/src/events.ts
- packages/shared-protocol/src/schemas.ts
- apps/server/src/server-types.ts
- apps/server/src/room.ts
- apps/server/src/lobby.ts
- apps/server/src/connection.ts
- apps/server/src/session.ts
- apps/server/src/game.ts
- vorhandene Tests

Umsetzung nach Go:
- `display` als Rolle ergaenzen.
- `display:connect`, `display:connected`, `display:disconnected` planen/umsetzen.
- Display-Token und Display-Session ergaenzen.
- Broadcasts nach Host/Display/Player trennen.
- Display read-only serverseitig erzwingen.
- Tests ergaenzen.

Pflicht am Ende:
pnpm typecheck
pnpm test
pnpm build
```

## Prompt Phase 3 - Display-App

```text
Du arbeitest im Repo geburtstagsquiz.

Ziel:
Baue eine minimale neue `apps/web-display` App fuer TV/Beamer.

Grenzen:
- Erst analysieren.
- Plan zeigen.
- Auf mein Go warten.
- Keine Host-Controller-Refactors.
- Keine Player-Refactors.
- Keine neuen Dependencies.
- Display ist read-only.

Pruefe:
- apps/web-host und apps/web-player als technische Vorlagen
- shared-protocol Display-Events
- aktuelle Socket-/Reconnect-Patterns

Umsetzung nach Go:
- Vite/React-App analog bestehender Apps anlegen.
- Display-Session speichern.
- `displayToken` aus Query lesen.
- `display:connect` und Resume nutzen.
- Lobby, Question, Reveal, Scoreboard, Finished anzeigen.
- Keine Steuerbuttons.

Pflicht am Ende:
pnpm typecheck
pnpm test
pnpm build
```

## Prompt Phase 4 - Host Controller

```text
Du arbeitest im Repo geburtstagsquiz.

Ziel:
Baue `apps/web-host` von Host+TV-Anzeige zu einer mobilen Host-Controller-UI um.

Grenzen:
- Erst analysieren.
- Plan zeigen.
- Auf mein Go warten.
- Display-App nicht umbauen, ausser ein Protokollfehler blockiert.
- Player-App nicht umbauen.
- Keine neuen Dependencies.

Pruefe:
- apps/web-host/src/App.tsx
- apps/web-host/src/styles.css
- apps/web-host/src/storage.ts
- Display-Link/Player-Link-Logik

Umsetzung nach Go:
- Host zeigt Player-Link/QR und Display-Link.
- Host zeigt Display-Verbindungsstatus.
- Host steuert Start, Settings, Next, Close.
- Grosse TV-Stage entfernen oder stark kompakt machen.
- Mobile Bedienung priorisieren.

Pflicht am Ende:
pnpm typecheck
pnpm test
pnpm build
```

## Prompt Phase 5 - Player-Anpassungen

```text
Du arbeitest im Repo geburtstagsquiz.

Ziel:
Passe die Player-App minimal an die neue Display-Architektur an.

Grenzen:
- Erst analysieren.
- Plan zeigen.
- Auf mein Go warten.
- Keine neuen Funktionen.
- Keine Host-/Display-Rechte.
- Keine neuen Dependencies.

Pruefe:
- apps/web-player/src/App.tsx
- apps/web-player/src/styles.css
- Player-Reconnect und Reveal

Umsetzung nach Go:
- Wording auf Display statt Hostscreen anpassen.
- Antwort gespeichert / Reveal / Ready auf echten Handyflow pruefen.
- Nur kleine UX-Korrekturen.

Pflicht am Ende:
pnpm typecheck
pnpm test
pnpm build
```

## Prompt Phase 6 - Fragen/Shuffle/Explanation

```text
Du arbeitest im Repo geburtstagsquiz.

Ziel:
Verbessere Fragenmix, Shuffle und Erklaerungsqualitaet ohne Fragen-Massenproduktion.

Grenzen:
- Erst analysieren.
- Plan zeigen.
- Auf mein Go warten.
- Keine neuen Spielmodi.
- Kein Editor.
- Keine grossen JSON-Aenderungen ohne Review.

Pruefe:
- apps/server/src/game.ts
- apps/server/src/game.test.ts
- apps/server/src/quiz-data.ts
- tools/question-review
- aktuelle Frageverteilung

Umsetzung nach Go:
- Nur falls gewuenscht: explizite Zielverteilung fuer getEveningQuestions.
- Tests fuer Verteilung, Fallback, keine Duplikate, keine Mutation.
- Fehlende Erklaerungen identifizieren.

Pflicht am Ende:
pnpm typecheck
pnpm test
pnpm build
```

## Prompt Phase 7 - Domain/Cloudflare

```text
Du arbeitest im Repo geburtstagsquiz.

Ziel:
Bereite den Betrieb ueber tv/host/play/api Subdomains vor.

Grenzen:
- Erst analysieren.
- Plan zeigen.
- Auf mein Go warten.
- Keine Durable Objects.
- Keine Node-Server-Neuarchitektur.
- Keine neuen Dependencies.

Pruefe:
- URL-/Env-Logik in web-host, web-display, web-player
- start_local_game_host.sh
- stop_local_game_host.sh
- README/docs

Umsetzung nach Go:
- `VITE_SERVER_SOCKET_URL` als primaere Socket-URL.
- `VITE_DISPLAY_URL`, `VITE_HOST_URL`, `VITE_PLAYER_JOIN_BASE_URL`.
- Startskript um Display-Port und Env erweitern.
- Cloudflare Tunnel Variante dokumentieren.

Pflicht am Ende:
pnpm typecheck
pnpm test
pnpm build
```

## Prompt Phase 8 - End-to-End-Test

```text
Du arbeitest im Repo geburtstagsquiz.

Ziel:
Fuehre einen End-to-End-Testplan fuer Host, Display und mindestens 2 Player aus bzw. bereite ihn konkret vor.

Grenzen:
- Erst analysieren.
- Plan zeigen.
- Auf mein Go warten.
- Keine Feature-Arbeit.
- Nur Bugfixes, wenn ein Test blockiert und ich Go gebe.

Pruefe:
- Startkommandos
- lokale URLs oder Domain-URLs
- Reconnect-Verhalten
- QR-Links
- alle Fragetypen

Ergebnis:
- Testprotokoll mit bestanden/fehlgeschlagen.
- Liste echter Blocker.
- Keine neuen Features empfehlen, bevor Blocker geloest sind.
```


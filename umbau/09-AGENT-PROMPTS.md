# 09 - Agent-Prompts

## Grundregel fuer alle Folgeprompts

Jeder Prompt soll klein bleiben:

- Erst analysieren.
- Konkreten Plan zeigen.
- Auf mein Go warten.
- Dann nur diese Phase umsetzen.
- Nach Codeaenderungen `pnpm typecheck`, `pnpm test`, `pnpm build`.

## Unveraenderliche Grundsaetze (in jeden Prompt einhalten)

Jeder Agent muss folgendes wissen:

```text
- Das System ist Display-first. Das TV/Display initialisiert den Raum.
- Der Host koppelt sich per hostToken, erstellt KEINEN Raum.
- TV zeigt Player-QR und Host-QR. Spieler scannen Player-QR. Host scannt Host-QR.
- Display bleibt nach Rauminitialisierung read-only.
- Host und Display duerfen sich nie gegenseitig aus der Session werfen.
- hostToken (Pairing) ist nicht identisch mit hostSessionId (Reconnect).
- displayToken (Reconnect) ist nicht fuer Host-Steuerung verwendbar.
- joinCode ist nicht fuer Host- oder Display-Rechte verwendbar.
- Keine Codeaenderungen ohne Plan und Go.
```

## Prompt Phase 2 - Serverrollen/Protokoll (Display-first + Host-Pairing)

```text
Du arbeitest im Repo geburtstagsquiz.

Ziel:
Fuehre serverseitig und im Shared-Protokoll die Rolle `display` ein.
Das System ist Display-first: das TV erstellt den Raum, der Host koppelt sich per hostToken.

Wichtige Architekturentscheidung:
- display:create-room (Display -> Server) erstellt den Raum.
- display:room-created (Server -> Display) liefert: joinCode, hostToken, displayToken, displaySessionId.
- host:connect (Host -> Server) koppelt den Host per hostToken.
- host:connected (Server -> Host) liefert: hostSessionId fuer Reconnect.
- display:host-paired (Server -> Display) signalisiert erfolgreiche Host-Kopplung.
- hostToken ist ein einmaliger Pairing-Token (nicht identisch mit hostSessionId).
- displayToken ist fuer Display-Reconnect (nicht fuer Host-Steuerung).
- joinCode ist nur fuer Player-Join.

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
- umbau/02-ZIELARCHITEKTUR.md (Referenz fuer Zielzustand)
- umbau/03-PROTOKOLL-UND-SERVERPLAN.md (Referenz fuer Events und Payloads)

Umsetzung nach Go:
- `display` als Rolle ergaenzen.
- `display:create-room`, `display:room-created` implementieren.
- `host:connect`, `host:connected`, `display:host-paired` implementieren.
- hostToken als einmaligen Pairing-Token mit used-Flag implementieren.
- Display-Token und Display-Session ergaenzen.
- Broadcasts nach Host/Display/Player trennen.
- Display read-only serverseitig erzwingen.
- Host-Aktionen nur fuer Host-Session erlauben.
- Tests ergaenzen (Schema, Autorisierung, Reconnect).

Pflicht am Ende:
pnpm typecheck
pnpm test
pnpm build
```

## Prompt Phase 3 - Display-App (Setup-Screen + 2 QR-Codes)

```text
Du arbeitest im Repo geburtstagsquiz.

Ziel:
Baue eine minimale neue `apps/web-display` App fuer TV/Beamer.

Das System ist Display-first:
- TV oeffnet tv.<domain> ohne Parameter.
- Display zeigt Button "Quizraum erstellen".
- Nach Klick wird display:create-room an den Server gesendet.
- Server antwortet mit display:room-created (joinCode, hostToken, displayToken).
- Display zeigt Player-QR und Host-QR.
- Nach display:host-paired Event: Host-QR ausblenden.
- Display bleibt danach reine Anzeige (read-only).

Grenzen:
- Erst analysieren.
- Plan zeigen.
- Auf mein Go warten.
- Keine Host-Controller-Refactors.
- Keine Player-Refactors.
- Keine neuen Dependencies.
- Display ist nach Rauminitialisierung read-only.
- Keine Steuerbuttons.

Pruefe:
- apps/web-host und apps/web-player als technische Vorlagen.
- shared-protocol Display-Events (display:create-room, display:room-created, display:host-paired).
- aktuelle Socket-/Reconnect-Patterns.
- umbau/04-UI-UMBAUPLAN.md (Referenz fuer Display-Screens).
- VITE_PLAYER_JOIN_BASE_URL und VITE_HOST_URL fuer QR-Bau.

Umsetzung nach Go:
- Vite/React-App analog bestehender Apps anlegen.
- Display-Storage anlegen (roomId, displaySessionId, displayToken).
- Setup-Screen: Button, der display:create-room sendet.
- display:room-created verarbeiten: Tokens speichern, QR-Codes generieren.
- Player-QR aus VITE_PLAYER_JOIN_BASE_URL + ?joinCode= generieren.
- Host-QR aus VITE_HOST_URL + ?hostToken= generieren.
- Beide QR-Codes in Lobby anzeigen.
- Nach display:host-paired: Host-QR ausblenden.
- connection:resume fuer Reconnect nutzen.
- Lobby, Question, Reveal, Scoreboard, Finished bauen.
- Keine Steuerbuttons.

Pflicht am Ende:
pnpm typecheck
pnpm test
pnpm build
```

## Prompt Phase 4 - Host Controller (koppelt per hostToken)

```text
Du arbeitest im Repo geburtstagsquiz.

Ziel:
Baue `apps/web-host` von Host+TV-Anzeige zu einer mobilen Host-Controller-UI um.

Das System ist Display-first:
- Host erstellt KEINEN Raum mehr. Das macht das Display.
- Host liest hostToken aus URL-Query (?hostToken=YYY).
- Host sendet host:connect mit hostToken.
- Server antwortet mit host:connected und hostSessionId.
- Host speichert hostSessionId fuer Reconnect.
- Reconnect: connection:resume mit hostSessionId und roomId.

Grenzen:
- Erst analysieren.
- Plan zeigen.
- Auf mein Go warten.
- Display-App nicht umbauen, ausser ein Protokollfehler blockiert.
- Player-App nicht umbauen.
- Keine neuen Dependencies.
- Raum-erstellen-Flow entfernen.

Pruefe:
- apps/web-host/src/App.tsx
- apps/web-host/src/styles.css
- apps/web-host/src/storage.ts
- URL-Query-Parsing fuer hostToken
- umbau/04-UI-UMBAUPLAN.md (Referenz fuer Host-Screens)
- umbau/03-PROTOKOLL-UND-SERVERPLAN.md (Referenz fuer host:connect / host:connected)

Umsetzung nach Go:
- Raum-erstellen-Flow entfernen.
- hostToken aus Query lesen.
- host:connect senden, host:connected verarbeiten.
- hostSessionId und roomId speichern.
- Reconnect per connection:resume implementieren.
- Grosse TV-Stage entfernen oder stark kompakt machen.
- Mobile Controller-Screens bauen.
- Display-Verbindungsstatus anzeigen.
- Steueraktionen klar platzieren.

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
- Wording auf Display/TV statt Hostscreen anpassen.
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

Das System ist Display-first:
- tv.<domain> oeffnet Display-Setup ohne Parameter.
- host.<domain>?hostToken=YYY ist der Link aus dem Host-QR.
- play.<domain>?joinCode=XXX ist der Link aus dem Player-QR.
- VITE_HOST_URL und VITE_PLAYER_JOIN_BASE_URL werden in der Display-App fuer QR-Bau genutzt.

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
- umbau/06-DEPLOYMENT-DOMAIN-CLOUDFLARE.md

Umsetzung nach Go:
- VITE_SERVER_SOCKET_URL als primaere Socket-URL.
- VITE_DISPLAY_URL, VITE_HOST_URL, VITE_PLAYER_JOIN_BASE_URL setzen.
- Display-App baut QR-Codes aus VITE_HOST_URL und VITE_PLAYER_JOIN_BASE_URL.
- Startskript um Display-Port und Env erweitern.
- Cloudflare Tunnel Variante dokumentieren.
- Pruefe: QR-Codes zeigen nie auf localhost.

Pflicht am Ende:
pnpm typecheck
pnpm test
pnpm build
```

## Prompt Phase 8 - End-to-End-Test

```text
Du arbeitest im Repo geburtstagsquiz.

Ziel:
Fuehre einen End-to-End-Testplan fuer Display, Host und mindestens 2 Player aus bzw. bereite ihn konkret vor.

Der korrekte Startablauf ist:
1. TV oeffnet Display-Seite (tv.domain oder localhost:5175).
2. Display klickt "Quizraum erstellen".
3. TV zeigt Player-QR und Host-QR.
4. Host scannt Host-QR mit Handy.
5. Host-QR verschwindet auf TV.
6. Spieler scannen Player-QR.
7. Host startet Spiel.

Grenzen:
- Erst analysieren.
- Plan zeigen.
- Auf mein Go warten.
- Keine Feature-Arbeit.
- Nur Bugfixes, wenn ein Test blockiert und ich Go gebe.

Pruefe:
- Startkommandos
- lokale URLs oder Domain-URLs
- Reconnect-Verhalten (Host, Display, Player)
- QR-Links (Player-QR und Host-QR)
- alle Fragetypen
- gegenseitige Session-Verdraengung

Ergebnis:
- Testprotokoll mit bestanden/fehlgeschlagen.
- Liste echter Blocker.
- Keine neuen Features empfehlen, bevor Blocker geloest sind.
```

# 08 - Phasenplan

## Phase 1 - Architektur/Doku

Ziel:

- Bestehenden Umbauplan final pruefen.
- Entscheidungen fuer Rollen, Events, URLs und Tests bestaetigen.

Betroffene Dateien:

- Nur `umbau/*` und spaeter relevante `docs/*`, wenn die Umsetzung startet.

Konkrete Schritte:

- Plan lesen.
- Offene Entscheidungen klaeren.
- Scope fuer Phase 2 festlegen.

Risiken:

- Zu viele Features in Phase 2 packen.

Tests:

- Keine Code-Tests.

Abnahmekriterien:

- Nutzer gibt Go fuer Serverrollen/Protokoll.

## Phase 2 - Serverrollen/Protokoll

Ziel:

- Rolle `display` serverseitig und im Protokoll einfuehren.
- Display-Session mit Token ermoeglichen.
- Rechte sauber trennen.

Betroffene Dateien:

- `packages/shared-types/src/common.ts`
- `packages/shared-types/src/room.ts`
- `packages/shared-protocol/src/events.ts`
- `packages/shared-protocol/src/schemas.ts`
- `apps/server/src/server-types.ts`
- `apps/server/src/room.ts`
- `apps/server/src/lobby.ts` oder neue `display.ts`
- `apps/server/src/connection.ts`
- `apps/server/src/session.ts`
- `apps/server/src/game.ts`
- Tests in `packages/shared-protocol/src/schemas.test.ts` und `apps/server/src/*.test.ts`

Konkrete Schritte:

- `display` in Rollen ergaenzen.
- Display-Events und zod-Schemas ergaenzen.
- `room:created` um `displayToken` erweitern.
- Display-Session im RoomRecord speichern.
- `display:connect` implementieren.
- `resumeSession` und `handleSocketClose` fuer Display erweitern.
- Broadcast-Helfer nach Zielgruppe einfuehren.
- Frage, Timer, Reveal, Scoreboard an Display senden.
- Display fuer Host- und Player-Aktionen serverseitig blocken.

Risiken:

- Display verdraengt Host-Session.
- Bestehender Player-Flow bricht.
- `syncSessionToRoomState` liefert falschen Snapshot.

Tests:

- Schema-Tests fuer neue Events.
- Autorisierungstests fuer Display.
- Reconnect-Tests fuer Host/Display/Player.
- Regression: Player kann joinen, antworten, ready senden.

Abnahmekriterien:

- Display kann sich verbinden und bekommt Zustand.
- Display darf nicht steuern.
- Host und Display koennen gleichzeitig verbunden sein.
- Pflichtkommandos gruen.

## Phase 3 - Display-App

Ziel:

- Neue `apps/web-display` minimal bauen.

Betroffene Dateien:

- `apps/web-display/*`
- `pnpm-workspace.yaml` nur falls noetig, aktuell deckt `apps/*` neue App ab.
- Root- oder Startskripte erst spaeter, wenn lokal noetig.

Konkrete Schritte:

- App-Struktur analog Host/Player anlegen.
- Display-Storage anlegen.
- Socket-Verbindung mit `VITE_SERVER_SOCKET_URL`.
- `displayToken` aus Query lesen.
- `display:connect` und `connection:resume` senden.
- Screens fuer Lobby, Question, Reveal, Scoreboard, Finished bauen.
- Keine Steuerbuttons.

Risiken:

- Display wird visuell zu controllerartig.
- Reconnect-Status unklar.
- TV-Layout nicht lesbar.

Tests:

- `pnpm --filter @quiz/web-display run typecheck`
- `pnpm build`
- Manueller lokaler Display-Connect.

Abnahmekriterien:

- Display zeigt kompletten Ablauf.
- Display sendet keine Steueraktionen.
- TV-taugliche Darstellung.

## Phase 4 - Host-Controller-App

Ziel:

- `apps/web-host` wird Controller statt TV-Buehne.

Betroffene Dateien:

- `apps/web-host/src/App.tsx`
- `apps/web-host/src/styles.css`
- `apps/web-host/src/storage.ts`

Konkrete Schritte:

- Display-Link aus `displayToken` bauen.
- Player-Link aus `VITE_PLAYER_JOIN_BASE_URL` bauen.
- Grosse Stage-Ansichten entfernen oder stark verdichten.
- Mobile Controller-Screens bauen.
- Display-Verbindungsstatus anzeigen.
- Steueraktionen klar platzieren.
- Wording von Hostscreen zu Display anpassen.

Risiken:

- Host verliert wichtige Statusinfos.
- Mobile Bedienung wird unuebersichtlich.
- Zu viel Layoutarbeit in einer Phase.

Tests:

- Host typecheck/build.
- Kompletter lokaler Durchlauf mit Display und Player.

Abnahmekriterien:

- Host steuert komplett.
- Host braucht nicht als TV-Anzeige zu dienen.
- Display bleibt unabhaengig verbunden.

## Phase 5 - Player-Anpassungen

Ziel:

- Player bleibt stabil und erhaelt nur notwendige Anpassungen.

Betroffene Dateien:

- `apps/web-player/src/App.tsx`
- `apps/web-player/src/styles.css` nur falls noetig.

Konkrete Schritte:

- Texte von "Host-Bildschirm" auf "Display" oder "vorne" aendern.
- Reconnect-Hinweise pruefen.
- Antwort gespeichert und Reveal pruefen.
- Keine neuen Rechte oder Funktionen.

Risiken:

- Aus kleiner Textaenderung wird UI-Refactor.

Tests:

- Player typecheck/build.
- Manuell: Join, Antwort, Reveal, Ready.

Abnahmekriterien:

- Player-Flow unveraendert stabil.
- Keine Host-/Display-Aktionen in Player-App.

## Phase 6 - Fragen/Shuffle/Explanation

Ziel:

- Fragenmix und Erklaerungen qualitativ verbessern, ohne Katalog aufzublaehen.

Betroffene Dateien:

- `apps/server/src/game.ts`
- `apps/server/src/game.test.ts`
- ggf. JSON-Fragenquellen nur nach Review.

Konkrete Schritte:

- Zielverteilung bestaetigen.
- `getEveningQuestions` bei Bedarf auf explizite Typquoten umstellen.
- Fehlende Erklaerungen finden.
- Fragen mit Review-Tool pruefen.
- Tests erweitern.

Risiken:

- Neue Verteilung fuehlt sich kuenstlich an.
- Fragenkatalog wird ohne Review schlechter.

Tests:

- `getEveningQuestions` fuer Verteilung, Fallback, keine Mutation, keine Duplikate.
- Reveal-Erklaerung bleibt im Protokoll.

Abnahmekriterien:

- 30 Fragen ohne Duplikate.
- Abwechslungsreicher Mix.
- Tests stabil.

## Phase 7 - Domain/Cloudflare

Ziel:

- System ueber Ziel-Domains erreichbar machen.

Betroffene Dateien:

- Vite-Env-Nutzung in allen Apps.
- `start_local_game_host.sh`
- `stop_local_game_host.sh` falls noetig.
- README/docs fuer Betrieb.

Konkrete Schritte:

- `VITE_SERVER_SOCKET_URL` in allen Apps nutzen.
- URL-Basisvariablen fuer Host/Display/Player nutzen.
- Startskript um Display-Port und Env erweitern.
- Cloudflare Tunnel testen.
- Optional spaeter Pages + Node Backend dokumentieren/umsetzen.

Risiken:

- QR zeigt auf Domain, Client verbindet aber zu localhost.
- WebSocket-Upgrades laufen nicht.
- HTTPS/WSS-Mismatch.

Tests:

- Lokaler Test.
- Tunnel-Test mit echtem Handy.
- WSS-Test.

Abnahmekriterien:

- Host, Display und Player laufen ueber Domain.
- QR funktioniert.
- WebSocket laeuft ueber `wss://api.<domain>`.

## Phase 8 - End-to-End-Test

Ziel:

- Realistischer Abendtest.

Setup:

- 1 Host-Geraet.
- 1 TV/Display-Geraet.
- Mindestens 2 Player-Handys.
- Lokales WLAN oder Domain.

Konkrete Schritte:

- Raum erstellen.
- Display per Link verbinden.
- Player per QR joinen.
- Alle Fragetypen testen.
- Player-Reconnect testen.
- Display-Reconnect testen.
- Host-Reconnect testen.
- Endstand erreichen.

Risiken:

- Mobile Browser Sleep.
- WLAN/Hotspot instabil.
- Display-Token-Link verloren.

Tests:

- Manueller kompletter Durchlauf.
- Pflichtkommandos nach letzten Codeaenderungen.

Abnahmekriterien:

- Kein falsches Rollenrecht.
- Keine toten QR-Links.
- Keine doppelten Fragen.
- Reconnect ausreichend fuer kurze Aussetzer.
- Ablauf ist fuer echte Nutzer verstaendlich.


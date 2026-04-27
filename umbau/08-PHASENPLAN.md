# 08 - Phasenplan

## Phase 1 - Architektur/Doku

Ziel:

- Bestehenden Umbauplan final pruefen.
- Display-first-Flow und Token-Konzept bestaetigen.
- Scope fuer Phase 2 festlegen.

Betroffene Dateien:

- Nur `umbau/*`.

Konkrete Schritte:

- Plan lesen.
- Display-first-Flow und Token-Konzept klaeren.
- Offene Entscheidungen klaeren.
- Scope fuer Phase 2 festlegen.

Risiken:

- Zu viele Features in Phase 2 packen.
- Host-first-Annahmen in spaetere Phasen einschleppen.

Tests:

- Keine Code-Tests.

Abnahmekriterien:

- Nutzer gibt Go fuer Serverrollen/Protokoll.
- Display-first-Flow ist klar dokumentiert.
- Token-Konzept (joinCode/hostToken/hostSessionId/displayToken) ist konsistent.

## Phase 2 - Serverrollen/Protokoll (Display-first + Host-Pairing)

Ziel:

- Rolle `display` serverseitig und im Protokoll einfuehren.
- `display:create-room` als Hauptinitialisierungs-Event einfuehren.
- `host:connect` als Host-Pairing-Event einfuehren.
- `hostToken` fuer Pairing, `hostSessionId` fuer Reconnect sauber trennen.
- Display-Session mit `displayToken` ermoeglichen.
- Rechte sauber trennen.

Betroffene Dateien:

- `packages/shared-types/src/common.ts`
- `packages/shared-types/src/room.ts`
- `packages/shared-protocol/src/events.ts`
- `packages/shared-protocol/src/schemas.ts`
- `apps/server/src/server-types.ts`
- `apps/server/src/room.ts`
- `apps/server/src/lobby.ts` oder neue `display.ts` / `host-pairing.ts`
- `apps/server/src/connection.ts`
- `apps/server/src/session.ts`
- `apps/server/src/game.ts`
- Tests in `packages/shared-protocol/src/schemas.test.ts` und `apps/server/src/*.test.ts`

Konkrete Schritte:

- `display` in Rollen ergaenzen.
- `display:create-room` und `display:room-created` implementieren (mit joinCode, hostToken, displayToken).
- `host:connect` und `host:connected` implementieren (Token-Validierung, hostSessionId vergeben).
- `display:host-paired` an Display senden nach erfolgreichem Host-Pairing.
- `hostToken` als einmaligen Pairing-Token mit `hostTokenUsed`-Flag implementieren.
- Display-Session im RoomRecord speichern.
- `resumeSession` und `handleSocketClose` fuer Display und Host erweitern.
- Broadcast-Helfer nach Zielgruppe einfuehren.
- Frage, Timer, Reveal, Scoreboard an Display senden.
- Display fuer Host-Events serverseitig blocken.
- Host fuer Display-Events serverseitig blocken.
- Player fuer Host-/Display-Events serverseitig blocken.

Risiken:

- Display verdraengt Host-Session.
- Bestehender Player-Flow bricht.
- `syncSessionToRoomState` liefert falschen Snapshot.
- `hostToken` wird faelschlicherweise als `hostSessionId` verwendet.
- Bereits benutzter `hostToken` wird akzeptiert (Security-Problem).

Tests:

- Schema-Tests fuer alle neuen Events.
- `display:create-room` erstellt Raum korrekt.
- `display:room-created` enthaelt joinCode, hostToken, displayToken.
- `host:connect` mit gueltigem Token erstellt hostSessionId.
- `host:connect` mit ungueltigem Token wird abgelehnt.
- `host:connect` mit bereits benutztem Token wird abgelehnt.
- Autorisierungstests fuer Display (darf keine Host-Events senden).
- Autorisierungstests fuer Host (darf keine Display-Events senden).
- Reconnect-Tests fuer Host/Display/Player ohne gegenseitige Verdraengung.
- Regression: Player kann joinen, antworten, ready senden.

Abnahmekriterien:

- Display kann Raum erstellen und bekommt joinCode, hostToken, displayToken.
- Host kann sich per hostToken koppeln und bekommt hostSessionId.
- Display darf nicht steuern.
- Host und Display koennen gleichzeitig verbunden sein.
- Pflichtkommandos gruen.

## Phase 3 - Display-App (Setup-Screen + 2 QR-Codes)

Ziel:

- Neue `apps/web-display` bauen.
- Setup-Screen: Button "Quizraum erstellen".
- Lobby: Player-QR und Host-QR anzeigen.
- Nach Host-Pairing: Host-QR ausblenden.
- Kompletten Spielablauf anzeigen.

Betroffene Dateien:

- `apps/web-display/*`
- `pnpm-workspace.yaml` nur falls noetig (aktuell deckt `apps/*` neue App ab).
- Root- oder Startskripte erst spaeter.

Konkrete Schritte:

- App-Struktur analog Host/Player anlegen.
- Display-Storage anlegen.
- Socket-Verbindung mit `VITE_SERVER_SOCKET_URL`.
- Setup-Screen: Button, der `display:create-room` sendet.
- `display:room-created` verarbeiten: joinCode, hostToken, displayToken speichern.
- Player-QR aus `VITE_PLAYER_JOIN_BASE_URL + ?joinCode=XXX` generieren.
- Host-QR aus `VITE_HOST_URL + ?hostToken=YYY` generieren.
- Beide QR-Codes in Lobby anzeigen.
- Nach `display:host-paired` Event: Host-QR ausblenden oder minimieren.
- `connection:resume` fuer Reconnect senden.
- Screens fuer Lobby, Question, Reveal, Scoreboard, Finished bauen.
- Keine Steuerbuttons.

Risiken:

- Display baut QR-Codes mit falschen URLs (localhost statt Hotspot-IP).
- Host-QR bleibt sichtbar nach Pairing (anderes Geraet koennte sich koppeln).
- Reconnect-Status unklar.
- TV-Layout nicht lesbar.

Tests:

- `pnpm --filter @quiz/web-display run typecheck`
- `pnpm build`
- Manueller lokaler Display-Connect.
- Manuelle Pruefung: QR-Codes zeigen auf korrekte URLs.
- Manuelle Pruefung: Host-QR verschwindet nach Pairing.

Abnahmekriterien:

- Display zeigt Setup-Screen mit Button.
- Nach Klick: Player-QR und Host-QR sichtbar.
- Nach Host-Pairing: Host-QR ausgeblendet.
- Display zeigt kompletten Spielablauf.
- Display sendet keine Steueraktionen.
- TV-taugliche Darstellung.

## Phase 4 - Host-Controller-App (koppelt per hostToken)

Ziel:

- `apps/web-host` wird Controller statt TV-Buehne.
- Host erstellt keinen Raum mehr (das macht Display).
- Host koppelt sich per `hostToken` aus URL-Query.

Betroffene Dateien:

- `apps/web-host/src/App.tsx`
- `apps/web-host/src/styles.css`
- `apps/web-host/src/storage.ts`

Konkrete Schritte:

- Raum-erstellen-Flow entfernen.
- `hostToken` aus Query (`?hostToken=YYY`) lesen.
- `host:connect` mit `hostToken` senden.
- `host:connected` verarbeiten: `hostSessionId` und `roomId` speichern.
- Reconnect: `connection:resume` mit `hostSessionId` und `roomId` senden.
- Grosse Stage-Ansichten entfernen oder stark verdichten.
- Mobile Controller-Screens bauen.
- Display-Verbindungsstatus anzeigen.
- Steueraktionen klar platzieren.
- Player-Link/QR als Info-Ansicht behalten (optional, Display zeigt QR ebenfalls).

Risiken:

- Host verliert wichtige Statusinfos beim Stage-Entfernen.
- Mobile Bedienung wird unuebersichtlich.
- Zu viel Layoutarbeit in einer Phase.
- Host bekommt keinen `hostToken` in URL -> Fehlerbehandlung noetig.

Tests:

- Host typecheck/build.
- Host ohne `hostToken` in URL: klare Fehlermeldung oder Fallback.
- Host mit gueltigem `hostToken`: Kopplung funktioniert.
- Host-Reconnect mit `hostSessionId`: funktioniert.
- Kompletter lokaler Durchlauf mit Display und Player.

Abnahmekriterien:

- Host koppelt sich per Host-QR-Scan.
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

- Texte von "Host-Bildschirm" auf "Bildschirm vorne" oder "TV" aendern.
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

Voraussetzung:

- Phase 3-5 (Rollen/UI-Trennung) abgeschlossen.

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

Voraussetzung:

- Lokaler E2E-Test (Phase 8 Dry-Run) bestanden.
- Alle Pflichtkommandos gruen.

Ziel:

- System ueber Ziel-Domains erreichbar machen.

Betroffene Dateien:

- Vite-Env-Nutzung in allen Apps.
- `start_local_game_host.sh`
- `stop_local_game_host.sh` falls noetig.
- README/docs fuer Betrieb.

Konkrete Schritte:

- `VITE_SERVER_SOCKET_URL` in allen Apps als primaere Socket-URL.
- `VITE_DISPLAY_URL`, `VITE_HOST_URL`, `VITE_PLAYER_JOIN_BASE_URL` in Display-App fuer QR-Bau.
- Startskript um Display-Port und Env erweitern.
- Cloudflare Tunnel testen.
- Optional spaeter Pages + Node Backend dokumentieren/umsetzen.

Risiken:

- QR zeigt auf Domain, Client verbindet aber zu localhost.
- WebSocket-Upgrades laufen nicht.
- HTTPS/WSS-Mismatch.

Tests:

- Lokaler Test mit Hotspot-Env.
- Tunnel-Test mit echtem Handy.
- WSS-Test.

Abnahmekriterien:

- TV, Host und Player laufen ueber Domain.
- Player-QR zeigt auf `play.<domain>`.
- Host-QR zeigt auf `host.<domain>`.
- WebSocket laeuft ueber `wss://api.<domain>`.

## Phase 8 - End-to-End-Test

Ziel:

- Realistischer Abendtest.

Setup:

- 1 TV/Display-Geraet (Laptop an TV).
- 1 Host-Handy.
- Mindestens 2 Player-Handys.
- Lokales WLAN oder Hotspot.

Testablauf:

1. TV oeffnet Display-Seite.
2. Display klickt "Quizraum erstellen".
3. TV zeigt Player-QR und Host-QR.
4. Host scannt Host-QR mit Handy.
5. Host-QR verschwindet auf TV.
6. Player scannen Player-QR und joinen mit Namen.
7. Host startet Spiel.
8. Alle Fragetypen testen.
9. Player-Reconnect testen.
10. Display-Reconnect testen.
11. Host-Reconnect testen.
12. Endstand erreichen.

Risiken:

- Mobile Browser Sleep.
- WLAN/Hotspot instabil.
- Display-Token im Browser-Storage verloren (neuer Tab).

Tests:

- Manueller kompletter Durchlauf.
- Pflichtkommandos nach letzten Codeaenderungen.

Abnahmekriterien:

- Kein falsches Rollenrecht.
- Keine toten QR-Links.
- Keine doppelten Fragen.
- Reconnect ausreichend fuer kurze Aussetzer.
- Ablauf ist fuer echte Nutzer verstaendlich.
- TV und Host-Handy verdraengen sich nicht gegenseitig.

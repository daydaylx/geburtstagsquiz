# 10 - Testplan

## Pflicht nach Codeaenderungen

```bash
pnpm typecheck
pnpm test
pnpm build
```

Diese drei Kommandos sind die Mindestabnahme nach jeder Implementierungsphase.

## Unit-Tests

### Shared Protocol

Datei:

- `packages/shared-protocol/src/schemas.test.ts`

Tests:

- `display:create-room` Schema ist gueltig.
- `display:room-created` roundtript (enthaelt joinCode, hostToken, displayToken, displaySessionId).
- `display:host-paired` Schema ist gueltig.
- `host:connect` Schema akzeptiert gueltigen hostToken.
- `host:connect` Schema lehnt leere Tokens ab.
- `host:connected` roundtript (enthaelt hostSessionId).
- `connection:resumed` akzeptiert `role: "display"`.
- `connection:resumed` akzeptiert `role: "host"`.
- Display-relevante Serverevents parsen: `question:show`, `question:timer`, `question:reveal`, `score:update`.

### Server – Display-first Flow

Dateien:

- `apps/server/src/*.test.ts`

Tests fuer Rauminitialisierung:

- Display sendet `display:create-room` -> bekommt `display:room-created` mit joinCode, hostToken, displayToken.
- Raum existiert nach `display:create-room` im Server-State.
- `display:room-created` enthaelt einen langen, nicht erratbaren hostToken.
- `display:room-created` enthaelt einen anderen, nicht erratbaren displayToken.
- `joinCode` und `hostToken` sind nicht identisch.
- `hostToken` und `displaySessionId` sind nicht identisch.

Tests fuer Host-Pairing:

- Host sendet `host:connect` mit gueltigem hostToken -> bekommt `host:connected` mit hostSessionId.
- `host:connected` enthaelt eine neue hostSessionId (nicht identisch mit hostToken).
- Nach Host-Pairing: `display:host-paired` geht an Display.
- Host sendet `host:connect` mit ungueltigem hostToken -> Fehler, kein Pairing.
- Host sendet `host:connect` mit bereits benutztem hostToken -> Fehler, kein zweites Pairing.
- Zweites Geraet kann sich nicht per benutztem hostToken koppeln.

Tests fuer Autorisierung:

- Display darf `game:start` nicht.
- Display darf `room:settings:update` nicht.
- Display darf `answer:submit` nicht.
- Display darf `game:next-question` nicht.
- Display darf `room:close` nicht.
- Host darf `display:create-room` nicht.
- Player darf `host:connect` nicht.
- Player darf `game:start` nicht.
- Player darf `game:next-question` nicht.
- Alle unautorisierten Events bekommen `NOT_AUTHORIZED` zurueck.

Tests fuer Reconnect:

- Display-Reconnect verdraengt Host nicht.
- Host-Reconnect verdraengt Display nicht.
- Display-Reconnect liefert korrekten Public-Snapshot fuer aktuellen GameState.
- Host-Reconnect liefert korrekten Controller-Snapshot fuer aktuellen GameState.
- Display-Disconnect schliesst Raum nicht.
- Host-Disconnect schliesst Raum erst nach Grace-Zeit.
- Room close raeumt Host-, Display- und Player-Sessions auf.

Tests fuer QR und Token-Korrektheit:

- Display kann nicht mit joinCode verbinden (kein Host-/Display-Recht).
- Display kann nicht mit hostToken als Session-Credential reconnecten.
- Ungueltige displayToken werden sauber abgelehnt.

Tests fuer Broadcasts:

- Display bekommt `question:show`, nicht `question:controller`.
- Host bekommt `answer:progress`.
- Player bekommt `question:controller`, nicht `question:show`.

### Fragenlogik

Datei:

- `apps/server/src/game.test.ts`

Tests:

- Keine doppelten Frage-IDs.
- Originalfragen werden nicht mutiert.
- Zielanzahl 30 wird erreicht, wenn genug Fragen da sind.
- Typverteilung wird eingehalten, falls Zielverteilung eingefuehrt wird.
- Fallback bei zu wenigen Fragen eines Typs.
- Deterministischer Random-Test bleibt stabil.

### Quiz Engine

Bestehende Tests beibehalten:

- Multiple Choice / Logic.
- Estimate.
- Majority Guess.
- Ranking.
- Open Text.
- Scoreboard.

Nur erweitern, wenn Scoring tatsaechlich geaendert wird.

## Manuelle lokale Tests

Setup:

```bash
pnpm dev
```

Nach Display-App:

```text
Server:  http://localhost:3001
Host:    http://localhost:5173
Player:  http://localhost:5174
Display: http://localhost:5175
```

Testablauf (Display-first):

1. Display oeffnen (`localhost:5175`).
2. Button "Quizraum erstellen" klicken.
3. Player-QR und Host-QR erscheinen auf TV.
4. Host-QR in neuem Browser-Fenster oeffnen (`localhost:5173?hostToken=YYY`).
5. Host koppelt sich, Host-QR verschwindet auf TV.
6. Zwei Player-Fenster oder Handys joinen per Player-QR.
7. Host startet Spiel.
8. Multiple Choice beantworten.
9. Estimate beantworten.
10. Ranking beantworten.
11. OpenText beantworten.
12. Reveal und Erklaerung pruefen.
13. Scoreboard und Ready pruefen.
14. Endstand erreichen.

## End-to-End-Test mit echten Geraeten

Geraete:

- 1 TV/Laptop als Display-Geraet.
- 1 Host-Handy.
- Mindestens 2 Player-Handys.

Testablauf:

1. TV oeffnet Display-Seite.
2. TV klickt "Quizraum erstellen".
3. TV zeigt Player-QR und Host-QR.
4. Host scannt Host-QR -> koppelt sich.
5. Host-QR verschwindet auf TV.
6. Spieler scannen Player-QR.
7. Alle Player joinen mit Namen.
8. Host startet Spiel.
9. Jeder Fragetyp wird mindestens einmal gespielt.
10. Ein Player antwortet doppelt: nur erste Antwort zaehlt.
11. Ein Player antwortet spaet: Antwort wird abgelehnt.
12. Ein Player laedt neu: Resume klappt oder klare Neu-Join-Info.
13. Display laedt neu: Display kommt wieder in aktuellen Zustand.
14. Host laedt neu: Host bekommt Controllerzustand zurueck.
15. Endstand wird angezeigt.
16. Pruefung: Host-QR auf TV bleibt ausgeblendet nach Reload.
17. Pruefung: kein zweites Geraet kann sich als Host koppeln (Token verbraucht).

## Domain-Test

Voraussetzung:

- Lokaler 3-UI-Test bestanden.

Test:

```text
tv.<domain>    -> Quizraum erstellen
host.<domain>  -> Host-QR scannen -> koppeln
play.<domain>  -> Player-QR scannen -> joinen
api.<domain>   -> WebSocket per wss
```

Pruefen:

- Keine App verbindet sich zu `localhost`.
- Keine App verbindet sich zu falschem Port.
- Player-QR zeigt auf `play.<domain>`.
- Host-QR zeigt auf `host.<domain>`.
- WebSocket nutzt `wss://api.<domain>`.
- QR-Codes zeigen auf Domain, nicht auf Hotspot-IP.

## Reconnect-Test

Host:

- Browser reload.
- WLAN kurz aus/an.
- Innerhalb Grace-Zeit wieder verbunden.
- Host steuert weiter.
- Display bleibt verbunden nach Host-Reconnect.

Display:

- Browser reload.
- Display bekommt aktuellen Zustand.
- Host bleibt verbunden.
- Spieler bleiben verbunden.

Player:

- Browser reload waehrend aktiver Frage.
- Bereits gesendete Antwort wird erkannt.
- Reload im Reveal zeigt Ergebnis.
- Reload im Scoreboard zeigt Ready-Status oder erlaubt Ready sinnvoll.

## QR-Test

- Player-QR mit mindestens zwei Handys scannen.
- Player-QR enthaelt joinCode in URL.
- Host-QR enthaelt hostToken in URL.
- Manueller Join per Codeeingabe funktioniert weiterhin.
- Host-QR wird nach Kopplung auf TV ausgeblendet.
- Bereits genutzter hostToken aus Host-QR wird abgelehnt, wenn jemand anderes versucht zu koppeln.
- displayToken wird nicht als Klartext prominent auf dem TV gezeigt.

## Spezifische Sicherheitstests

- Display sendet `game:start` -> Server lehnt ab mit NOT_AUTHORIZED.
- Player sendet `host:connect` -> Server lehnt ab mit NOT_AUTHORIZED.
- Fremdes Geraet sendet `host:connect` mit bereits benutztem hostToken -> abgelehnt.
- Fremdes Geraet sendet `host:connect` mit erfundenem Token -> abgelehnt.
- Fremdes Geraet sendet `display:create-room` mit bestehender Session -> abgelehnt.

## Integrationstest-Szenarien

Servernahe Tests sollten pruefen:

- Raum erstellen per `display:create-room`.
- Player joinen per `room:join` mit joinCode.
- Host koppelt per `host:connect` mit hostToken.
- Spiel starten per `game:start` (Host).
- Aktive Frage an Display als `question:show`.
- Aktive Frage an Player als `question:controller`.
- Antwortfortschritt an Host und Display.
- Reveal mit Erklaerung an Display/Host/Player.
- Scoreboard an alle relevanten Clients.
- Ready-Progress an Host/Display/Player.

Wenn vollstaendige WebSocket-Tests zu aufwendig werden: zuerst Handler- und Payload-Tests schreiben. Keine grosse Testinfrastruktur nur fuer theoretische Abdeckung bauen.

## Abbruchkriterien

Nicht in Domainbetrieb gehen, wenn:

- Display Host verdraengt.
- Host Display verdraengt.
- Player volle Frage bekommt, obwohl er nur Controllerdaten bekommen soll.
- Player-QR auf falsche URL zeigt.
- Host-QR auf falsche URL zeigt.
- WebSocket auf `localhost` zeigt.
- Reconnect reproduzierbar falschen Zustand zeigt.
- Bereits benutzter hostToken wird akzeptiert.
- `pnpm typecheck`, `pnpm test` oder `pnpm build` fehlschlaegt.

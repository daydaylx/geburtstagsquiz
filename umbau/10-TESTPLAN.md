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

- `display:connect` akzeptiert gueltigen Token.
- `display:connect` lehnt Zusatzfelder ab.
- `display:connected` roundtript.
- `connection:resumed` akzeptiert `role: "display"`.
- Display-relevante Serverevents parsen: `question:show`, `question:timer`, `question:reveal`, `score:update`.

### Server

Dateien:

- `apps/server/src/*.test.ts`

Tests:

- Host erstellt Raum und bekommt `displayToken`.
- Display kann mit gueltigem Token verbinden.
- Display kann nicht mit Join-Code verbinden.
- Display darf `game:start` nicht.
- Display darf `room:settings:update` nicht.
- Display darf `answer:submit` nicht.
- Display-Reconnect verdraengt Host nicht.
- Host-Reconnect verdraengt Display nicht.
- Display-Disconnect schliesst Raum nicht.
- Room close raeumt Host, Display und Player-Sessions auf.

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

## Integrationstests

Servernahe Tests sollten pruefen:

- Raum erstellen.
- Display verbinden.
- Player joinen.
- Spiel starten.
- Aktive Frage an Display als `question:show`.
- Aktive Frage an Player als `question:controller`.
- Antwortfortschritt an Host und Display.
- Reveal mit Erklaerung an Display/Host/Player.
- Scoreboard an alle relevanten Clients.
- Ready-Progress an Host/Display/Player.

Wenn ein vollstaendiger WebSocket-Test zu aufwendig wird, zuerst Handler- und Payload-Tests schreiben. Keine grosse Testinfrastruktur nur fuer theoretische Abdeckung bauen.

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

Testablauf:

1. Host oeffnen.
2. Raum erstellen.
3. Display-Link im neuen Browserfenster oeffnen.
4. Zwei Player-Fenster oder Handys joinen.
5. Spiel starten.
6. Multiple Choice beantworten.
7. Estimate beantworten.
8. Ranking beantworten.
9. OpenText beantworten.
10. Reveal und Erklaerung pruefen.
11. Scoreboard und Ready pruefen.
12. Endstand erreichen.

## End-to-End-Test mit echten Geraeten

Geraete:

- 1 Host-Geraet, ideal Handy/Tablet oder Laptop.
- 1 TV/Display-Geraet.
- Mindestens 2 Player-Handys.

Test:

1. Host erstellt Raum.
2. TV verbindet sich ueber Display-Link.
3. Player scannen QR.
4. Alle Player joinen mit Namen.
5. Spiel startet.
6. Jeder Fragetyp wird mindestens einmal gespielt.
7. Ein Player antwortet doppelt: nur erste Antwort zaehlt.
8. Ein Player antwortet spaet: Antwort wird abgelehnt.
9. Ein Player laedt neu: Resume klappt oder klare Neu-Join-Info.
10. Display laedt neu: Display kommt wieder in aktuellen Zustand.
11. Host laedt neu: Host bekommt Controllerzustand zurueck.
12. Endstand wird angezeigt.

## Domain-Test

Voraussetzung:

- Lokaler 3-UI-Test bestanden.

Test:

```text
host.<domain>  -> Raum erstellen
tv.<domain>    -> Display-Link oeffnen
play.<domain>  -> QR scannen
api.<domain>   -> WebSocket per wss
```

Pruefen:

- Keine App verbindet sich zu `localhost`.
- Keine App verbindet sich zu falschem Port.
- QR zeigt auf `play.<domain>`.
- Display-Link zeigt auf `tv.<domain>`.
- WebSocket nutzt `wss://api.<domain>`.

## Reconnect-Test

Host:

- Browser reload.
- WLAN kurz aus/an.
- Innerhalb Grace-Zeit wieder verbunden.
- Host steuert weiter.

Display:

- Browser reload.
- Display bekommt aktuellen Zustand.
- Host bleibt verbunden.

Player:

- Browser reload waehrend aktiver Frage.
- Bereits gesendete Antwort wird erkannt.
- Reload im Reveal zeigt Ergebnis.
- Reload im Scoreboard zeigt Ready-Status oder erlaubt Ready sinnvoll.

## QR-Test

- Player-QR mit mindestens zwei Handys scannen.
- Join-Code in URL ist korrekt.
- Manuelle Codeeingabe funktioniert weiterhin.
- Display-Link enthaelt Display-Token, nicht Join-Code.
- Display-Token wird nicht auf dem TV als Klartext prominent gezeigt.

## Abbruchkriterien

Nicht in Domainbetrieb gehen, wenn:

- Display Host verdringt.
- Player volle Frage bekommt, obwohl er nur Controllerdaten bekommen soll.
- QR auf falsche URL zeigt.
- WebSocket auf `localhost` zeigt.
- Reconnect reproduzierbar falschen Zustand zeigt.
- `pnpm typecheck`, `pnpm test` oder `pnpm build` fehlschlaegt.


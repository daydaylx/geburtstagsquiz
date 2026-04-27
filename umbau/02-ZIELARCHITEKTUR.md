# 02 - Zielarchitektur

## Zielbild

Das Ziel ist kein Plattformumbau, sondern ein stabiler Abendbetrieb mit drei getrennten Browseroberflaechen:

```text
apps/web-display  -> TV / Beamer / oeffentliche Anzeige
apps/web-host     -> Host Controller
apps/web-player   -> Spieler-Handys
apps/server       -> authoritative WebSocket-Server
```

## Rollenmodell

```text
host     -> darf steuern
display  -> darf nur anzeigen
player   -> darf antworten
```

### Host

Der Host darf:

- Raum erstellen.
- Player-Link und Display-Link sehen.
- Lobby-Einstellungen setzen.
- Spiel starten.
- Nach Scoreboard manuell weiterschalten.
- Raum schliessen.
- Spielerstatus und Antwortfortschritt sehen.

### Display

Das Display darf:

- Lobby anzeigen.
- Frage, Antwortoptionen, Timer und Antwortfortschritt anzeigen.
- Reveal mit Erklaerung anzeigen.
- Scoreboard und Endstand anzeigen.
- Verbindungsstatus anzeigen.

Das Display darf nicht:

- Spiel starten.
- Naechste Frage ausloesen.
- Einstellungen aendern.
- Antworten senden.
- Spieler entfernen.
- Raum schliessen.
- Host-Session wiederaufnehmen.

### Player

Player duerfen:

- Per Join-Code beitreten.
- Eine Antwort pro aktiver Frage senden.
- Nach Scoreboard Ready senden.
- Eigene Session wiederaufnehmen.

Player duerfen keine Host- oder Display-Rechte bekommen.

## Datenfluss

```text
Host Controller -> Server: create/start/settings/next/close
Display         -> Server: display:connect oder connection:resume fuer Display-Session
Player          -> Server: join/answer/ready/resume

Server -> Host: Controller-Snapshot, Spielerstatus, Antwortfortschritt, Fehler
Server -> Display: Public-Snapshot, Frage, Timer, Reveal, Scoreboard
Server -> Player: Controller-Payload, Antwortstatus, eigenes Reveal, Scoreboard
```

## Sessionmodell

Empfohlen fuer den ersten Umbau:

```ts
RoomRecord {
  hostSessionId: string;
  displaySessionId?: string;
  displayToken: string;
  displayConnected: boolean;
  players: Player[];
}
```

Nur ein Display ist fuer den Abend ausreichend. Mehrere Displays werden nicht gebaut, solange es keinen konkreten Bedarf gibt.

## Display-Token

Der Server erzeugt beim Erstellen des Raums:

- `joinCode` fuer Player.
- `displayToken` fuer Display.
- `hostSessionId` fuer Host.

Der Host bekommt beide Links:

```text
Player-Link:  https://play.<domain>?joinCode=ABC234
Display-Link: https://tv.<domain>?displayToken=...
```

Der Join-Code darf nicht reichen, um ein Display zu oeffnen. Das Display nutzt ein separates Token.

## Reconnect-Konzept

### Host

- Host speichert `roomId` und `hostSessionId`.
- Resume bleibt wie heute ueber `connection:resume`.
- Host-Disconnect schliesst den Raum erst nach Grace-Zeit.
- Display darf Host-Session niemals ersetzen.

### Display

- Display speichert `roomId`, `displaySessionId` und optional `displayToken`.
- Erstverbindung ueber `display:connect`.
- Danach Resume ueber `connection:resume`.
- Display-Disconnect setzt `displayConnected=false`, schliesst aber keinen Raum.
- Display-Reconnect muss den aktuellen Public-Snapshot bekommen.

### Player

- Player-Resume bleibt mit `sessionId`, `roomId`, `playerId`.
- Player duerfen weiterhin nur Controller-Daten bekommen.
- Disconnectete Player blockieren den naechsten Fragenwechsel nicht.

## Public State vs Controller State

Display und Host duerfen nicht einfach dieselbe Payload bekommen.

Display bekommt Public State:

- Join-Code und Player-Anzahl.
- Frage mit Antwortoptionen.
- Timer.
- Antwortfortschritt als Zahlen.
- Reveal mit richtiger Antwort und Erklaerung.
- Scoreboard.

Host bekommt Controller State:

- Alle Display-relevanten Kompaktinfos.
- Spielerstatus.
- Display-Verbindungsstatus.
- Steuerbare Aktionen.
- Protokollfehler.

Player bekommt Player State:

- Join/Resume.
- Frage als Controller-Payload.
- Antwortstatus.
- Eigene Runde.
- Scoreboard und Ready-Fortschritt.

## Domainstruktur

Ziel:

```text
tv.<domain>    -> Display UI
host.<domain>  -> Host Controller UI
play.<domain>  -> Player UI
api.<domain>   -> WebSocket/API Backend
```

Lokale Ports:

```text
server       3001
web-host     5173
web-player   5174
web-display  5175
```

## Grenzen

- Kein Accountsystem.
- Keine Datenbank.
- Keine Cloud-Persistenz.
- Keine Durable Objects im ersten Umbau.
- Keine neuen Spielmodi.
- Keine Design-/Animationsphase vor Rollen- und Sessionstabilitaet.


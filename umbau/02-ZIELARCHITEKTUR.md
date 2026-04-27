# 02 - Zielarchitektur

## Zielbild

Das Ziel ist kein Plattformumbau, sondern ein stabiler Abendbetrieb mit drei getrennten Browseroberflaechen:

```text
apps/web-display  -> TV / Beamer / oeffentliche Anzeige (erstellt Raum)
apps/web-host     -> Host Controller (koppelt per hostToken)
apps/web-player   -> Spieler-Handys
apps/server       -> authoritative WebSocket-Server
```

## Kanonischer Startablauf (Display-first)

Der Ablauf beginnt immer auf dem TV, nicht auf dem Host-Handy:

```text
1. TV/Laptop oeffnet tv.<domain>
2. Display zeigt Button "Quizraum erstellen"
3. Nach Klick: Server erstellt Raum und gibt joinCode, hostToken, displayToken zurueck
4. TV zeigt Player-QR (play.<domain>?joinCode=XXX) und Host-QR (host.<domain>?hostToken=YYY)
5. Spieler scannen Player-QR -> joinen per joinCode
6. Host scannt Host-QR mit Handy -> koppelt sich per hostToken -> bekommt hostSessionId
7. Nach Host-Kopplung: Host-QR auf TV ausblenden oder minimieren
8. TV bleibt reine Anzeige (read-only)
9. Host-Handy steuert das Spiel
10. Player-Handys beantworten Fragen
```

**Bewusste Entscheidung:** Display zeigt Button "Quizraum erstellen", nicht Auto-Create bei Seitenlade.
Begruendung: Auto-Create wuerde bei jedem Reload einen neuen Raum erzeugen. Ein Button verhindert das und ist trotzdem fast genauso bequem.

## Rollenmodell

```text
display  -> initialisiert Raum, darf danach nur anzeigen
host     -> koppelt sich per hostToken, darf steuern
player   -> darf antworten
```

### Display

Das Display:

- Oeffnet `tv.<domain>` ohne Parameter.
- Zeigt Button "Quizraum erstellen".
- Sendet nach Klick `display:create-room`.
- Bekommt `display:room-created` mit `joinCode`, `hostToken`, `displayToken`, `displaySessionId`.
- Zeigt Player-QR und Host-QR.
- Zeigt Status "Host verbunden" oder "Host noch nicht verbunden".
- Blendet Host-QR aus, nachdem Host sich gekoppelt hat.
- Zeigt danach: Lobby, Frage, Timer, Antwortfortschritt, Reveal, Erklaerung, Scoreboard, Endstand.

Das Display darf nicht:

- Spiel starten.
- Naechste Frage ausloesen.
- Einstellungen aendern.
- Antworten senden.
- Spieler entfernen.
- Raum schliessen.
- Host-Session verwenden oder verdraengen.

### Host

Der Host:

- Oeffnet `host.<domain>?hostToken=YYY` (Link aus Host-QR).
- Sendet `host:connect` mit `hostToken`.
- Bekommt `host:connected` mit `hostSessionId`.
- Speichert `hostSessionId` fuer Reconnect.
- Steuert das Spiel: Start, Settings, Naechste Frage, Raum schliessen.
- Sieht Spielerstatus, Antwortfortschritt, Display-Verbindungsstatus.

Der Host darf nicht:

- Einen neuen Raum erstellen (das macht Display).
- Display-Session verwenden oder verdraengen.

### Player

Player:

- Scannen Player-QR -> landen auf `play.<domain>?joinCode=XXX`.
- Senden `room:join` mit `joinCode` und Namen.
- Antworten, Ready senden, Resume nutzen.

Player haben keine Host- oder Display-Rechte.

## Token- und Session-Konzept

Alle Tokens und Sessions haben unterschiedliche Zwecke und duerfen nicht verwechselt werden:

```text
joinCode        kurzer Code (z.B. "ABC12") fuer Player-Join
                enthalten im Player-QR
                nicht fuer Host- oder Display-Rechte verwendbar

hostToken       langer, kryptografisch zufaelliger Token
                enthalten im Host-QR
                nur fuer initiales Host-Pairing (einmalige Verwendung)
                nach Pairing optional invalidieren oder Host-QR ausblenden
                NICHT identisch mit hostSessionId

hostSessionId   UUID, entsteht nach erfolgreichem Host-Pairing
                wird vom Host fuer Reconnect gespeichert
                einziges Mittel fuer Host-Reconnect

displayToken    UUID oder langer Token, dient Display-Reconnect
                nicht fuer Host-Steuerung verwendbar

displaySessionId eigene Session-ID fuer das TV-Display
                darf Host-Session nicht verdraengen
```

## Sessionmodell

```ts
RoomRecord {
  roomId: string;
  joinCode: string;
  hostToken: string;           // nur fuer initiales Pairing
  hostSessionId: string;       // nach Host-Pairing gesetzt
  hostConnected: boolean;
  hostDisconnectTimer?: ...;
  displayToken: string;        // fuer Display-Reconnect
  displaySessionId?: string;   // nach Display-Connect gesetzt
  displayConnected: boolean;
  displayDisconnectTimer?: ...;
  players: Player[];
  gameState: ...;
}
```

Nur ein Display und ein Host sind vorgesehen. Mehrere Displays oder Hosts werden nicht gebaut.

## Reconnect-Konzept

### Host-Reconnect

- Host hat keine Session vor dem Pairing.
- Erstverbindung ueber `host:connect` mit `hostToken`.
- Nach Pairing wird `hostSessionId` gespeichert.
- Reconnect ueber `connection:resume` mit `hostSessionId` und `roomId`.
- Host-Disconnect schliesst den Raum erst nach Grace-Zeit (5 min).
- Display darf Host-Session niemals ersetzen.

### Display-Reconnect

- Display speichert `roomId`, `displaySessionId` und optional `displayToken`.
- Erstverbindung: Display sendet `display:create-room`.
- Reconnect: Display sendet `connection:resume` mit `displaySessionId` und `roomId`.
- Display-Disconnect setzt `displayConnected=false`, schliesst aber keinen Raum.
- Display-Reconnect muss den aktuellen Public-Snapshot bekommen.
- Host-Session wird dabei nicht beeinflusst.

### Player-Reconnect

- Unveraendert: `connection:resume` mit `sessionId`, `roomId`, `playerId`.
- Player bekommen weiterhin nur Controller-Daten.

## Datenfluss

```text
Display         -> Server: display:create-room (Rauminitialisierung)
Display         -> Server: connection:resume (Reconnect)
Host            -> Server: host:connect (Kopplung per hostToken)
Host            -> Server: connection:resume (Reconnect per hostSessionId)
Host            -> Server: game:start, game:next-question, room:settings:update, room:close
Player          -> Server: room:join, answer:submit, next-question:ready, connection:resume

Server -> Display: display:room-created (joinCode, hostToken, displayToken, displaySessionId)
Server -> Display: lobby:update, question:show, question:timer, answer:progress, question:reveal, score:update, game:finished
Server -> Host:   host:connected (hostSessionId), Controller-Snapshots, Spielerstatus, Antwortfortschritt
Server -> Player: question:controller, Antwortstatus, Reveal, Scoreboard
```

## Public State vs Controller State

Display und Host bekommen unterschiedliche Payloads:

Display bekommt Public State:

- joinCode und Spieleranzahl.
- Frage mit Antwortoptionen.
- Timer.
- Antwortfortschritt als Zahlen.
- Reveal mit richtiger Antwort und Erklaerung.
- Scoreboard.

Host bekommt Controller State:

- Alle Display-kompakten Infos.
- Spielerstatus.
- Display-Verbindungsstatus.
- Steuerbare Aktionen.
- Protokollfehler.

Player bekommt Player State:

- Join/Resume.
- Frage als Controller-Payload (ohne versteckte Antworten).
- Antwortstatus.
- Eigene Runde.
- Scoreboard und Ready-Fortschritt.

## Domainstruktur

Ziel:

```text
tv.<domain>    -> Display UI (oeffnet ohne Parameter)
host.<domain>  -> Host Controller UI (braucht ?hostToken=YYY)
play.<domain>  -> Player UI (braucht ?joinCode=XXX)
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
- Kein zweites Display oder zweiter Host.

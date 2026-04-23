# event-protocol.md

# Event-Protokoll fuer das Geburtstagsquiz

## Zweck

Dieses Dokument beschreibt die aktiven WebSocket-Events fuer den einfachen Quiz-Abend.

Es ist bewusst kein allgemeines Multiplayer-Protokoll und keine Blaupause fuer spaetere Plattform-Features.

Die exakten Schemas stehen in:

- `packages/shared-protocol/src/events.ts`
- `packages/shared-protocol/src/schemas.ts`

Wenn Doku und Code widersprechen, gewinnt der Code.

## Grundregeln

- Alle Nachrichten nutzen ein Envelope-Format mit `event` und `payload`.
- Der Server entscheidet ueber gueltige Zustaende, Antworten, Timer und Punkte.
- Host und Player senden Absichten, keine Wahrheiten.
- Ungueltige oder unpassende Payloads werden abgewiesen.
- Das Protokoll deckt nur Lobby und Multiple-Choice-Kernfluss ab.

## Wire-Format

```json
{
  "event": "room:create",
  "payload": {}
}
```

## Rollenrechte

### Host darf senden

- `connection:resume`
- `room:create`
- `game:start`
- `game:next-question`
- `room:close`

### Player darf senden

- `room:join`
- `connection:resume`
- `answer:submit`

### Server sendet

- alle bestaetigenden und zustandsaendernden Events
- alle Fehler-Events

## Aktive Events

### Verbindung und Raum

| Event | Richtung | Zweck | Kernfelder |
| --- | --- | --- | --- |
| `connection:ack` | Server -> Client | Technische Socket-Bestaetigung | `connectionId`, `serverTime` |
| `connection:resume` | Client -> Server | Bestehende Sitzung wieder aufnehmen | `sessionId`, `roomId` |
| `connection:resumed` | Server -> Client | Resume bestaetigt | `role`, `roomId`, `roomState`, optional `gameState`, `sessionId`, `joinCode`, optional `playerId`, optional `playerState`, optional `currentAnswer` |
| `room:create` | Host -> Server | Neuen Raum anlegen | `hostName`, `clientInfo` |
| `room:created` | Server -> Host | Raum wurde erstellt | `roomId`, `joinCode`, `roomState`, `hostSessionId` |
| `room:join` | Player -> Server | Raum per Join-Code betreten | `joinCode`, `playerName`, optional `sessionId` |
| `player:joined` | Server -> Player | Join bestaetigt | `roomId`, `playerId`, `sessionId`, `playerState`, `roomState` |
| `room:close` | Host -> Server | Raum beenden | `roomId` |
| `room:closed` | Server -> Host/Player | Raum ist endgueltig zu | `roomId`, `roomState` |

### Lobby und Verbindungssicht

| Event | Richtung | Zweck | Kernfelder |
| --- | --- | --- | --- |
| `lobby:update` | Server -> Host/Player | Autoritativer Lobby-Snapshot | `roomId`, `roomState`, `hostConnected`, `players`, `playerCount` |
| `player:reconnected` | Server -> Host/Player | Bisheriger Spieler ist wieder da | `roomId`, `playerId`, `playerState`, `connected` |
| `player:disconnected` | Server -> Host/Player | Spieler ist temporaer weg | `roomId`, `playerId`, `playerState`, `connected` |

### Spielablauf

| Event | Richtung | Zweck | Kernfelder |
| --- | --- | --- | --- |
| `game:start` | Host -> Server | Quiz starten | `roomId` |
| `game:started` | Server -> Host/Player | Spiel ist gestartet | `roomId`, `roomState`, `gameState`, `questionIndex` |
| `question:show` | Server -> Host/Player | Neue Frage freigeben | `roomId`, `questionId`, `questionIndex`, `type`, `text`, `options`, `durationMs`, `gameState` |
| `question:timer` | Server -> Host/Player | Verbleibende Fragezeit anzeigen | `roomId`, `questionId`, `remainingMs` |
| `answer:submit` | Player -> Server | Antwort auf aktive Frage senden | `roomId`, `questionId`, `playerId`, `answer`, `requestId` |
| `answer:accepted` | Server -> Player | Antwort wurde gespeichert | `roomId`, `questionId`, `playerId`, `status` |
| `answer:rejected` | Server -> Player | Antwort wurde nicht gewertet | `roomId`, `questionId`, `playerId`, `status`, `reason` |
| `answer:progress` | Server -> Host | Anzahl eingegangener Antworten | `roomId`, `questionId`, `answeredCount`, `totalEligiblePlayers` |
| `question:close` | Server -> Host/Player | Frage ist gesperrt | `roomId`, `questionId`, `gameState` |
| `question:reveal` | Server -> Host/Player | Richtige Antwort zeigen | `roomId`, `questionId`, `correctAnswer`, `gameState` |
| `score:update` | Server -> Host/Player | Punktestand nach der Runde | `roomId`, `questionId`, `scoreboard`, `gameState` |
| `game:next-question` | Host -> Server | Zur naechsten Frage wechseln | `roomId` |
| `game:finished` | Server -> Host/Player | Quiz ist zu Ende | `roomId`, `roomState`, `gameState`, `finalScoreboard` |

### Fehler

| Event | Richtung | Zweck | Kernfelder |
| --- | --- | --- | --- |
| `error:protocol` | Server -> Client | Ungueltiges Event oder ungueltiger Zustand | `code`, `message`, `context` |

## Praktische Regeln

### Antworten

- Pro Spieler zaehlt pro Frage nur eine Antwort.
- Die erste gueltige Antwort gewinnt.
- Spaetere oder doppelte Antworten werden abgelehnt oder ignoriert.
- Erst `answer:accepted` bestaetigt, dass eine Antwort gespeichert wurde.

### Timer

- Der Server sendet `question:timer`.
- Die Client-Anzeige darf weich laufen, ist aber nicht die Wahrheitsquelle.
- `question:close` ist das massgebliche Signal fuer "zu spaet".

### Reconnect

- Sessions werden mit `sessionId` wiedererkannt.
- Disconnects werden fuer kurze Zeit toleriert.
- `connection:resumed` kann inzwischen auch `in_game` und `completed` transportieren.
- Nach erfolgreichem Resume sendet der Server dem zurueckkehrenden Client einen passenden Snapshot fuer Lobby, aktive Frage, Reveal, Rangliste oder Endstand.
- Bei einem Player kann `currentAnswer` mitkommen, damit eine schon gesendete Antwort lokal wieder erkennbar bleibt.

## Typische Eventfolgen

### Raum erstellen und joinen

1. Server sendet `connection:ack`
2. Host sendet `room:create`
3. Server sendet `room:created`
4. Player sendet `room:join`
5. Server sendet `player:joined`
6. Server verteilt `lobby:update`

### Spielrunde

1. Host sendet `game:start`
2. Server sendet `game:started`
3. Server sendet `question:show`
4. Server sendet waehrenddessen `question:timer`
5. Player senden `answer:submit`
6. Server antwortet mit `answer:accepted` oder `answer:rejected`
7. Server sendet `question:close`
8. Server sendet `question:reveal`
9. Server sendet `score:update`

### Naechste Frage oder Ende

1. Host sendet `game:next-question`
2. Server sendet entweder die naechste `question:show`
3. oder `game:finished`

## Ausdruecklich nicht Teil dieses Protokolls

- Buzzer-Events
- Team-Events
- Joker
- Quiz-Editor-Workflows
- Admin- oder Moderationsfunktionen
- Persistenz- oder Cloud-Events
- Produktweite Kontenlogik

## Schluss

Das Protokoll soll fuer dieses Repo klein und klar bleiben.

Wenn ein Event nur fuer einen moeglichen spaeteren Ausbau existieren wuerde, gehoert es nicht hierher.

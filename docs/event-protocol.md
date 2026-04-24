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
- Das Protokoll deckt nur Lobby und den vorbereiteten Quiz-Kernfluss ab.

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
- `game:next-question` als sichtbarer Host-Override nach der Rangliste
- `room:close`

### Player darf senden

- `room:join`
- `connection:resume`
- `answer:submit`
- `next-question:ready`

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
| `game:started` | Server -> Host/Player | Spiel ist gestartet | `roomId`, `roomState`, `gameState`, `questionIndex`, `totalQuestionCount` |
| `question:show` | Server -> Host/Player | Neue Frage freigeben | `roomId`, `questionId`, `questionIndex`, `totalQuestionCount`, `type`, `text`, `options`, `durationMs`, `gameState` |
| `question:timer` | Server -> Host/Player | Verbleibende Fragezeit anzeigen | `roomId`, `questionId`, `remainingMs` |
| `answer:submit` | Player -> Server | Antwort auf aktive Frage senden | `roomId`, `questionId`, `playerId`, `answer`, `requestId` |
| `answer:accepted` | Server -> Player | Antwort wurde gespeichert | `roomId`, `questionId`, `playerId`, `status` |
| `answer:rejected` | Server -> Player | Antwort wurde nicht gewertet | `roomId`, `questionId`, `playerId`, `status`, `reason` |
| `answer:progress` | Server -> Host | Anzahl eingegangener Antworten | `roomId`, `questionId`, `answeredCount`, `totalEligiblePlayers` |
| `question:close` | Server -> Host/Player | Frage ist gesperrt | `roomId`, `questionId`, `gameState` |
| `question:reveal` | Server -> Host/Player | Richtige Antwort und Rundenergebnisse zeigen | `roomId`, `questionId`, `correctAnswer`, `playerResults`, `gameState` |
| `score:update` | Server -> Host/Player | Punktestand nach der Runde | `roomId`, `questionId`, `scoreboard`, `gameState` |
| `next-question:ready` | Player -> Server | Spieler ist nach der Rangliste bereit fuer die naechste Frage | `roomId`, `questionId`, `playerId` |
| `next-question:ready-progress` | Server -> Host/Player | Bereitschaft fuer die naechste Frage anzeigen | `roomId`, `questionId`, `readyCount`, `totalEligiblePlayers`, `readyPlayerIds`, `gameState` |
| `game:next-question` | Host -> Server | Host-Override zum Wechseln nach der Rangliste | `roomId` |
| `game:finished` | Server -> Host/Player | Quiz ist zu Ende | `roomId`, `roomState`, `gameState`, `totalQuestionCount`, `finalScoreboard` |

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
- Ob eine Antwort richtig war und wie viele Punkte sie bringt, kommt erst mit `question:reveal`.

### Timer

- Der Server sendet `question:timer`.
- Die Client-Anzeige darf weich laufen, ist aber nicht die Wahrheitsquelle.
- `question:close` ist das massgebliche Signal fuer "zu spaet".
- Die aktive Antwortzeit ist aktuell `60s` pro Frage.

### Bereit fuer die naechste Frage

- Nach `score:update` bleiben Host und Player auf der Rangliste.
- Jeder verbundene Spieler sendet `next-question:ready` ueber sein Handy.
- Der Server sendet `next-question:ready-progress` an Host und Player.
- Sobald alle verbundenen Spieler bereit sind, startet der Server automatisch die naechste Frage oder beendet das Spiel.
- Disconnectete Spieler blockieren den Wechsel nicht.
- Der Host kann nach `score:update` manuell weiterschalten, falls ein Handy haengen bleibt.

### Reconnect

- Sessions werden mit `sessionId` wiedererkannt.
- Disconnects werden fuer kurze Zeit toleriert.
- `connection:resumed` kann inzwischen auch `in_game` und `completed` transportieren.
- Nach erfolgreichem Resume sendet der Server dem zurueckkehrenden Client einen passenden Snapshot fuer Lobby, aktive Frage, Reveal, Rangliste oder Endstand.
- Bei einem Player kann `currentAnswer` mitkommen, damit eine schon gesendete Antwort lokal wieder erkennbar bleibt.
- In Reveal und Rangliste sendet der Server die letzten `playerResults` erneut, damit richtig/falsch und Punkte auch nach Reload sichtbar bleiben.
- Der Host bekommt bei Spielstart, Frage-Snapshot und Endstand jetzt auch `totalQuestionCount`, damit Fortschritt nicht lokal geraten werden muss.

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
8. Server sendet `question:reveal` mit richtiger Antwort und Rundenergebnissen
9. Server zeigt die Aufloesung kurz an
10. Server sendet `score:update`
11. Player senden `next-question:ready`
12. Server sendet `next-question:ready-progress`
13. Sobald alle verbundenen Spieler bereit sind, sendet der Server entweder die naechste `question:show` oder `game:finished`

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

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
- Display, Host und Player senden Absichten, keine Wahrheiten.
- Ungueltige oder unpassende Payloads werden abgewiesen.
- Das Protokoll deckt nur Lobby und den vorbereiteten Quiz-Kernfluss ab.

## Wire-Format

```json
{
  "event": "display:create-room",
  "payload": {}
}
```

## Rollenrechte

### Display darf senden

- `connection:resume`
- `display:create-room`

### Host darf senden

- `connection:resume`
- `host:connect`
- `room:settings:update`
- `game:start`
- `game:next-question` als sichtbarer Host-Override nach der Rangliste
- `question:force-close`
- `game:show-scoreboard`
- `game:finish-now`
- `player:remove`
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
| `display:create-room` | Display -> Server | Primaeren 3-UI-Raum anlegen | optional `clientInfo` |
| `display:room-created` | Server -> Display | Display-Raum wurde erstellt | `roomId`, `displaySessionId`, `displayToken`, `joinCode`, `hostToken` |
| `display:host-paired` | Server -> Display | Host wurde mit Display-Raum verbunden | `hostConnected` |
| `host:connect` | Host -> Server | Host per Display-Token verbinden | `hostToken`, optional `clientInfo` |
| `host:connected` | Server -> Host | Host-Verbindung bestaetigt | `roomId`, `hostSessionId`, `joinCode`, `roomState`, optional `gameState` |
| `catalog:summary` | Server -> Host | Verfuegbare Kategorien und Fragetypen fuer Spielplaene | `totalQuestions`, `maxQuestionCount`, `categories`, `questionTypes` |
| `room:settings:update` | Host -> Server | Lobby-Einstellungen setzen | `roomId`, `showAnswerTextOnPlayerDevices`, optional `gamePlanDraft` |
| `room:join` | Player -> Server | Raum per Join-Code betreten | `joinCode`, `playerName`, optional `sessionId` |
| `player:joined` | Server -> Player | Join bestaetigt | `roomId`, `playerId`, `sessionId`, `playerState`, `roomState` |
| `player:remove` | Host -> Server | Spieler aus dem Raum entfernen | `roomId`, `playerId` |
| `room:close` | Host -> Server | Raum beenden | `roomId` |
| `room:closed` | Server -> Display/Host/Player | Raum ist endgueltig zu | `roomId`, `roomState` |

### Lobby und Verbindungssicht

| Event | Richtung | Zweck | Kernfelder |
| --- | --- | --- | --- |
| `lobby:update` | Server -> Display/Host/Player | Autoritativer Lobby-Snapshot ohne Tokens | `roomId`, `roomState`, `hostConnected`, `displayConnected`, `settings`, `players`, `playerCount` |
| `player:reconnected` | Server -> Host/Player | Bisheriger Spieler ist wieder da | `roomId`, `playerId`, `playerState`, `connected` |
| `player:disconnected` | Server -> Host/Player | Spieler ist temporaer weg | `roomId`, `playerId`, `playerState`, `connected` |

### Spielablauf

| Event | Richtung | Zweck | Kernfelder |
| --- | --- | --- | --- |
| `game:start` | Host -> Server | Quiz mit finalem Spielplan starten | `roomId`, `gamePlan` |
| `game:started` | Server -> Display/Host/Player | Spiel ist gestartet | `roomId`, `roomState`, `gameState`, `questionIndex`, `totalQuestionCount`, `resolvedGamePlan` |
| `question:countdown` | Server -> Display/Host/Player | Kurzer Show-Countdown vor einer Frage | `roomId`, `questionId`, `questionIndex`, `totalQuestionCount`, `countdownMs`, `gameState` |
| `question:show` | Server -> Display/Host | Vollstaendige Frage freigeben | `roomId`, `questionId`, `questionIndex`, `totalQuestionCount`, `type`, `text`, je nach Typ `options`/`items`/`unit`/`context`, `durationMs`, `gameState`, optional `isDemoQuestion` |
| `question:controller` | Server -> Player | Reduzierte Controller-Daten freigeben | `roomId`, `questionId`, `questionIndex`, `totalQuestionCount`, `type`, je nach Typ Options-/Item-IDs, optional Antworttexte oder `unit`, `durationMs`, `gameState`, optional `isDemoQuestion` |
| `question:timer` | Server -> Display/Host/Player | Verbleibende Fragezeit anzeigen | `roomId`, `questionId`, `remainingMs` |
| `answer:submit` | Player -> Server | Antwort auf aktive Frage senden | `roomId`, `questionId`, `playerId`, `answer`, `requestId` |
| `answer:accepted` | Server -> Player | Antwort wurde gespeichert | `roomId`, `questionId`, `playerId`, `status` |
| `answer:rejected` | Server -> Player | Antwort wurde nicht gewertet | `roomId`, `questionId`, `playerId`, `status`, `reason` |
| `answer:progress` | Server -> Display/Host | Anzahl eingegangener Antworten | `roomId`, `questionId`, `answeredCount`, `totalEligiblePlayers` |
| `question:close` | Server -> Display/Host/Player | Frage ist gesperrt | `roomId`, `questionId`, `gameState` |
| `question:force-close` | Host -> Server | Aktive Frage sofort schliessen | `roomId` |
| `question:reveal` | Server -> Display/Host/Player | Richtige Antwort und Rundenergebnisse zeigen | `roomId`, `questionId`, `correctAnswer`, `playerResults`, `gameState`, optional `explanation` |
| `score:update` | Server -> Display/Host/Player | Punktestand nach der Runde | `roomId`, `questionId`, `scoreboard`, `scoreChanges`, `gameState` |
| `next-question:ready` | Player -> Server | Spieler ist nach der Rangliste bereit fuer die naechste Frage | `roomId`, `questionId`, `playerId` |
| `next-question:ready-progress` | Server -> Display/Host/Player | Bereitschaft fuer die naechste Frage anzeigen | `roomId`, `questionId`, `readyCount`, `totalEligiblePlayers`, `readyPlayerIds`, `gameState` |
| `game:next-question` | Host -> Server | Host-Override zum Wechseln nach der Rangliste | `roomId` |
| `game:show-scoreboard` | Host -> Server | Reveal ueberspringen und Rangliste zeigen | `roomId` |
| `game:finish-now` | Host -> Server | Spiel mit aktuellem Stand beenden | `roomId` |
| `game:finished` | Server -> Display/Host/Player | Quiz ist zu Ende | `roomId`, `roomState`, `gameState`, `totalQuestionCount`, `finalScoreboard`, optional `finalStats` |

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
- Player erhalten waehrend aktiver Fragen `question:controller` statt `question:show`; der vollstaendige Fragetext bleibt auf Display und Host.
- Antworttexte auf Player-Geraeten sind eine Lobby-Einstellung und standardmaessig aus.
- Antwortformen sind `option`, `number`, `ranking` und `text`; Mehrheits-Reveals koennen als `correctAnswer: { type: "options", value: [...] }` mehrere Gewinneroptionen enthalten.

### Timer

- Der Server sendet `question:timer`.
- Die Client-Anzeige darf weich laufen, ist aber nicht die Wahrheitsquelle.
- `question:close` ist das massgebliche Signal fuer "zu spaet".
- Die aktive Antwortzeit kommt aus dem serverseitig validierten `resolvedGamePlan`.

### Bereit fuer die naechste Frage

- Nach `score:update` bleiben Display, Host und Player auf der Rangliste.
- Jeder verbundene Spieler sendet `next-question:ready` ueber sein Handy.
- Der Server sendet `next-question:ready-progress` an Display, Host und Player.
- Sobald alle verbundenen Spieler bereit sind, startet der Server automatisch die naechste Frage oder beendet das Spiel.
- Disconnectete Spieler blockieren den Wechsel nicht.
- Der Host kann nach `score:update` manuell weiterschalten, falls ein Handy haengen bleibt.

### Reconnect

- Sessions werden mit `sessionId` wiedererkannt.
- Disconnects werden fuer kurze Zeit toleriert.
- `connection:resumed` kann inzwischen auch `in_game` und `completed` transportieren.
- Nach erfolgreichem Resume sendet der Server dem zurueckkehrenden Client einen passenden Snapshot fuer Lobby, aktive Frage, Reveal, Rangliste oder Endstand.
- Beim Player-Resume wird der aktuelle Fragen-Snapshot weiterhin als `question:controller` gesendet, nicht als Host-Vollfrage.
- Bei einem Player kann `currentAnswer` mitkommen, damit eine schon gesendete Antwort lokal wieder erkennbar bleibt.
- In Reveal und Rangliste sendet der Server die letzten `playerResults` erneut, damit richtig/falsch und Punkte auch nach Reload sichtbar bleiben.
- Der Host bekommt bei Spielstart, Frage-Snapshot und Endstand jetzt auch `totalQuestionCount`, damit Fortschritt nicht lokal geraten werden muss.

## Typische Eventfolgen

### Raum erstellen und joinen

1. Server sendet `connection:ack`
2. Display sendet `display:create-room`
3. Server sendet `display:room-created`
4. Host sendet `host:connect`
5. Server sendet `host:connected`
6. Server sendet `catalog:summary` an den Host
7. Player sendet `room:join`
8. Server sendet `player:joined`
9. Server verteilt `lobby:update`

### Spielrunde

1. Host sendet `game:start` mit finalem `gamePlan`
2. Server sendet `game:started`
3. Bei hohem Show-Level sendet der Server kurz `question:countdown`
4. Server sendet `question:show` an Display und Host und `question:controller` an Player
5. Server sendet waehrenddessen `question:timer`
6. Player senden `answer:submit`
7. Server antwortet mit `answer:accepted` oder `answer:rejected`
8. Server sendet `question:close`
9. Server sendet `question:reveal` mit richtiger Antwort und Rundenergebnissen
10. Server zeigt die Aufloesung gemaess Spielplan kurz an
11. Server sendet `score:update`
12. Player senden `next-question:ready`
13. Server sendet `next-question:ready-progress`
14. Sobald alle verbundenen Spieler bereit sind, sendet der Server entweder die naechste Frage (`question:show`/`question:controller`) oder `game:finished`

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

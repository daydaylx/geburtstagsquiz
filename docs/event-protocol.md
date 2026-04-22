# event-protocol.md

# Quiz Dual Screen – Event-Protokoll

## Zweck

Dieses Dokument definiert die Echtzeitkommunikation zwischen:

- **Host Client**
- **Player Client**
- **Server**

Das Protokoll ist die verlässliche Grundlage für:

- Join-Flow
- Lobby-Synchronisation
- Spielstart
- Fragenwechsel
- Antwortabgabe
- Auswertung
- Ranglisten-Updates
- Reconnect
- Fehlermeldungen

Wichtig:
Der **Server bleibt die einzige Wahrheit**.
Clients senden Absichten und Eingaben.
Der Server prüft, akzeptiert, lehnt ab und verteilt den gültigen Zustand.

---

## Grundprinzipien

### 1. Der Server ist authoritative

Clients dürfen:

- Events senden
- lokale UI aktualisieren
- Zustandswechsel visuell darstellen

Clients dürfen **nicht** final entscheiden über:

- gültige Raumzustände
- Antwortannahme
- Rundenende
- Punkte
- Rangliste
- Buzzer-Reihenfolge

---

### 2. Events sind explizit und typisiert

Jedes Event muss klar definieren:

- **wer sendet**
- **wer empfängt**
- **wann es erlaubt ist**
- **welche Payload erwartet wird**
- **welche Antwort oder Folgeevents entstehen**

---

### 3. Ungültige Events werden abgewiesen

Typische Gründe:

- falscher Raumstatus
- falscher Spielstatus
- unvollständige Payload
- doppeltes Senden
- verspätete Eingabe
- nicht autorisierte Aktion
- unbekannter Spieler / Raum / Fragekontext

Ein invalides Event darf nie stillschweigend Spiellogik verändern.

---

### 4. Zustandsupdates gehen vom Server aus

Clients dürfen zwar lokal reagieren, aber der relevante Zustand wird erst durch Server-Events verbindlich.

Beispiel:

- Player sendet `answer:submit`
- UI kann lokal „wird gesendet" anzeigen
- gültig angenommen ist die Antwort aber erst nach `answer:accepted`

---

## Event-Namensräume

Zur Konsistenz werden Events in Gruppen organisiert:

- `room:*`
- `host:*`
- `player:*`
- `lobby:*`
- `game:*`
- `question:*`
- `answer:*`
- `score:*`
- `connection:*`
- `error:*`

---

## Gemeinsame Payload-Felder

Viele Events verwenden wiederkehrende Felder.

### Basisfelder

- `roomId`
- `joinCode`
- `playerId`
- `sessionId`
- `questionId`
- `gameId`
- `timestamp`
- `requestId`

### Hinweise

- `timestamp` ist informativ, aber **nicht** die Wahrheitsquelle für Spiellogik
- `requestId` kann helfen, UI-Roundtrips oder Dubletten nachzuvollziehen
- `sessionId` dient der Wiedererkennung bei Reconnect
- `playerId` wird serverseitig vergeben oder bestätigt

---

# Verbindungs- und Sitzungsfluss

## 1. Verbindungsaufbau

Ein Client verbindet sich zunächst technisch mit dem Server.
Danach beginnt die semantische Anmeldung als Host oder Player.

### Typischer Ablauf

1. WebSocket-Verbindung wird aufgebaut
2. Server bestätigt Verbindung technisch
3. Client sendet Host- oder Join-Event
4. Server prüft Raum- oder Spielerkontext
5. Server sendet bestätigendes Event oder Fehler

---

## 2. Reconnect-Grundsatz

Ein Reconnect ist **kein neuer Spieler**, wenn die Sitzung wiedererkannt wird.

Dafür wird eine Form von stabiler Sitzungsidentifikation benötigt, z. B.:

- `sessionId`
- gespeicherte Player-Zuordnung
- serverseitige Reconnect-Logik

Reconnect darf nicht versehentlich zu:

- doppelten Spielern
- doppelten Antworten
- kaputten Lobbys
- falschen Punkteständen

führen.

---

# Events im Detail

---

## `connection:ack`

### Richtung

- **Server → Client**

### Zweck

Technische Bestätigung, dass die Socket-Verbindung steht.

### Payload

```json
{
  "connectionId": "string",
  "serverTime": "string"
}
```

### Hinweise

- rein technisch
- noch keine Bestätigung für Raum- oder Spielteilnahme
- kann für Debugging und UI-Initialisierung genutzt werden

---

## `connection:resume`

### Richtung

- **Client → Server**

### Zweck

Versuch, eine bestehende Sitzung wieder aufzunehmen.

### Payload

```json
{
  "sessionId": "string",
  "roomId": "string"
}
```

### Erlaubt wenn

- Client hatte vorher bereits eine bekannte Sitzung
- Raum ist noch existent
- Server kann die Sitzung zuordnen

### Erfolg

Server sendet typischerweise:

- `player:reconnected`
- und/oder aktuelle Raum-/Spielzustände

### Fehlerfälle

- Sitzung unbekannt
- Raum nicht mehr vorhanden
- Sitzung ungültig oder abgelaufen

Dann folgt ein `error:protocol` oder eine Aufforderung zum normalen Join-Flow.

---

## `room:create`

### Richtung

- **Host → Server**

### Zweck

Host fordert die Erstellung eines neuen Raums an.

### Payload

```json
{
  "hostName": "string",
  "clientInfo": {
    "deviceType": "string",
    "appVersion": "string"
  }
}
```

### Erlaubt wenn

- Verbindung steht
- Client ist noch keinem aktiven Raum als Host zugeordnet

### Erfolg

Server erstellt:

- `roomId`
- `joinCode`
- initialen Raumzustand

und antwortet mit:

- `room:created`

### Fehlerfälle

- Host ist bereits an einen aktiven Raum gebunden
- Server kann keinen Raum anlegen
- Payload ist unvollständig oder ungültig

---

## `room:created`

### Richtung

- **Server → Host**

### Zweck

Bestätigung, dass der Raum erstellt wurde.

### Payload

```json
{
  "roomId": "string",
  "joinCode": "string",
  "roomState": "waiting",
  "hostSessionId": "string"
}
```

### Folge

Host kann nun:

- Lobby anzeigen
- QR-Code rendern
- auf Player-Joins warten

---

## `room:join`

### Richtung

- **Player → Server**

### Zweck

Spieler versucht, einem Raum beizutreten.

### Payload

```json
{
  "joinCode": "string",
  "playerName": "string",
  "sessionId": "string | null"
}
```

### Erlaubt wenn

- Raum existiert
- Raum erlaubt Beitritt
- Name ist gültig
- Sitzung ist neu oder korrekt wiedererkennbar

### Erfolg

Server sendet:

- `player:joined` an diesen Player
- `lobby:update` an Host und ggf. andere relevante Clients

### Fehlerfälle

- Join-Code unbekannt
- Raum geschlossen
- Raum läuft und erlaubt keinen Beitritt
- Name ungültig oder leer
- Name kollidiert mit Regeln, falls Namenseindeutigkeit erzwungen wird

---

## `player:joined`

### Richtung

- **Server → Player**

### Zweck

Bestätigung des erfolgreichen Beitritts.

### Payload

```json
{
  "roomId": "string",
  "playerId": "string",
  "sessionId": "string",
  "playerState": "connected",
  "roomState": "waiting"
}
```

### Folge

Player darf:

- Warteraum / Lobby-Status sehen
- auf Spielstart warten

---

## `lobby:update`

### Richtung

- **Server → Host**
- optional auch **Server → Player**

### Zweck

Aktualisierung des Lobbyzustands.

### Payload

```json
{
  "roomId": "string",
  "roomState": "waiting",
  "players": [
    {
      "playerId": "string",
      "name": "string",
      "connected": true,
      "score": 0
    }
  ],
  "playerCount": 3
}
```

### Wird gesendet bei

- neuem Join
- Disconnect
- Reconnect
- Kick / Entfernen
- Namensänderung, falls später erlaubt
- Startwechseln relevanter Lobbystati

### Hinweise

- Host soll daraus seine Lobby rendern
- Falls Player ebenfalls Lobby sehen, kann dasselbe Event verwendet werden

---

## `player:reconnected`

### Richtung

- **Server → Host**
- **Server → betroffener Player**
- optional an weitere Clients

### Zweck

Meldet, dass ein bekannter Spieler erfolgreich zurück ist.

### Payload

```json
{
  "roomId": "string",
  "playerId": "string",
  "playerState": "reconnected",
  "connected": true
}
```

### Hinweise

- kein neuer Spieler
- keine neue Score-Instanz
- kein neuer Lobby-Eintrag

---

## `player:disconnected`

### Richtung

- **Server → Host**
- optional an relevante Clients

### Zweck

Meldet temporären Verbindungsverlust eines Spielers.

### Payload

```json
{
  "roomId": "string",
  "playerId": "string",
  "playerState": "disconnected",
  "connected": false
}
```

### Hinweise

- Spieler wird nicht sofort endgültig entfernt
- konkrete Timeout- oder Cleanup-Strategie ist Sache der State-Machine

---

## `game:start`

### Richtung

- **Host → Server**

### Zweck

Host will das Spiel starten.

### Payload

```json
{
  "roomId": "string"
}
```

### Erlaubt wenn

- Sender ist Host dieses Raums
- Raum ist im Zustand `waiting`
- Mindestanzahl Spieler erfüllt
- Spiel ist noch nicht aktiv

### Erfolg

Server wechselt den Raum-/Spielzustand und sendet:

- `game:started`
- danach typischerweise `question:show`

### Fehlerfälle

- zu wenige Spieler
- Spiel läuft bereits
- Host nicht autorisiert
- Raumstatus falsch

---

## `game:started`

### Richtung

- **Server → Host**
- **Server → Player**

### Zweck

Verbindliche Information, dass das Spiel gestartet hat.

### Payload

```json
{
  "roomId": "string",
  "roomState": "in_game",
  "gameState": "idle",
  "questionIndex": 0
}
```

### Hinweise

- Clients wechseln von Lobby in Spielmodus
- noch nicht zwingend Frage sichtbar, je nach Fluss folgt direkt `question:show`

---

## `question:show`

### Richtung

- **Server → Host**
- **Server → Player**

### Zweck

Eine neue Frage wird freigegeben.

### Payload für Host

```json
{
  "roomId": "string",
  "questionId": "string",
  "questionIndex": 0,
  "type": "multiple_choice",
  "text": "string",
  "options": [
    { "id": "A", "label": "string" },
    { "id": "B", "label": "string" },
    { "id": "C", "label": "string" },
    { "id": "D", "label": "string" }
  ],
  "durationMs": 15000,
  "gameState": "question_active"
}
```

### Payload für Player

Im MVP identisch oder leicht reduziert:

```json
{
  "roomId": "string",
  "questionId": "string",
  "questionIndex": 0,
  "type": "multiple_choice",
  "text": "string",
  "options": [
    { "id": "A", "label": "string" },
    { "id": "B", "label": "string" },
    { "id": "C", "label": "string" },
    { "id": "D", "label": "string" }
  ],
  "durationMs": 15000,
  "gameState": "question_active"
}
```

### Hinweise

- Startzeit und Sperrlogik bleiben serverseitig maßgeblich
- Client darf UI-Countdown zeigen, aber nicht die Wahrheit bestimmen

---

## `question:timer`

### Richtung

- **Server → Host**
- **Server → Player**

### Zweck

Synchronisations-Event für laufende Fragezeit. Wird alle 500ms gesendet, solange eine Frage aktiv ist (Game State = `question_active`).

### Payload

```json
{
  "roomId": "string",
  "questionId": "string",
  "remainingMs": 9200
}
```

### Hinweise

- wird genau alle 500ms gesendet, nicht öfter, nicht seltener
- Clients dürfen lokal interpolieren für flüssige Anzeige, aber nicht als Wahrheitsquelle nutzen
- das `question:close`-Event (nicht das letzte Timer-Event) ist die maßgebliche Sperrung

---

## `answer:submit`

### Richtung

- **Player → Server**

### Zweck

Spieler sendet eine Antwort auf die aktive Frage.

### Payload

```json
{
  "roomId": "string",
  "questionId": "string",
  "playerId": "string",
  "answer": {
    "type": "option",
    "value": "A"
  },
  "requestId": "string"
}
```

### Erlaubt wenn

- Raum aktiv
- Frage aktiv
- Spieler ist gültig
- Spieler gehört zum Raum
- Spieler hat noch keine gültige Antwort abgegeben
- Antwortformat passt zum Fragetyp

### Erfolg

Server sendet:

- `answer:accepted` an diesen Player
- optional `answer:status` oder aktualisierte Antwortanzahl an Host

### Fehlerfälle

- Frage nicht aktiv
- falsches `questionId`
- doppelte Antwort
- ungültiger Spieler
- verspätete Antwort
- ungültiges Antwortformat

---

## `answer:accepted`

### Richtung

- **Server → Player**

### Zweck

Bestätigung, dass die Antwort gültig angenommen wurde.

### Payload

```json
{
  "roomId": "string",
  "questionId": "string",
  "playerId": "string",
  "status": "accepted"
}
```

### Hinweise

- erst hier darf die UI sicher „Antwort gespeichert" anzeigen
- keine Aussage darüber, ob die Antwort korrekt war

---

## `answer:rejected`

### Richtung

- **Server → Player**

### Zweck

Antwort wurde nicht akzeptiert.

### Payload

```json
{
  "roomId": "string",
  "questionId": "string",
  "playerId": "string",
  "status": "rejected",
  "reason": "duplicate | late | invalid_payload | invalid_state | unauthorized"
}
```

### Hinweise

- UI muss klar machen, dass die Antwort nicht zählt
- besonders wichtig bei Doppel-Klicks oder verspäteter Eingabe

---

## `answer:progress`

### Richtung

- **Server → Host**

### Zweck

Host sieht, wie viele Spieler bereits geantwortet haben.

### Payload

```json
{
  "roomId": "string",
  "questionId": "string",
  "answeredCount": 2,
  "totalEligiblePlayers": 4
}
```

### Hinweise

- keine Offenlegung individueller Antworten
- nur Fortschrittsanzeige

---

## `question:close`

### Richtung

- **Server → Host**
- **Server → Player**

### Zweck

Frage ist offiziell geschlossen, Eingaben sind gesperrt.

### Payload

```json
{
  "roomId": "string",
  "questionId": "string",
  "gameState": "answer_locked"
}
```

### Wird ausgelöst durch

- Timerende
- alle Antworten vorhanden
- Host-Aktion, falls später erlaubt und regelkonform

### Hinweise

- nach diesem Event dürfen keine Antworten mehr akzeptiert werden
- verspätete `answer:submit` müssen abgewiesen werden

---

## `question:reveal`

### Richtung

- **Server → Host**
- optional **Server → Player**

### Zweck

Zeigt die Auflösung der Frage.

### Payload

```json
{
  "roomId": "string",
  "questionId": "string",
  "correctAnswer": {
    "type": "option",
    "value": "C"
  },
  "gameState": "revealing"
}
```

### Optional erweiterbar

- Liste der richtigen Spieler
- Statistik der Antwortverteilung

Aber im MVP sparsam halten.

---

## `score:update`

### Richtung

- **Server → Host**
- **Server → Player**

### Zweck

Aktualisierung des Punktestands nach einer Runde.

### Payload

```json
{
  "roomId": "string",
  "questionId": "string",
  "scoreboard": [
    {
      "playerId": "string",
      "name": "string",
      "score": 100
    },
    {
      "playerId": "string",
      "name": "string",
      "score": 50
    }
  ],
  "gameState": "scoreboard"
}
```

### Hinweise

- nur der Server berechnet diesen Stand
- Clients übernehmen den Stand, sie erzeugen ihn nicht

---

## `game:next-question`

### Richtung

- **Host → Server**

### Zweck

Host will zur nächsten Frage übergehen.

### Payload

```json
{
  "roomId": "string"
}
```

### Erlaubt wenn

- Sender ist Host
- aktuelle Frage ist abgeschlossen
- Spiel befindet sich im passenden Zustand, z. B. `scoreboard` oder `revealing`

### Erfolg

Server sendet:

- neue `question:show`
- oder `game:finished`, wenn keine Fragen mehr übrig sind

### Fehlerfälle

- Zustand nicht passend
- Host nicht autorisiert
- keine weitere Frage vorhanden

---

## `game:finished`

### Richtung

- **Server → Host**
- **Server → Player**

### Zweck

Spiel ist beendet.

### Payload

```json
{
  "roomId": "string",
  "roomState": "completed",
  "gameState": "completed",
  "finalScoreboard": [
    {
      "playerId": "string",
      "name": "string",
      "score": 180
    }
  ]
}
```

### Folge

Clients wechseln in Endzustand / Endscreen.

---

## `room:close`

### Richtung

- **Host → Server**
- oder **Server → Clients** als Folge

### Zweck

Raum wird beendet / geschlossen.

### Payload

```json
{
  "roomId": "string"
}
```

### Hinweise

- Host oder Server kann Schließung auslösen
- wenn Host aktiv beendet, sendet der Server finalen Schließungszustand an alle

---

## `room:closed`

### Richtung

- **Server → Host**
- **Server → Player**

### Zweck

Raum wurde endgültig geschlossen.

### Payload

```json
{
  "roomId": "string",
  "roomState": "closed"
}
```

### Folge

- Clients verlassen Spielkontext
- keine weiteren Spiel-Events mehr zulässig

---

# Fehlerprotokoll

## `error:protocol`

### Richtung

- **Server → Client**

### Zweck

Allgemeiner Fehler bei ungültigem Event oder unzulässigem Zustand.

### Payload

```json
{
  "code": "string",
  "message": "string",
  "context": {
    "event": "string",
    "roomId": "string | null",
    "questionId": "string | null"
  }
}
```

### Typische Fehlercodes

- `ROOM_NOT_FOUND`
- `ROOM_CLOSED`
- `INVALID_JOIN_CODE`
- `INVALID_PAYLOAD`
- `INVALID_STATE`
- `NOT_AUTHORIZED`
- `QUESTION_NOT_ACTIVE`
- `ANSWER_ALREADY_SUBMITTED`
- `ANSWER_TOO_LATE`
- `SESSION_NOT_FOUND`
- `PLAYER_NOT_FOUND`

### Hinweise

- Fehlercodes sollen maschinenlesbar und stabil sein
- `message` darf UI-freundlicher sein, aber nicht die einzige Quelle für Logik

---

# MVP-Eventfluss

## A. Raum erstellen und Lobby

1. Client verbindet sich
2. Server sendet `connection:ack`
3. Host sendet `room:create`
4. Server sendet `room:created`
5. Player sendet `room:join`
6. Server sendet `player:joined`
7. Server sendet `lobby:update`
8. weitere Joins aktualisieren erneut `lobby:update`

---

## B. Spielstart

1. Host sendet `game:start`
2. Server prüft Voraussetzungen
3. Server sendet `game:started`
4. Server sendet `question:show`

---

## C. Frage beantworten

1. Player sendet `answer:submit`
2. Server validiert
3. Server sendet `answer:accepted` oder `answer:rejected`
4. Server sendet optional `answer:progress` an Host
5. Wenn Zeit abläuft oder alle geantwortet haben:
   - Server sendet `question:close`
6. Server wertet aus
7. Server sendet `question:reveal`
8. Server sendet `score:update`

---

## D. Nächste Frage

1. Host sendet `game:next-question`
2. Server prüft Zustand
3. Server sendet nächste `question:show`
4. wenn keine Frage mehr übrig:
   - Server sendet `game:finished`

---

# Autorisierungsregeln nach Rolle

## Host darf senden

- `room:create`
- `game:start`
- `game:next-question`
- `room:close`

## Player darf senden

- `room:join`
- `connection:resume`
- `answer:submit`

## Server darf senden

- alle bestätigenden und zustandsverändernden Events
- alle Fehler-Events
- alle Raum-, Spiel-, Frage- und Score-Updates

---

# Regeln gegen Dubletten und Chaos

## 1. Antworten sind idempotent kontrolliert zu behandeln

Wenn ein Player mehrfach dieselbe Frage beantwortet:

- erste gültige Antwort zählt
- spätere Antworten werden abgewiesen

## 2. Events mit falschem Kontext werden ignoriert oder abgewiesen

Beispiel:

- Antwort auf alte `questionId`
- Join in geschlossenen Raum
- `game:start` durch Nicht-Host

## 3. Reihenfolge zählt nur serverseitig

Weder Host noch Player dürfen lokale Reihenfolgen als Wahrheit behandeln.

## 4. Clients dürfen spekulativ anzeigen, aber nicht final werten

Zum Beispiel:

- Button nach Absenden deaktivieren: okay
- Antwort als sicher akzeptiert markieren ohne Server: nicht okay

---

# Nicht-Ziele des ersten Protokolls

Dieses Dokument deckt **nicht** vollständig ab:

- Teammodus
- Joker
- Chat
- Persistenz-Events
- Admin-/Moderationsfunktionen
- komplexe Buzzer-Sonderregeln
- Quiz-Editor / Import-Workflows
- Benutzerkonten

Wenn solche Systeme später kommen, soll das Protokoll gezielt erweitert werden, nicht chaotisch verwässert.

---

# Empfehlungen für die Implementierung

## 1. Eventnamen zentral definieren

Keine frei zusammengetippten Strings in mehreren Apps.

## 2. Payloads schema-validieren

Mindestens serverseitig verpflichtend.
Clientseitig zusätzlich sinnvoll für defensive Robustheit.

## 3. Server-Antworten explizit halten

Nicht stillschweigend Zustände ändern, die der Client erraten muss.

## 4. Fehler klar benennen

Lieber ein sauberer `error:protocol` mit stabilem Code als stilles Scheitern.

## 5. MVP klein halten

Erst sauberer Fluss für:

- Raum
- Lobby
- eine Frage
- Antwort
- Reveal
- Score

Dann erst Erweiterung.

---

# Zusammenfassung

Das Event-Protokoll folgt vier nicht verhandelbaren Regeln:

1. **Server entscheidet**
2. **Events sind klar benannt und typisiert**
3. **Ungültige Zustände werden aktiv abgefangen**
4. **Der MVP bleibt klein und diszipliniert**

Wenn das eingehalten wird, bleibt die Echtzeitlogik beherrschbar.

Wenn nicht, entsteht das übliche Multiplayer-Chaos:
doppelte Wahrheiten, inkonsistente Events, kaputte Zustände und Debugging-Müll.

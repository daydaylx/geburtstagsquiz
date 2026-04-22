# state-machine.md

# Quiz Dual Screen – Zustandsmaschine

## Zweck

Dieses Dokument definiert alle Zustände und ihre erlaubten Übergänge im System.

Eine saubere Zustandsmaschine verhindert:

- Race Conditions
- unmögliche Zustands-Kombinationen
- verwirrte Spieler durch inkonsistente Zustände
- Bugs bei Disconnect/Reconnect

---

## Systemebenen

Das System hat **drei unabhängige, aber koordinierte Zustandsmaschinen:**

1. **Room State** – Gesamtzustand einer Spiel-Sitzung
2. **Game State** – Ablauf innerhalb eines Spiels
3. **Player State** – Status jedes einzelnen Spielers

Alle drei müssen konsistent sein.

---

## 1. Room State

Der Raum ist die höchste Zustandsebene.

### Zustände

```
┌─────────┐
│ created │  (neuer Raum, wartet auf Host-Bestätigung)
└────┬────┘
     │ (Host öffnet Host-Seite)
     ↓
┌─────────────┐
│   waiting   │  (Host bereit, Players können joinen, Spiel startet nicht)
└────┬────┬───┘
     │    │
     │    └─── (Host klickt "Spiel starten", Spieler > 0)
     │         ↓
     │    ┌─────────┐
     │    │ in_game │  (Spiel läuft, Fragen werden gestellt)
     │    └────┬────┘
     │         │ (letzte Frage beendet)
     │         ↓
     │    ┌──────────┐
     │    │completed │  (Spiel zu Ende, Rangliste anzeigen)
     │    └────┬─────┘
     │         │ (Host klickt "neues Spiel" oder Raum wird gelöscht)
     │         ↓
     │    ┌────────┐
     │    │ closed │
     │    └────────┘
     │
     └─── (Raum verfällt nach Timeout oder Host erzeugt neuen)
          ↓
     ┌────────┐
     │ closed │
     └────────┘
```

### Detaillierte Übergänge

#### `created` → `waiting`

**Auslöser:** Host öffnet Host-Client-Seite

**Bedingung:**

- Raum wurde gerade durch Server erstellt
- Host-Connection ist vorhanden

**Server-Aktion:**

- Raum-Status auf `waiting` setzen
- Join-Code erzeugen
- QR-Code generieren
- Host und Player können nun Events senden

---

#### `waiting` → `in_game`

**Auslöser:** Host sendet `game:start`

**Bedingung:**

- Raum ist im Status `waiting`
- mindestens 1 Spieler verbunden
- Quiz existiert

**Server-Aktion:**

- Raum-Status auf `in_game` setzen
- Game State auf `idle` setzen
- erste Frage laden
- `game:started` Event an alle senden

---

#### `in_game` → `completed`

**Auslöser:** letzte Frage wurde beantwortet und ausgewertet

**Bedingung:**

- Game State ist `scoreboard`
- currentQuestionIndex >= totalQuestions

**Server-Aktion:**

- Raum-Status auf `completed` setzen
- finale Rankings berechnen
- `game:completed` Event an alle senden

---

#### `waiting` / `in_game` → `closed`

**Auslöser:**

- Host klickt explizit „Raum löschen"
- oder Raum ist > 120 Minuten aktiv (Cleanup-Timeout)
- oder letzte Aktivität > 30 Minuten her (Inaktivitäts-Timeout)

**Server-Aktion:**

- alle Player-Connections trennen
- Raum aus Memory löschen
- `room:closed` Event an alle (die noch verbunden sind)

---

#### `any state` → Fehler

**Unerlaubte Übergänge:**

- `completed` → `waiting` ❌ (Raum kann nicht neu starten ohne neuen Raum)
- `closed` → `waiting` ❌ (geschlossener Raum ist final)
- `in_game` → `created` ❌ (keine Regression)
- `waiting` → `in_game` → `waiting` ❌ (Spiel kann nicht unterbrochen werden)

**Fehlerbehandlung:**
Wenn Client Event sendet, das diesen Übergängen widerspricht:

- Server antwortet mit `error: INVALID_GAME_STATE`

---

## 2. Game State

Der Game State beschreibt den **Spielablauf innerhalb eines laufenden Spiels**.

### Zustände

```
┌──────┐
│ idle │  (Spiel gestartet, erste Frage wird geladen)
└───┬──┘
    │ (Frage zu Clients gesendet)
    ↓
┌──────────────────┐
│ question_active  │  (Timer läuft, Player können antworten)
└───┬──────────────┘
    │ (Timer abgelaufen ODER alle haben geantwortet)
    ↓
┌─────────────────┐
│ answer_locked   │  (Eingaben gesperrt, Server wertet aus)
└───┬─────────────┘
    │ (Ergebnis berechnet)
    ↓
┌───────────┐
│ revealing │  (richtige Antwort wird gezeigt)
└───┬───────┘
    │ (Scores werden angezeigt)
    ↓
┌─────────────┐
│ scoreboard  │  (Rangliste sichtbar für diese Runde)
└───┬─────────┘
    │
    ├─ (nächste Frage existiert) → zurück zu idle
    │
    └─ (letzte Frage war das) → Room State = completed
```

### Detaillierte Übergänge

#### `idle` → `question_active`

**Auslöser:** Server sendet nächste Frage

**Bedingung:**

- Raum ist im Status `in_game`
- nächste Frage existiert (currentQuestionIndex < totalQuestions)

**Server-Aktion:**

- Game State auf `question_active` setzen
- `question:show` Event an alle Clients
- Timer starten (serverseitig!)
- Timer-Ticks an Clients senden (alle 500ms)

---

#### `question_active` → `answer_locked`

**Auslöser:**

- Server-Timer für diese Frage läuft ab
- ODER Host sendet manuell „Antworten schließen"

**Bedingung:**

- Game State ist `question_active`
- Timer ist abgelaufen oder Host-Action

**Server-Aktion:**

- Game State auf `answer_locked` setzen
- `answer:locked` Event an alle senden
- neue `answer:submit` Events ablehnen mit `error: ANSWER_TOO_LATE`
- Auswertung beginnen

---

#### `answer_locked` → `revealing`

**Auslöser:** Server hat alle Antworten validiert und Punkte berechnet

**Bedingung:**

- Game State ist `answer_locked`
- alle Antworten sind verarbeitet

**Server-Aktion:**

- Game State auf `revealing` setzen
- `round:reveal` Event mit korrekter Antwort
- `round:scores` Event mit Ergebnissen und Rangliste

---

#### `revealing` → `scoreboard`

**Auslöser:** nach kurzem Delay (z.B. 2 Sekunden zum Lesen)

**Bedingung:**

- Game State ist `revealing`
- Delay vorbei

**Server-Aktion:**

- Game State auf `scoreboard` setzen
- Rangliste wird angezeigt

---

#### `scoreboard` → `idle` oder `completed`

**Auslöser:** Host klickt „nächste Frage" oder Spiel endet

**Bedingung:**

- Game State ist `scoreboard`

**Wenn nächste Frage existiert:**

- Game State → `idle`
- Nächste Runde beginnt

**Wenn letzte Frage war:**

- Raum State → `completed`
- Game State → gesetzt (nicht mehr relevant)
- `game:completed` Event an alle

---

## 3. Player State

Jeder Spieler hat einen eigenen Status, unabhängig vom Game State.

### Zustände

```
┌───────────┐
│ connected │  (Spieler ist online und bereit)
└─────┬─────┘
      │
      ├─ (nur im Lobby) → `ready` (wartet auf Spielstart)
      │
      ├─ (Frage aktiv) → `answering` (kann antworten)
      │
      ├─ (Antwort gesendet) → `answered` (wartet auf Auswertung)
      │
      └─ (Verbindung bricht ab)
         ↓
      ┌──────────────┐
      │ disconnected │  (Spieler ist offline)
      └──────┬───────┘
             │ (Spieler connectet wieder, nicht zu spät)
             ↓
      ┌─────────────────┐
      │ reconnecting    │  (wird gerade wieder integriert)
      └─────┬───────────┘
            │
            ↓
         (je nach Game State)
         ↓
      `connected` (wieder online mit aktuellem Status)
```

### Detaillierte Übergänge

#### `connected` (initial)

**Auslöser:** Spieler tritt Raum bei (`room:joined` Event erhalten)

**Spieler-Info:**

- Name ist gesetzt
- Player ID ist zugewiesen
- Session ID für Reconnect ist da

---

#### `connected` → `ready`

**Auslöser:** Spieler ist im Raum, Spiel hat noch nicht gestartet

**Bedingung:**

- Raum Status ist `waiting`

**Client-Anzeige:**

- „Spiel startet..." oder ähnlich
- Name sichtbar
- wartet auf Host

---

#### `connected` → `answering`

**Auslöser:** Frage wird gezeigt (Game State = `question_active`)

**Bedingung:**

- Game State ist `question_active`
- Spieler ist verbunden

**Client-Anzeige:**

- Frage sichtbar
- Antwort-Buttons aktiv
- Timer läuft

---

#### `answering` → `answered`

**Auslöser:** Spieler sendet `answer:submit` und Server akzeptiert

**Bedingung:**

- Player State ist `answering`
- Server akzeptiert Antwort

**Client-Anzeige:**

- Buttons disablet
- „Antwort gesendet ✓"
- Timer läuft weiter (aber Eingabe nicht möglich)

---

#### `answered` → `connected` (nach Auswertung)

**Auslöser:** Ergebnis wird gezeigt, nächste Runde beginnt

**Bedingung:**

- Game State ist `revealing` / `scoreboard`
- nächste Frage existiert

**Client-Anzeige:**

- Ergebnis der Frage
- Aktuelle Platzierung
- nächste Frage startet → zurück zu `answering`

---

#### `connected` → `disconnected`

**Auslöser:** Verbindung bricht ab

**Gründe:**

- Handy sperren
- Tab wechseln / Seite neu laden
- WLAN fällt weg
- Server sendet Timeout

**Server-Aktion:**

- Player State auf `disconnected` setzen
- andere Spieler bekommen `room:player-left` mit reason: `disconnect`
- Host sieht Spieler als grau/offline in Lobby
- Antworten des Spielers werden nicht mehr akzeptiert

**Timeout:**

- Während dieser 30 Sekunden: Spieler bleibt in Room-Datenstruktur mit State `disconnected`, Punkte und Antworten erhalten
- nach 30 Sekunden ohne Reconnect: Spieler wird aus Room-Datenstruktur entfernt
- Vollständige Semantik: `CONSTRAINTS.md` (Kritische Problemstelle 1)

---

#### `disconnected` → `reconnecting`

**Auslöser:** Spieler sendet `connection:reconnect` mit korrekter Session ID

**Bedingung:**

- Session ID ist noch gültig (< 30s her)
- Raum existiert noch

**Server-Aktion:**

- Player State auf `reconnecting` setzen
- `connection:reconnected` Event senden mit aktuellem Game State
- Client wird mit Kontext aktualisiert (welche Frage, was war die Antwort, etc.)

---

#### `reconnecting` → `connected`

**Auslöser:** Spieler empfängt `connection:reconnected` und UI ist aktualisiert

**Bedingung:**

- `connection:reconnected` Event empfangen

**Client-Aktion:**

- UI wird auf aktuellen Game State gesetzt
- wenn Frage aktiv: Antwort-Buttons zeigen (oder sind schon gesendet)
- Player State ist wieder `connected` mit allen nötigen Infos

---

## Zustand-Koordination

### Room State = `waiting`, Spieler tritt bei

```
Room: waiting
Player: connected → ready
```

---

### Room State = `in_game`, Game State = `question_active`

```
Room: in_game
Game: question_active
Players:
  - connected, answering (darf antworten)
  - connected, answered (hat geantwortet)
  - disconnected (wird ignoriert)
```

---

### Player disconnectet während `question_active`

```
VOR:
  Player State: connected, answering
  Game State: question_active

NACHHER:
  Player State: disconnected
  Game State: question_active (ändert sich nicht!)
  Server: ignoriert `answer:submit` von diesem Spieler

WENN Spieler reconnectet:
  Server: stellt Player wieder her
  Player State: reconnecting → connected
  aktuelle Antworten werden wiederhergestellt
```

---

### Kritischer Fall: Spieler disconnectet während Auswertung

```
VOR:
  Player: disconnected (während question_active)
  Game State: revealing

NACHHER:
  Player reconnectet
  Server stellt wieder her: „die Frage ist vorbei, hier ist das Ergebnis"
  Player sieht Ergebnis und Platzierung
  nächste Frage startet
```

---

## Sonderfälle

### Host disconnectet

**Bedingung:** Host-Connection bricht ab während Spiel läuft

**Verhalten:**

- Room State bleibt `in_game`
- Game State bleibt, was es war (z.B. `question_active`)
- Players sehen: „Warte auf Host" oder ähnlich
- Timeouts für Host:
  - nach 5 Minuten: Raum pausiert oder beendet
  - nach 30 Minuten: Raum wird gelöscht

**Wenn Host reconnectet:**

- Host sieht aktuellen Spiel-Status
- kann Spiel fortsetzen oder beenden

---

### Zu schneller Reconnect

**Bedingung:** Spieler ist < 1 Sekunde disconnected (Netzwerk-Glitch)

**Verhalten:**

- Server trackt kurze Disconnects
- Player State bleibt `connected`
- kein sichtbarer Wechsel für andere Player
- reibungslos

---

### Spieler kommt zu spät zurück

**Bedingung:** Spieler disconnectet mehr als 30 Sekunden, kommt dann zurück

**Verhalten:**

- Session ist abgelaufen
- `connection:reconnect` wird abgelehnt
- Spieler muss neuen Join machen mit Code
- wird als neuer Spieler im Raum hinzugefügt (alte Antworten weg)

---

### Alle Player disconnecten

**Bedingung:** alle Spieler sind > 5 Minuten offline

**Verhalten:**

- Raum wird automatisch gelöscht
- wenn Host versucht sich später zu connecten: Raum nicht mehr da

---

## Ungültige Zustandsübergänge

Diese Übergänge sind **nicht erlaubt**:

| Von                | Zu                | Grund                                                    |
| ------------------ | ----------------- | -------------------------------------------------------- |
| `answering`        | `ready`           | Spieler kann nicht in Lobby zurück gehen mitten im Spiel |
| `disconnected`     | `answering`       | Spieler muss erst `connected` sein                       |
| Game: `scoreboard` | `question_active` | ohne `idle` zwischendurch                                |
| Game: `completed`  | `question_active` | Spiel ist zu Ende                                        |
| Room: `completed`  | Room: `in_game`   | Raum kann nicht neu starten                              |

Wenn Client-Code diese Übergänge versucht:

- Server lehnt mit `error: INVALID_GAME_STATE` ab
- Client wird auf aktuellen State zurückgesetzt

---

## Debugging-Tipps

### Wenn Spieler in falschem Zustand steckt

1. Server-Logs prüfen: welcher Zustand ist der aktuelle?
2. war ein Disconnect/Reconnect Moment dazwischen?
3. kam es zu einem Timeout oder Edge Case?
4. wurde Game State falsch übergeben beim Reconnect?

### Wenn Übergänge „hängen"

Beispiel: Spieler sieht „Antwort gesendet", aber Rundenende kommt nicht.

1. Game State prüfen: ist es noch `question_active` oder schon `answer_locked`?
2. wurden Timer korrekt gesendet?
3. wurde Antwort wirklich akzeptiert?

### Wenn States nicht synchron sind

Beispiel: Host sieht noch Antwort-Buttons, Player sieht schon Ergebnis.

1. Timer-Sync prüfen
2. `answer:locked` Event angekommen?
3. Netzwerk-Latenz Faktor?

---

## Zusammenfassung

Eine saubere Zustandsmaschine ist die **Grundlage** für stabiles Multiplayer.

Regeln:

✅ **Nur erlaubte Übergänge akzeptieren**  
✅ **unerlaubte Events ablehnen mit klarem Error**  
✅ **Zustände immer konsistent halten**  
✅ **Disconnect/Reconnect elegant behandeln**  
✅ **bei Zweifeln: aktuellen Zustand vom Server fragen**

Wenn diese Regeln eingehalten werden, ist das System robust.

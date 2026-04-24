# state-machine.md

# Zustandsmaschine fuer das Geburtstagsquiz

## Zweck

Dieses Dokument beschreibt die tatsaechlich relevanten Zustaende fuer den aktuellen Quiz-Abend.

Es soll keine theoretische Vollmodellierung sein. Wenn es unklar wird, sind die Serverdateien die naehere Wahrheit:

- `apps/server/src/room.ts`
- `apps/server/src/lobby.ts`
- `apps/server/src/game.ts`
- `apps/server/src/session.ts`

## Grundsatz

Der Server haelt die massgeblichen Zustaende. Host und Player reagieren darauf.

## Room State

| State | Bedeutung im Repo | Typische Uebergaenge |
| --- | --- | --- |
| `waiting` | Raum ist offen, Spieler koennen joinen, Spiel laeuft noch nicht | `game:start` -> `in_game`, `room:close` -> `closed` |
| `in_game` | Quiz laeuft oder befindet sich zwischen Frage, Reveal und Rangliste | letzte Frage -> `completed`, `room:close` -> `closed` |
| `completed` | Quiz ist beendet, Endstand liegt vor | `room:close` -> `closed` |
| `closed` | Raum ist final beendet | kein sinnvoller Rueckweg |

Hinweis:

- `created` existiert im Enum, wird aktuell aber nicht als eigener oeffentlicher Laufzeit-Zustand genutzt. Ein neuer Raum geht direkt in `waiting`.

## Game State

| State | Bedeutung im Repo | Typische Uebergaenge |
| --- | --- | --- |
| `idle` | Spiel wurde gestartet, naechste Frage wird vorbereitet | `question:show` -> `question_active` |
| `question_active` | Frage ist offen, Antworten duerfen eingehen | Timerende oder alle Antworten da -> `answer_locked` |
| `answer_locked` | Eingaben sind gesperrt, Server wertet aus | direkte Weitergabe an `revealing` |
| `revealing` | Richtige Antwort und Rundenergebnisse werden gezeigt | nach kurzer Aufloesungszeit -> `scoreboard` |
| `scoreboard` | Punktestand nach der Runde wird gezeigt | alle verbundenen Spieler bereit -> `idle` oder Ende |
| `completed` | Spiel ist vorbei | kein sinnvoller Rueckweg |

Der praktische Fluss ist linear:

`idle -> question_active -> answer_locked -> revealing -> scoreboard -> idle/completed`

## Player State

| State | Bedeutung im Repo | Typische Uebergaenge |
| --- | --- | --- |
| `ready` | Spieler ist in der Lobby oder wurde in einen brauchbaren Grundzustand gesetzt | Frage startet -> `answering` |
| `answering` | Spieler darf fuer die aktive Frage antworten | gueltige Antwort -> `answered`, Disconnect -> `disconnected` |
| `answered` | Antwort ist angenommen, Spieler wartet auf Reveal/Score | naechste Frage -> `answering` |
| `disconnected` | Verbindung ist temporaer weg | Resume innerhalb Grace-Zeit oder Entfernen aus dem Raum |

Hinweise:

- `connected` und `reconnecting` existieren im Enum, sind aktuell aber keine stabil dokumentierten Laufzeit-Zustaende fuer den Abendfluss.
- Bei Resume stellt der Server den Spieler passend zum Raumzustand wieder her, zum Beispiel als `ready`, `answering` oder `answered`.

## Wichtige Uebergaenge

### Raum erstellen

- Host erstellt einen Raum
- Raum landet direkt in `waiting`

### Spiel starten

- Voraussetzung: Raum ist `waiting`
- `game:start` setzt den Raum auf `in_game`
- Game State startet mit `idle`
- kurz danach folgt `question_active`

### Frage aktiv

- alle verbundenen Spieler werden auf `answering` gesetzt
- Antworten duerfen eingehen
- Disconnects setzen einen Spieler auf `disconnected`

### Antwort angenommen

- der betroffene Spieler wechselt zu `answered`
- weitere Antworten desselben Spielers zaehlen nicht mehr

### Frage schliessen und auswerten

- Server geht auf `answer_locked`
- danach `revealing` mit richtiger Antwort, richtig/falsch je Spieler und Punkten fuer die Runde
- danach `scoreboard`

### Naechste Frage

- jeder verbundene Player meldet auf dem Handy `next-question:ready`
- der Server zaehlt nur verbundene Spieler als blockierend
- sobald alle verbundenen Spieler bereit sind, beginnt entweder die naechste Frage
- oder das Spiel geht auf `completed`
- `game:next-question` ist als Host-Override nach der Rangliste sichtbar

## Disconnect und Grace-Zeiten

### Player

- Bei Socket-Abbruch wird der Player auf `disconnected` gesetzt.
- Aktuelle Grace-Zeit im Code: `30s`.
- Kommt in dieser Zeit kein brauchbarer Resume zustande, wird der Spieler aus dem Raum entfernt.

### Host

- Bei Host-Disconnect bleibt der Raum zunaechst bestehen.
- Aktuelle Grace-Zeit im Code: `5min`.
- Danach wird der Raum geschlossen.

## Bewusste Vereinfachungen

Diese Zustandsmaschine kennt bewusst nicht:

- Pause-State fuer komplexes Resume
- Buzzer-Queue-States
- Team-States
- Admin- oder Moderations-States
- Persistenz- oder Recovery-States nach Serverneustart

Das waere fuer dieses Repo mehr Theorie als Nutzen.

## Wichtige Einschränkung fuer Resume

Die Session-Logik ist als Schutz gegen kurze Aussetzer sinnvoll.

Trotzdem gilt:

- der Resume-Fluss deckt inzwischen auch laufendes Spiel, Reveal, Rangliste und Endstand ueber Snapshot-Events ab
- es bleibt trotzdem eine pragmatische Wiederherstellung und kein grosses Recovery-System
- fuer den Abend ist stabiles WLAN und einfacher Flow wichtiger als eine aufwendige Recovery-Maschinerie

## Schluss

Diese Zustandsmaschine soll den aktuellen Quizfluss erklaeren, nicht ein grosses Zukunftssystem abbilden.

Wenn ein Zustand nur existiert, um spaeter vielleicht praktisch zu werden, braucht diese Doku ihn nicht als Kernkonzept.

# Praktischer Umsetzungsplan

## Ziel

Gebaut wird kein grosses Quiz-System, sondern ein funktionierendes Geburtstagsquiz fuer einen Abend.

Erfolg bedeutet:

- Raum erstellen klappt
- Spieler koennen einfach joinen
- Fragen erscheinen vollstaendig auf dem Host, Handys dienen als Antwort-Controller
- Antworten werden serverseitig angenommen
- Punkte und Rangliste stimmen
- der Ablauf bleibt auf echten Geraeten stabil genug

## Reihenfolge

### 1. Basis lauffaehig halten

Sicherstellen:

- `pnpm dev` startet Server, Host und Player
- ein vorgeladenes Quiz ist verfuegbar
- Host und Player koennen sich mit demselben Server verbinden

Abnahme:

- Host laedt
- Player laedt
- Server startet ohne manuelles Nacharbeiten

### 2. Lobby zuerst pruefen

Sicherstellen:

- Host erstellt einen Raum
- Join-Code und QR sind sichtbar
- Host zeigt Status, Fortschritt und Spieler in einer stabilen Uebersicht statt in losen Einzelscreens
- Spieler joinen mit Namen
- Lobby aktualisiert sich live
- Disconnects werden sichtbar statt still ignoriert

Abnahme:

- mehrere Handys koennen nacheinander joinen
- alle Namen erscheinen sauber
- Host sieht, wer verbunden oder getrennt ist

### 3. Eine Frage komplett durchziehen

Sicherstellen:

- Host startet das Spiel
- Host behaltet aktuelle Frage und Gesamtfragen autoritativ im Blick
- Frage erscheint vollstaendig auf dem Host
- Player bekommen nur Controller-Daten und keinen vollstaendigen Fragetext
- Timer kommt vom Server
- pro Spieler zaehlt nur eine Antwort
- Player sehen Antwort angenommen oder abgelehnt
- nach Schliessen der Frage folgt Reveal und Score

Abnahme:

- eine komplette Frage laeuft ohne manuelle Eingriffe durch
- spaete Antworten zaehlen nicht
- doppelte Antworten veraendern den Spielstand nicht
- unpassende Antworttypen werden nicht gespeichert

### 4. Mehrere Fragen und Spielende pruefen

Sicherstellen:

- Server wechselt automatisch weiter, wenn alle verbundenen Spieler bereit sind
- Host kann nach der Rangliste manuell weiterschalten, falls ein Handy haengen bleibt
- Scoreboard bleibt konsistent
- letzte Frage fuehrt in einen Endstand
- Raum kann am Ende sauber geschlossen werden

Abnahme:

- kompletter Quizlauf geht durch
- Rangliste wirkt plausibel
- es gibt keinen haengenden Zwischenzustand nach der letzten Frage

### 5. Vor dem Geburtstag haerten

Sicherstellen:

- mindestens ein Test mit echten Handys
- ein Test auf dem vorgesehenen Hostscreen
- bewusst pruefen: WLAN-Aussetzer, Doppelklicks, versehentliches Reload
- vor dem Abend keinen unnötigen Ausbau mehr anfangen

Abnahme:

- Kernfluss wirkt auf echten Geraeten stabil
- bekannte Schwachstellen sind benannt
- Scope ist eingefroren

## Was in diesem Plan bewusst nicht vorkommt

- keine Roadmap fuer weitere Modi
- keine Datenbankphase
- keine Cloud- oder Deploy-Architektur
- keine Editor-Plattform
- keine Teams, Joker oder Buzzer als Ausbaustufen

Wenn etwas vor dem Abend noch fehlt, gilt:

Erst den bestehenden Quizablauf verlaesslich machen. Nicht das naechste System anfangen.

## Entscheidungsregel fuer weitere Arbeit

Wenn eine geplante Aenderung nicht direkt einem dieser Punkte hilft,

- Join
- Lobby
- Frage
- Antwort
- Score
- Stabilitaet auf echten Geraeten

dann ist sie fuer dieses Repo wahrscheinlich nicht dringlich.

# architecture.md

# Quiz Dual Screen – Architektur

## Ziel des Systems

Dieses Projekt ist ein browserbasiertes Multiplayer-Quizspiel mit klar getrennten Rollen:

- **Host / Main Screen** auf Laptop, Monitor oder TV
- **Player UI** auf Smartphones
- **zentraler Server** als einzige Wahrheit für Spielstatus und Spiellogik

Das System soll für kleine Gruppen schnell startbar, einfach verständlich und technisch stabil sein.

Wichtiger als Feature-Menge ist ein sauberer Kernfluss:

1. Host erstellt Raum
2. Spieler treten per QR-Code oder Raumcode bei
3. Lobby aktualisiert sich live
4. Host startet das Spiel
5. Frage erscheint auf dem Hauptscreen
6. Spieler antworten auf dem Handy
7. Server wertet aus
8. Ergebnis und Rangliste werden angezeigt

---

## Architekturprinzipien

### 1. Server-authoritative Architektur

Der Server ist die einzige Wahrheit für:

- Raumzustand
- Spielzustand
- Spielerstatus
- aktuelle Frage
- Timer
- gültige Antworten
- Punkte
- Rangliste
- Buzzer-Reihenfolge

Clients dürfen:

- Eingaben senden
- Zustände anzeigen
- visuelles Feedback geben

Clients dürfen **nicht** eigenständig entscheiden über:

- Rundenende
- Punktevergabe
- Antwortgültigkeit
- Reihenfolge bei zeitkritischen Aktionen
- finalen Spielstatus

Diese Regel ist nicht optional. Wenn sie verletzt wird, ist die Architektur fehlerhaft.

---

### 2. Klare Rollentrennung

Das System besteht aus drei funktionalen Bereichen:

- **Host Client**
- **Player Client**
- **Server**

Zusätzlich gibt es gemeinsame Pakete für Typen, Protokolle und Spiellogik.

---

### 3. Kleine, saubere Verantwortungsbereiche

Jeder Bereich soll eine klar begrenzte Aufgabe haben.
Wenn Logik mehrfach oder an falschen Orten auftaucht, ist das ein Architekturproblem.

---

## Systemübersicht

### Host Client

Der Host Client läuft auf dem Laptop, Desktop oder TV-Screen.

Aufgaben:

- Raum erstellen
- QR-Code / Join-Code anzeigen
- Lobby mit Spielern anzeigen
- Spiel starten
- Fragen anzeigen
- Timer sichtbar machen
- Auflösung anzeigen
- Rangliste anzeigen
- Runde weiterführen

Der Host ist **Steueroberfläche und Hauptanzeige**, aber **nicht** die Spiellogik-Instanz.

---

### Player Client

Der Player Client läuft auf dem Smartphone.

Aufgaben:

- Raum per QR-Code oder Code beitreten
- Namen eingeben
- Antwort senden
- Status sehen
- Rückmeldung erhalten
- optional später: Buzzer / Joker / Teaminteraktionen

Der Player Client ist absichtlich klein gehalten.
Er ist Eingabeoberfläche, nicht Spiellogik-Zentrum.

---

### Server

Der Server verwaltet den gesamten echten Spielzustand.

Aufgaben:

- Räume erstellen und verwalten
- Join-Code erzeugen
- Verbindungen verwalten
- Spielstatus speichern
- Spielerstatus speichern
- Runden starten und beenden
- Fragen freigeben
- Antworten annehmen und validieren
- Punkte berechnen
- Ergebnisse verteilen
- Reconnect behandeln
- ungültige oder verspätete Events abweisen

Der Server ist die maßgebliche Instanz für jede relevante Spielentscheidung.

---

## Empfohlene Projektstruktur

```
quiz-dual-screen/
├─ apps/
│  ├─ web-host/
│  ├─ web-player/
│  └─ server/
├─ packages/
│  ├─ shared-types/
│  ├─ shared-protocol/
│  ├─ shared-utils/
│  └─ quiz-engine/
├─ docs/
│  ├─ architecture.md
│  ├─ event-protocol.md
│  ├─ state-machine.md
│  ├─ game-rules.md
│  └─ backlog.md
├─ package.json
├─ pnpm-workspace.yaml
└─ README.md
```

---

## Verantwortlichkeiten pro Bereich

### `apps/web-host`

Enthält ausschließlich Host-bezogene UI- und Steuerlogik.

Darf enthalten:

- Startseite
- Lobby-Ansicht
- Frage-Ansicht
- Ergebnis-Ansicht
- Ranglisten-Ansicht
- Host-Aktionen wie „Spiel starten", „nächste Frage"

Darf nicht enthalten:

- Punkteberechnung als Wahrheitsquelle
- echte Timer-Logik als Spiellogik
- zentrale Antwortvalidierung
- serverseitige Zustandsregeln in doppelter Form

---

### `apps/web-player`

Enthält ausschließlich die mobile Spieleroberfläche.

Darf enthalten:

- Join-Flow
- Namenseingabe
- Antwortbuttons
- Statusanzeige
- einfache Rückmeldungen

Darf nicht enthalten:

- Score-Berechnung als Hauptlogik
- finale Auswertung
- clientseitige Priorisierung konkurrierender Aktionen
- eigene Spielstatus-Wahrheit

---

### `apps/server`

Enthält alle serverseitigen Zustände und Spiellogik-Kontrolle.

Darf enthalten:

- Raumverwaltung
- Sessions / Verbindungsstatus
- Spielfluss
- Timersteuerung
- Auswertung
- Scoring
- Reconnect-Logik
- Event-Validierung
- Zustandsübergänge

Der Server ist der Kern des Systems.

---

### `packages/shared-types`

Enthält zentrale, wiederverwendete Typen und Datenstrukturen.

Beispiele:

- `Room`
- `Player`
- `Question`
- `Quiz`
- `Answer`
- Status-Enums

Keine Logik, nur gemeinsame Typisierung.

---

### `packages/shared-protocol`

Enthält die Kommunikationsdefinition zwischen Clients und Server.

Beispiele:

- Eventnamen
- Payload-Typen
- Request-/Response-Formate
- Statusmeldungen
- Fehlermeldungsformate

Wenn Eventdefinitionen an mehreren Stellen manuell stehen, ist das ein Fehler.

---

### `packages/shared-utils`

Enthält kleine, wiederverwendbare Hilfsfunktionen ohne Kern-Geschäftslogik.

Beispiele:

- Formatierungen
- kleine Hilfsvalidatoren
- Mapping-Helfer
- util-nahe Funktionen

Keine Spiellogik, keine Raumlogik, keine serverzentralen Zustandsregeln.

---

### `packages/quiz-engine`

Enthält regelbezogene Spiel- und Auswertungslogik.

Beispiele:

- Punktevergabe
- Antwortauswertung
- Modusregeln
- Sieglogik
- Rundenergebnisermittlung

Die Quiz-Engine soll möglichst UI-unabhängig bleiben.

---

## Datenfluss

### Grundrichtung

#### Host → Server

Beispiele:

- Raum erstellen
- Spiel starten
- nächste Frage freigeben
- Runde beenden

#### Player → Server

Beispiele:

- Raum beitreten
- Namen setzen
- Antwort absenden
- Buzzer drücken

#### Server → Host

Beispiele:

- Lobby-Update
- neue Frage
- Timerstatus
- Ergebnis
- Rangliste

#### Server → Player

Beispiele:

- Join bestätigt
- Frage freigegeben
- Antwort angenommen
- Eingabe gesperrt
- Rundenergebnis
- Punktestand

---

## Kommunikationsmodell

### WebSockets als Primärkanal

Für Echtzeitkommunikation wird WebSocket-basierte Kommunikation verwendet.

Warum:

- Lobby-Updates sollen sofort erscheinen
- Antworten sollen unmittelbar verarbeitet werden
- Timer- und Rundenstatus sollen synchron verteilt werden
- Polling wäre unnötig grob und ineffizient

WebSockets sind für dieses Szenario sinnvoller als klassisches Request/Response als Hauptmodell.

---

### Eventbasierte Kommunikation

Die Kommunikation soll eventbasiert und klar typisiert sein.

Beispielhafte Gruppen:

- `room:*`
- `player:*`
- `game:*`
- `question:*`
- `answer:*`
- `score:*`
- `connection:*`

Beispiele:

- `room:create`
- `room:join`
- `game:start`
- `question:show`
- `answer:submit`
- `round:end`
- `score:update`

Die genauen Definitionen gehören in `event-protocol.md`.

---

## Zustandsmodell

Das System hat mindestens drei relevante Zustandsebenen:

- **Room State**
- **Game State**
- **Player State**

---

### Room State

Der Raum beschreibt den Gesamtzustand einer Sitzung.

Zustände (kanonische Definition in `state-machine.md`):

- `created`
- `waiting`
- `in_game`
- `completed`
- `closed`

Verantwortung:

- Spieler können joinen oder nicht
- Spiel läuft oder nicht
- Host aktiv oder getrennt
- Raum beendet oder fortsetzbar

---

### Game State

Der Spielzustand beschreibt den Ablauf innerhalb des Raums.

Beispielhafte Zustände:

- `idle`
- `question_active`
- `answer_locked`
- `revealing`
- `scoreboard`
- `completed`

Verantwortung:

- welche Phase gerade aktiv ist
- ob Eingaben erlaubt sind
- ob Ergebnis gezeigt wird
- ob nächste Runde vorbereitet wird

---

### Player State

Jeder Spieler hat einen eigenen Status.

Beispielhafte Zustände:

- `connected`
- `disconnected`
- `ready`
- `answer_pending`
- `answered`
- `locked`
- `reconnected`

Verantwortung:

- ob der Spieler verbunden ist
- ob der Spieler antworten darf
- ob eine Antwort bereits gesendet wurde
- ob der Spieler temporär getrennt war

Die genaue Zustandsmaschine gehört in `state-machine.md`.

---

## Autoritative Regeln

Diese Regeln gelten systemweit:

### 1. Timer ist serverseitig maßgeblich

Clients dürfen Countdown anzeigen, aber der echte Zeitpunkt für Ende und Sperrung kommt vom Server.

### 2. Pro Spieler zählt pro Frage nur eine gültige Antwort

Mehrfache Eingaben werden ignoriert oder abgewiesen.

### 3. Antworten werden nur in erlaubten Phasen akzeptiert

Kommt eine Antwort zu spät oder im falschen Zustand, wird sie nicht gewertet.

### 4. Punkte werden nur serverseitig berechnet

Clients zeigen Ergebnisse an, rechnen sie aber nicht als Wahrheit aus.

### 5. Buzzer-Reihenfolge wird nur serverseitig entschieden

Wenn später ein Buzzer-Modus kommt, entscheidet ausschließlich der Server, wer zuerst gültig war.

---

## Reconnect-Strategie

Reconnect ist kein späteres Luxusproblem, sondern früh zu berücksichtigen.

Spieler werden regelmäßig:

- das Handy sperren
- Tabs wechseln
- kurzzeitig die Verbindung verlieren
- die Seite neu laden

Deshalb muss die Architektur vorsehen:

- stabile Spieleridentifikation pro Sitzung
- Wiedererkennung beim Reconnect
- sinnvolle Trennung von Verbindung und Spieleridentität
- definierte Zustände für temporären Disconnect

### Minimalanforderung für frühe Phasen

- Spieler soll nach kurzer Unterbrechung wieder dem richtigen Raum zugeordnet werden können
- Disconnect darf nicht automatisch den kompletten Raum zerstören
- Antworten nach Timeout oder falscher Phase dürfen trotz Reconnect nicht plötzlich gültig werden

---

## Persistenzstrategie

### MVP: In-Memory-State

Für das erste MVP ist In-Memory-State sinnvoll.

Warum:

- schneller Start
- geringere Komplexität
- weniger Infrastruktur
- Fokus auf Spielfluss statt sofortiger Datenhaltung

Nachteile:

- Server-Neustart löscht laufende Räume
- keine dauerhafte Historie
- kein robuster Mehrinstanzenbetrieb

Das ist für frühe Phasen akzeptabel.

---

### Später mögliche Erweiterung

Wenn Stabilität des Kernsystems erreicht ist, kann Persistenz ergänzt werden:

- Redis für flüchtigen Echtzeit-Status oder Sessions
- Postgres für dauerhafte Quizzes, Spielhistorien oder Benutzerprofile

Das ist aber **nicht** Teil des Kern-MVP.

---

## MVP-Grenzen

Das MVP soll absichtlich klein bleiben.

### Im MVP enthalten

- Raum erstellen
- Join per Code / QR
- Lobby mit Live-Updates
- Hostscreen
- Player-Screen
- Multiple-Choice-Frage
- serverseitige Antwortannahme
- serverseitige Punkteberechnung
- Ergebnisanzeige
- Rangliste

### Nicht im MVP enthalten

- Profile
- Konten
- globale Highscores
- Chat
- Freundeslisten
- Cosmetics
- Avatare
- Battlepass-artige Systeme
- komplexe Teammodi
- umfangreicher Editor
- KI-Features als Kernmechanik
- mehrere komplexe Modi gleichzeitig

Der Grund ist simpel:
Zu frühe Erweiterung zerstört meist die Basisqualität.

---

## Empfohlener Tech-Stack

### Frontend

- React
- TypeScript
- Vite

Warum:

- schnell aufsetzbar
- gute TypeScript-Integration
- passend für getrennte Host-/Player-Frontends
- ausreichend für responsive Browser-UIs

---

### Backend

- Node.js
- WebSocket-basierte Echtzeitkommunikation

Warum:

- passend für Event-getriebene Mehrnutzer-Logik
- gute TypeScript-Nähe
- geeignet für schnelle Iteration im MVP

---

### Monorepo

- pnpm workspaces

Warum:

- gemeinsame Typen und Protokolle sauber teilbar
- weniger Dubletten
- klare Trennung zwischen Apps und Shared-Packages
- gute Basis für wachsende Struktur ohne sofortigen Wildwuchs

---

## Wichtige technische Entscheidungen

### Warum Monorepo?

Weil Host, Player und Server eng zusammenhängen und gemeinsame Typen sowie Protokolle brauchen.

Ohne Monorepo drohen:

- doppelte Typdefinitionen
- inkonsistente Events
- höhere Wartungskosten
- unnötige Synchronisationsprobleme

---

### Warum Shared Types / Shared Protocol?

Weil das System viele gemeinsame Datenstrukturen hat:

- Room
- Player
- Question
- Answer
- Event-Payloads
- Statuswerte

Wenn diese pro App getrennt definiert werden, laufen sie auseinander.
Das ist vermeidbarer Murks.

---

### Warum serverseitige Spiellogik?

Weil sonst typische Probleme entstehen:

- widersprüchliche Scores
- Race Conditions
- unfairer Buzzer
- falsches Rundenende
- Antworten zählen in falschen Phasen
- Debugging-Hölle

Server-authoritative Architektur reduziert diese Risiken massiv.

---

### Warum erst In-Memory statt Datenbank?

Weil Persistenz zu früh oft nur unnötige Komplexität erzeugt.

Zuerst muss bewiesen werden, dass:

- Lobby funktioniert
- Echtzeitfluss sauber ist
- Spielstatus stabil bleibt
- Eventmodell brauchbar ist

Erst danach lohnt sich eine ernsthafte Persistenzschicht.

---

## Qualitätsziele

### Funktional

- Join in wenigen Sekunden
- mehrere Spieler gleichzeitig stabil
- Antworten werden zuverlässig verarbeitet
- Lobby aktualisiert sich live
- Rundenablauf bleibt konsistent

### Technisch

- klare Zuständigkeiten
- keine doppelte Logik
- sauberes Eventmodell
- serverseitige Wahrheit
- nachvollziehbare Zustände

### UX

- Smartphone-UI sofort verständlich
- Hostscreen aus Distanz lesbar
- klare Rückmeldungen
- kein unnötiger Bedienballast

---

## Hauptrisiken

### 1. Scope-Explosion

Wenn zu früh zu viel gebaut wird, wird die Architektur weich und inkonsistent.

### 2. Clientseitige Logikverschiebung

Wenn Punkte, Timer oder Validierungen in Clients „nur kurz" mitgebaut werden, entstehen doppelte Wahrheiten.

### 3. Reconnect wird zu spät bedacht

Dann ist der Kernfluss später nur mit hässlichen Workarounds reparierbar.

### 4. Eventchaos

Schlecht benannte oder untypisierte Events machen Debugging und Erweiterung unnötig schwer.

### 5. UI-Überladung

Ein Gruppenquiz braucht Klarheit, nicht Effektgewitter.

---

## Erweiterungsstrategie

Nach einem stabilen MVP können spätere Erweiterungen geprüft werden:

- Schätzfragen
- Buzzer
- Teams
- Joker
- Quiz-Import
- Quiz-Editor
- Persistenz
- optionale Nutzerkonten

Aber nur in dieser Reihenfolge:

1. Kernfluss stabil
2. Reconnect und Fehlerfälle brauchbar
3. Multiple Choice sauber
4. dann Erweiterungen

Nicht früher.

---

## Zusammenfassung

Die Zielarchitektur basiert auf vier einfachen, aber nicht verhandelbaren Grundsätzen:

1. **Server ist die Wahrheit**
2. **Host, Player und Server haben klar getrennte Verantwortlichkeiten**
3. **gemeinsame Typen und Protokolle liegen zentral**
4. **erst stabiler Kern, dann Erweiterung**

Wenn diese Regeln eingehalten werden, ist das Projekt technisch tragfähig.

Wenn sie aufgeweicht werden, entsteht sehr schnell ein instabiles Bastelprojekt mit Multiplayer-Fassade.

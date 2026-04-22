# AGENTS.md

# Quiz Dual Screen – Agentenrichtlinien

## Zweck des Projekts

Dieses Projekt ist ein browserbasiertes Multiplayer-Quizspiel mit klar getrennter Rollenverteilung:

- **Host / Main Screen** auf Laptop, Monitor oder TV
- **Player UI** auf Smartphones
- **zentraler Server** als einzige Wahrheit für Spielstatus und Auswertung

Ziel ist **kein Feature-Zirkus**, sondern ein stabiles, verständliches und schnell startbares Quizspiel für Gruppen.

---

## Produktkern

### Der gewünschte Ablauf

1. Host erstellt ein Spiel
2. Host sieht Join-Code und QR-Code
3. Spieler treten per Smartphone bei
4. Lobby aktualisiert sich live
5. Host startet das Spiel
6. Fragen erscheinen auf dem Hauptscreen
7. Spieler antworten auf dem Handy
8. Server wertet aus
9. Hauptscreen zeigt Ergebnis und Rangliste

### Das Produkt soll sein

- schnell startbar
- klar verständlich
- mobil nutzbar
- robust bei mehreren Spielern
- technisch sauber
- ohne unnötige Konten-/Plattform-Komplexität

### Das Produkt soll am Anfang **nicht** sein

- kein soziales Netzwerk
- kein Profil-/Account-System
- kein Shop
- keine Achievements
- kein Avatar-System
- kein Battlepass-artiger Unsinn
- kein KI-Spielzeug als Kernfunktion
- keine überfrachtete UI
- keine Native-App-Pflicht

---

## Architekturregeln

### 1. Server ist die einzige Wahrheit

Der Server entscheidet über:

- Raumstatus
- Lobbystatus
- Spielerstatus
- Rundenzustand
- aktuelle Frage
- Timer
- gültige Antworten
- Punkte
- Rangliste
- Buzzer-Reihenfolge

#### Verboten

- clientseitige Hauptlogik für Auswertung
- clientseitige Timer als Wahrheitsquelle
- clientseitige Entscheidung über Punkte
- clientseitige Priorisierung bei Buzzer oder Race Conditions

Der Client darf anzeigen, senden, bestätigen und visualisieren.
Die Spiellogik bleibt serverseitig.

---

### 2. Saubere Trennung der Verantwortlichkeiten

#### apps/web-host

Nur zuständig für:

- Hostscreen
- Lobbyanzeige
- Frageanzeige
- Ergebnisanzeige
- Rangliste
- Host-Steuerung

#### apps/web-player

Nur zuständig für:

- Join
- Nameingabe
- Antwortabgabe
- Statusanzeige
- Rückmeldung an Spieler

#### apps/server

Nur zuständig für:

- Raumverwaltung
- Spielzustand
- WebSocket-Kommunikation
- Validierung
- Timer
- Punkte
- Regeln
- Reconnect-Handling

#### packages/shared-types

Nur zuständig für:

- gemeinsame Typen
- Enums
- Interfaces
- zentrale Datenstrukturen

#### packages/shared-protocol

Nur zuständig für:

- Eventnamen
- Request-/Response-Payloads
- Kommunikationsschema
- gemeinsame Eventdefinitionen

#### packages/shared-utils

Nur zuständig für:

- validierungsnahe Hilfsfunktionen
- Formatierungshelfer
- kleine wiederverwendbare Utilities ohne Geschäftslogik

#### packages/quiz-engine

Nur zuständig für:

- Spielregeln
- Auswertung
- Punkteberechnung
- Rundenergebnisse
- Moduslogik

---

### 3. Keine doppelte Logik

Wenn Regeln, Typen, Events oder Berechnungen mehrfach in verschiedenen Apps definiert sind, ist das ein Architekturfehler.

#### Vermeiden

- doppelte Event-Strings
- mehrfach definierte Payload-Typen
- eigene Score-Berechnung in Host und Server
- eigene Statuslogik in Player und Server
- Copy-Paste-Strukturen, die auseinanderlaufen

---

### 4. Erst stabile Vertikalscheibe, dann Erweiterung

Reihenfolge:

1. Monorepo-Struktur
2. gemeinsame Typen
3. Event-Protokoll
4. Lobby
5. Multiple-Choice-Modus komplett
6. Reconnect / Validierung härten
7. erst danach weitere Modi

#### Nicht früher bauen

- Buzzer
- Teams
- Joker
- Quiz-Editor
- Importsystem
- Animationsoverkill
- Soundlandschaften
- KI-Fragengenerator
- Konten / Cloudprofile

Wenn der Basisfluss nicht stabil ist, sind solche Features nur zusätzliche Fehlerfläche.

---

### 5. Mobil zuerst, aber nicht verspielt

Die Player UI muss auf kleinen Displays zuverlässig funktionieren.

#### Anforderungen

- große Buttons
- keine Pflicht zum Scrollen im Kernfluss
- klares visuelles Feedback
- einfache Zustände
- wenig Ablenkung
- gute Lesbarkeit
- geringe Komplexität

#### Vermeiden

- verschachtelte Menüs
- unklare Zustände
- zu kleine Touchflächen
- dekorative Animationen auf Kosten der Klarheit
- unnötige visuelle Effekte

---

### 6. Hostscreen muss aus Distanz funktionieren

Der Hauptscreen ist kein Dashboard für Entwickler, sondern eine Anzeigefläche für Gruppen.

#### Muss leisten

- Frage groß sichtbar
- Timer klar lesbar
- Ergebnisse deutlich
- Rangliste einfach verständlich
- wenig visuelles Rauschen

#### Vermeiden

- kleine Schrift
- überladene Panels
- unnötige technische Statusanzeigen
- komplizierte Layouts
- optische Effekte, die Lesbarkeit verschlechtern

---

### 7. Reconnect und schlechte Verbindungen früh bedenken

Spieler werden:

- das Handy sperren
- Tabs wechseln
- Verbindung verlieren
- erneut beitreten wollen

Deshalb muss früh mitgedacht werden:

- Session-ID oder vergleichbare Wiedererkennung
- Reconnect-Strategie
- klare Zustände für connected / disconnected / reconnected
- Umgang mit Host-Abbruch
- Umgang mit Antworten nach Timeout

Kein „wird später gemacht", wenn die Architektur es dadurch von Anfang an falsch aufbaut.

---

### 8. Event-Design muss diszipliniert sein

WebSocket-Events müssen:

- konsistent benannt
- typisiert
- validiert
- nachvollziehbar dokumentiert

sein.

#### Beispielhafte Event-Gruppen

- `room:*`
- `player:*`
- `game:*`
- `question:*`
- `answer:*`
- `score:*`
- `connection:*`

#### Schlechte Praxis

- wilde Einzel-Eventnamen ohne System
- Payloads ohne Validierung
- inkonsistente Benennung
- versteckte Sonderfälle
- unterschiedliche Eventformate für ähnliche Aufgaben

---

### 9. Validierung ist Pflicht, nicht Option

Alle eingehenden Nutzdaten und Events müssen validiert werden.

Zu prüfen sind mindestens:

- Raumcode
- Spielername
- Antwortpayload
- Spielstatuswechsel
- Host-Aktionen
- Fragewechsel
- Timer-bezogene Events

Ungültige Daten dürfen nie ungeprüft in die Spiellogik laufen.

---

### 10. MVP-Umfang ist eng zu halten

#### Das MVP umfasst

##### Host

- Spiel erstellen
- Join-Code / QR-Code anzeigen
- Lobby anzeigen
- Spiel starten
- Frage anzeigen
- Timer anzeigen
- Auflösung anzeigen
- Rangliste anzeigen

##### Player

- Raum beitreten
- Namen eingeben
- Antwort senden
- Status sehen

##### Server

- Räume verwalten
- Lobby synchronisieren
- Fragen ausspielen
- Antworten annehmen
- Antworten validieren
- Punkte berechnen
- Ergebnisse verteilen

#### Das MVP umfasst **nicht**

- Profilsystem
- Accountsystem
- Freundeslisten
- Chat
- globale Highscores
- Quizeditor mit Vollausbau
- kosmetische Systeme
- mehrere komplexe Spielmodi gleichzeitig

---

### 11. Coding-Regeln

#### Allgemein

- TypeScript bevorzugen
- klare Benennungen
- kleine, verständliche Module
- keine unnötigen Abhängigkeiten
- keine magischen Strings, wenn Shared-Definitionen sinnvoll sind
- keine impliziten Seiteneffekte ohne Not

#### Bevorzugt

- klare Datentypen
- explizite Zustände
- saubere Trennung von UI und Logik
- kleine Hilfsfunktionen statt unlesbarer Monsterfunktionen
- nachvollziehbare Ordnerstruktur

#### Vermeiden

- God-Components
- God-Services
- massive Utility-Sammeldateien
- Logik in UI-Komponenten, die serverseitig oder shared gehört
- State-Chaos
- unstrukturierte Event-Handler

---

### 12. Dokumentation ist Teil der Arbeit

Folgende Dokumente sollen gepflegt werden:

- `README.md`
- `docs/CONCEPT.md`
- `docs/architecture.md`
- `docs/GAME-RULES.md`
- `docs/IMPLEMENTATION.md`
- `docs/CONSTRAINTS.md`

Dokumentation darf knapp sein, aber nicht nutzlos.
Kein Marketingtext. Nur belastbare technische Klarheit.

---

### 13. Review-Regeln für Agenten

Ein Agent soll nicht nur „etwas zum Laufen bringen", sondern kritisch prüfen:

- Ist Logik doppelt?
- Ist etwas unnötig kompliziert?
- Liegt Spielwahrheit fälschlich im Client?
- Ist der Eventfluss sauber?
- Ist die Dateistruktur klar?
- Ist etwas zu früh eingebaut?
- Ist etwas instabil oder schwer wartbar?
- Ist die UI für den echten Nutzungskontext sinnvoll?

Wenn etwas unnötig komplex oder voreilig ist, soll es vereinfacht oder gestrichen werden.

---

### 14. Harte Abnahmekriterien für frühe Phasen

#### Lobby-Phase

- Host kann Raum erstellen
- Join-Code wird erzeugt
- Player kann beitreten
- Lobby aktualisiert sich live
- Spielerstatus bleibt konsistent

#### Multiple-Choice-Phase

- Host kann Frage starten
- Player sehen Antwortoptionen
- pro Spieler zählt nur eine Antwort
- Timer wird serverseitig kontrolliert
- Ergebnis und Punkte stimmen

#### Härtephase

- invalide Events werden abgefangen
- doppelte Antworten werden ignoriert
- Reconnect zerstört den Raum nicht sofort
- Host-/Player-Zustände bleiben nachvollziehbar

---

### 15. Agenten-Arbeitsstil

Der Agent soll:

1. zuerst Struktur prüfen
2. dann einen klaren Phasenplan formulieren
3. dann nur den kleinsten sinnvollen nächsten Schritt umsetzen
4. nach jeder Phase Risiken benennen
5. unnötige Erweiterungen aktiv vermeiden

#### Der Agent soll nicht

- sofort alles gleichzeitig bauen
- ohne Plan ganze Repo-Umbauten machen
- drei neue Systeme einführen, nur weil es „praktisch wäre"
- Doku und Code widersprüchlich wachsen lassen
- halb fertige Features als Fortschritt verkaufen

---

### 16. Prioritätensystem

#### Höchste Priorität

- Stabilität
- Klarheit
- serverseitige Wahrheit
- saubere Architektur
- zuverlässige Lobby und Spielrunde

#### Mittlere Priorität

- visuelle Qualität
- angenehme UX
- spätere Erweiterbarkeit

#### Niedrige Priorität

- dekorative Extras
- Gimmicks
- experimentelle Zusatzideen

---

### 17. Schlussregel

Wenn eine Entscheidung zwischen

- „klingt cool"
  und
- „ist robust und sinnvoll"

getroffen werden muss, gilt:

**robust und sinnvoll gewinnt.**

---

**Kanonische Quellen:** Phasenplan → `docs/IMPLEMENTATION.md` | Architektur → `docs/architecture.md` | Zustandsmaschine → `docs/state-machine.md` | Event-Protokoll → `docs/event-protocol.md`

# Umsetzungsplan – Phasen

## Übersicht

```
Phase 0: Architektur         (Basis)
Phase 1: Lobby               (Host erstellt, Player jointen)
Phase 2: Echtzeit-Basis      (WebSocket-Events sauber)
Phase 3: Multiple Choice     (erster vollständiger Modus)
Phase 4: Rangliste & Scoring (Punkte, Zwischenstände)
Phase 5: Härten              (Reconnect, Validierung, Edge Cases)
Phase 6: Erweiterungen       (Schätzfrage, Buzzer, Teams, etc.)
```

---

## Phase 0 – Architektur zuerst

**Ziel:** Saubere Monorepo-Grundstruktur, geteilte Typen, Event-Protokoll, State-Machine.

**Scope:**
- pnpm-Workspace mit allen apps und packages
- TypeScript konfigurieren
- `shared-types` Package mit Basis-Interfaces
- `shared-protocol` Package mit Event-Definitionen (Konstanten + zod-Schemas)
- `shared-utils` Package mit Helpers
- `quiz-engine` Package mit Spielregeln
- Basic Server-Setup (Express + WebSocket)
- Basic React Apps (Host + Player) mit Vite

**Nicht eingeschlossen:**
- keine funktionierenden Features
- Server hat noch keine Geschäftslogik
- keine WebSocket-Verbindung clientseitig

**Abnahmekriterien:**
- [x] Monorepo läuft, alle packages sind angebunden
- [x] `shared-types` exportiert Room, Player, Question, Answer
- [x] `shared-protocol` exportiert Event-Namen und zod-Schemas
- [x] Server startet ohne Fehler
- [x] Host- und Player-App laden ohne Fehler
- [x] TypeScript kompiliert überall
- [x] Klare Struktur: kein Code dupliziert sich

**Output:**
- saubere Basis
- keine Funktionalität noch
- aber solide Fundament für Phase 1

---

## Phase 1 – Lobby-Vertikalscheibe

**Ziel:** Host erstellt Raum, Player jointen, Lobby aktualisiert sich live.

**Scope:**

### Host-App
- Screen: Startscreen
  - "neues Spiel"-Button
- Screen: Lobby
  - QR-Code anzeigen (statisch generiert)
  - Raumcode anzeigen (6-stellig)
  - Spielerliste (Name, verbunden/getrennt)
  - "Spiel starten"-Button (disabelt wenn <1 Spieler)

### Player-App
- Screen: Join
  - Raumcode eingeben
  - Name eingeben
  - "beitreten"-Button
- Screen: Lobby
  - "Spiel startet..."
  - Dein Name
  - Spielerzahl

### Server
- Raum erstellen (`room:create` → `room:created` mit joinCode)
- Raum beitreten (`room:join` → `room:joined`)
- andere Spieler benachrichtigen (`room:player-joined`)
- Spieler entfernen bei Disconnect (`room:player-left`)
- Lobby-State an alle Clients senden (`room:lobby-update`)

### Verbindung
- Host und alle Player verbinden sich via WebSocket
- Client sendet `client:identify` mit Rolle
- Server vergibt Connection-ID
- Lobby-Updates laufen via `room:lobby-update`

**Nicht eingeschlossen:**
- kein echtes Spielen
- kein Timer
- kein Ranking
- "Spiel starten"-Button macht noch nichts

**Abnahmekriterien:**
- [x] Host öffnet Seite, klickt "neues Spiel"
- [x] Server erzeugt Room-ID + Join-Code
- [x] Host sieht QR-Code + Code
- [x] 3–5 Spieler können via Code beitreten
- [x] Lobby aktualisiert sich live (neue Namen erscheinen)
- [x] Player können Raum verlassen
- [x] Reconnect zerstört Raum nicht sofort
- [x] WebSocket-Fehler werden sauber behandelt

---

## Phase 2 – Echtzeit-Kommunikation sauber machen

**Ziel:** WebSocket-Verbindungen, Events definieren, Reconnect-Handling, Player-Status.

**Scope:**

### Server
- Reconnect-Logik: Session-ID pro Player
- Player-Status-Transitions: `lobby` → andere States
- Eventvalidierung: alle Events werden gegen zod-Schemas geprüft
- doppelte Events blockieren
- Host-Abbruch: Raum pausieren (nicht löschen)
- WebSocket-Error-Handling
- Heartbeat / Timeout-Detection

### Events definieren & dokumentieren
- alle wichtigen Events in `shared-protocol`
- Payload-Typen dokumentieren
- TypeGuards für Runtime-Validierung

### Client (Host + Player)
- WebSocket-Fehlerbehandlung
- Auto-Reconnect mit Backoff
- klare Status-Messages
- "Verbindung verloren" UI-State

**Nicht eingeschlossen:**
- Spiellogik ist noch nicht hier
- keine Spiel-Events außer `game:start`

**Abnahmekriterien:**
- [x] 5 Spieler können stabil beitreten + bleiben
- [x] Spieler verliert Verbindung → Auto-Reconnect
- [x] nach Reconnect: alter Player-State wiederhergestellt
- [x] Host schließt Seite → Raum bleibt 30s, Player können zurück
- [x] doppelte Events werden ignoriert
- [x] ungültige Events werden verworfen
- [x] alle Events sind in `shared-protocol` definiert + validiert
- [x] keine Crashes durch schlechte Netzwerke

---

## Phase 3 – Multiple Choice komplett

**Ziel:** Erster vollständiger Spielmodus. Host startet, Player antworten, Auflösung.

**Scope:**

### Server
- `game:start` Event verarbeiten
- nächste Frage zeigen (`question:show`)
- serverseitiger Timer (nicht client-Timer)
- `answer:submit` Events validieren + akzeptieren
- nach Timer endet: Eingaben sperren
- richtige Antwort berechnen
- Punkte vergeben (einfache Logik: korrekt = 10, falsch = 0)
- Rangliste updaten
- `answer:reveal` + `score:update` senden

### Host-App
- neuer Screen: Frage-Anzeige
  - Frage groß
  - Timer-Countdown
  - Kategorie (optional)
- neuer Screen: Auflösung
  - Frage + korrekte Antwort
  - Roundenscore
  - "nächste Frage"-Button

### Player-App
- neuer Screen: Antwort
  - Frage klein
  - 4 Antwort-Buttons (A, B, C, D)
  - Timer anzeigen (vom Server)
  - keine Input möglich nach Absenden
- neuer Screen: Status
  - "Antwort gesendet ✓"
  - oder "Warte auf Auflösung..."

### Quiz-Data
- hardcodierte oder importierte Quiz für Tests
- Struktur: `[{ text: "...", options: [A, B, C, D], correctAnswer: 0 }]`

**Nicht eingeschlossen:**
- kein Schätzfrage-UI
- kein Buzzer
- kein Quiz-Editor
- kein Persistieren von Quiz

**Abnahmekriterien:**
- [x] Host klickt "Spiel starten"
- [x] Frage erscheint auf Host-Screen
- [x] Frage + Optionen erscheinen auf Player-Screens
- [x] Timer läuft sauber (Server-gesteuert)
- [x] Player können antworten
- [x] Player sehen "Antwort gesendet" nach Click
- [x] Server sperrt später eingehende Antworten
- [x] nach Timer: Auflösung zeigen (richtige Antwort)
- [x] Punkte korrekt berechnet
- [x] nächste Frage kann gestartet werden
- [x] kompletter Quizdurchlauf (5–10 Fragen) funktioniert stabil
- [x] keine Race Conditions bei zeitgleichen Antworten

---

## Phase 4 – Rangliste & Scoring

**Ziel:** Scoreberechnung, Zwischenstände, Endstand, Gewinneranzeige.

**Scope:**

### Server
- Punkte aggregieren pro Spieler
- nach jeder Runde: Rangliste aktualisieren
- nach Spiel endet: Gewinner bestimmen

### Host-App
- neuer Screen: Rangliste (nach jeder Runde)
  - 1., 2., 3., ... Platzierung
  - Name, Punkte
  - optional: mini-Effekt bei Top 3
- neuer Screen: Endscreen
  - Gewinner (1. Platz)
  - Top 3 anzeigen
  - "erneut spielen" oder "Spiel beenden"-Button

### Player-App
- neuer Screen: Ergebnis (nach Auflösung)
  - "Richtig!" / "Falsch"
  - Punkte für diese Runde
  - Deine aktuelle Platzierung
  - "weiter"-Button
- neuer Screen: Endscreen
  - Deine Platzierung
  - Dein Gesamtpunktestand
  - Top 3 Spieler

**Nicht eingeschlossen:**
- keine Geschwindigkeitsboni
- keine Multiplikatoren
- keine komplexen Formeln

**Abnahmekriterien:**
- [x] nach jeder Frage: Rangliste aktualisiert sich
- [x] richtige Antworten bringen korrekte Punkte
- [x] Rangliste zeigt aktuelle Platzierungen
- [x] nach Spiel endet: Gewinneranzeige
- [x] alle Spieler sehen Endstand + ihre Platzierung
- [x] keine Punkteberechnungsfehler

---

## Phase 5 – Härten statt Spielerei

**Ziel:** Robustheit, Edge Cases, Fehlerbehandlung.

**Scope:**

### Reconnect-Solidität
- Spieler disconnected während Antwort-Phase → alt State wiederhergestellt
- Spieler reconnectet nach Round-Ende → aktuellen State aktualisieren
- Host disconnected → Raum pausiert, Player warten

### Validierung überall
- doppelte Antworten blockieren (nicht nur Duplikate ignorieren)
- invalide Events (falsches Datentyp) ablehnen
- Spieler aus falschem Raum Antwort senden → ablehnen
- Timing-Attacks unmöglich (Server kontrolliert Timer)

### Fehlernachrichten
- Server sendet `error` Event mit Grund
- Client zeigt User-freundliche Meldung
- "Verbindung verloren" vs. "ungültige Anfrage" klar unterscheiden

### Edge Cases
- Host schließt Seite mitten im Spiel → Player sehen "Host hat Spiel beendet"
- Spieler mit schlechtem Netz sendet alte Antwort → ignored
- Raum mit 0 Spielern → automatisch löschen nach 5 min
- Server neustart während Spiel → Raum weg, Spieler reconnecten in leere Lobby

**Nicht eingeschlossen:**
- keine Persistierung
- kein Failover
- keine mehreren Server-Instanzen

**Abnahmekriterien:**
- [x] 5 Spieler können gleichzeitig troublefrei spielen
- [x] Netzwerk-Jitter wird tolleriert
- [x] Spieler kann nach Disconnect vollständig zurückkommen
- [x] ungültige Events crashen Server nicht
- [x] Timing-Manipulationen sind unmöglich
- [x] klare Fehlermeldungen statt cryptischer Fehler
- [x] Load-Test: 20 Spieler in einem Raum sollten nicht crashen

---

## Phase 6 – Erst danach Erweiterungen

Nicht vorher anfangen!

### Schätzfragen

- UI: Numerisches Inputfeld
- Validierung: Wert im sinnvollen Bereich
- Punkte: nach Nähe zur korrekten Antwort (lineare Formel)
- Server: entscheidet Korrektheit

### Buzzer

- UI: großer BUZZER-Button
- Server: Buzzer-Phase definieren (z.B. 5s offen)
- Server: Buzzer-Reihenfolge bestimmen (Timestamps)
- Server: nur erster Buzzer darf antworten
- Punkte: Multiplikatoren je nach Position

### Teams

- Player beim Join: Team wählen
- Scores: pro Team aggregieren
- Rangliste: Teams statt Individual-Spieler
- Komplexität: höher, aber nach Phase 5 denkbar

### Quiz-Editor

- Host kann Quiz selbst erstellen in UI
- Speicherung: In-Memory oder Browser-LocalStorage
- Import/Export: JSON

### Joker / Lifelines

- Spieler kann bestimmte Anzahl Joker nutzen
- Effekte: 50/50 (2 Optionen weg), Zeitverlängerung, Tipp
- Tracking: pro Spieler pro Spiel
- Komplexität: neue Logik in Quiz-Engine

---

## Kritische Checkpoints

Nach jeder Phase:

1. **Funktioniert es?** Alle Abnahmekriterien erfüllt?
2. **Ist die Architektur sauber?** Keine doppelte Logik, keine clientseitige Wahrheit?
3. **Sind wir off-track?** Wurde Scope erweitert? Unerwartete Komplexität?
4. **Was fehlt für nächste Phase?** Klare Aufgaben?
5. **Sollen wir Refactor machen?** Ist etwas unbenutzbar geworden?

---

## Realistischer Ablauf

- Phase 0: 1–2 Tage
- Phase 1: 2–3 Tage (WebSocket ist knifflig)
- Phase 2: 1–2 Tage (Events + Validierung sauber machen)
- Phase 3: 2–3 Tage (kompletter Modus)
- Phase 4: 1 Tag (Scoring)
- Phase 5: 2–3 Tage (Härten, Testing, Edge Cases)

**Gesamt MVP:** 9–14 Tage gute, stabile Arbeit.

Schneller = Schulden aufbauen, die später teuer werden.

---

## Fail Cases

### Was könnte schiefgehen?

1. **Zu viel zu früh:** "Lass mich direkt 3 Modi bauen"
   - **Folge:** Chaotische Architektur, Phase 5 dauert Wochen
   - **Vermeidung:** Strikt eine Phase nach der anderen

2. **Clientseitige Logik schleicht sich ein:** "Ich check kurz die Antwort im Frontend"
   - **Folge:** Cheating ist möglich, Tests sind wertlos
   - **Vermeidung:** Code Review: Server ist authoritative?

3. **Reconnect nie richtig implementiert:** "Machen wir später"
   - **Folge:** Phase 5 wird zur Hölle
   - **Vermeidung:** In Phase 2 sauber einbauen

4. **WebSocket-Events nicht validiert:** "Das wird schon passen"
   - **Folge:** Crashes durch unerwartete Payloads
   - **Vermeidung:** zod-Validierung überall

5. **UI ist zu komplex:** "Lass mich Animationen hinzufügen"
   - **Folge:** Bugs bei schlechtem Netz, Mobile-Probleme
   - **Vermeidung:** Minimal & funktional bleiben

---

## Definition of Done

Für jede Phase:

- [x] Code ist geschrieben
- [x] Alle Abnahmekriterien sind erfüllt
- [x] keine TODOs im Code
- [x] keine Debug-Logs
- [x] Architektur ist clean (kein Überengineering)
- [x] nächste Phase kann starten ohne Refactor zu erzwingen

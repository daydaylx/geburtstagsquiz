# Spielmechaniken & Regeln

## Spielablauf – Standardrunde

1. Frage erscheint auf dem Hauptscreen
2. Handy zeigt Antwortoptionen oder Buzzer
3. Timer läuft
4. Spieler senden Antwort
5. Timer endet oder alle haben geantwortet
6. Server sperrt Eingaben
7. Auflösung wird gezeigt
8. Punkte werden berechnet
9. Rangliste wird angezeigt
10. nächste Runde oder Spiel endet

## Spielmodi

### 1. Multiple Choice (MVP-Fokus)

**Ablauf:**
- Host sieht Frage + Optionen
- Player sehen Antwortbuttons auf Handy
- Timer läuft (Standard: 10–15 Sekunden)
- Player tippen Antwort
- nach Timer oder alle geantwortet: Server sperrt Eingaben
- richtige Antwort wird gezeigt
- Punkte vergeben

**Punktelogik für MVP:**
- richtige Antwort = feste Punkte (z.B. 10 Punkte)
- falsche Antwort = 0 Punkte
- **keine Geschwindigkeitsboni** (zu früh kompliziert)

**Constraints:**
- pro Spieler pro Frage nur eine gültige Antwort
- späte Antworten werden ignoriert
- Server entscheidet, wann Timer endet

### 2. Schätzfrage (später)

**Ablauf:**
- Host sieht Frage + korrekten Wert
- Player geben numerischen Wert ein
- Player sehen ihr Ergebnis nach Submit nicht

**Punktelogik:**
- Punkte nach Nähe zur korrekten Antwort
- näher = mehr Punkte
- z.B. linear: `max(0, points * (1 - distance/range))`

**Beispiel:**
- Frage: "Wie viele Menschen gibt es in Berlin?"
- korrekt: 3,6 Millionen
- Player 1 antwortet: 3,5 Mio → ~9 Punkte
- Player 2 antwortet: 2,0 Mio → ~3 Punkte

### 3. Buzzer (später)

**Ablauf:**
- Frage wird gestellt
- Timer läuft (z.B. 5 Sekunden offen für Buzzer)
- Player drücken Buzzer
- Server entscheidet: wer war zuerst?
- nur dieser Spieler darf antworten
- wenn richtig: Punkte
- wenn falsch: nächster Spieler in Buzzer-Reihenfolge darf versuchen

**Punktelogik:**
- richtig beim ersten Versuch: max Punkte
- richtig beim 2. Versuch: 50% Punkte
- richtig beim 3. Versuch: 25% Punkte
- falsch: 0 Punkte

**Fairness:**
- Server entscheidet Buzzer-Reihenfolge
- basiert auf Zeitstempel des `buzzer`-Events
- nicht auf client-seitigen Clocks

## Punkteberechnung

### Multiple Choice (MVP)

```
Punkte = iif(antwort == korrekt, pointsForQuestion, 0)
```

Einfach. Keine Variationen.

### Schätzfrage

```
distance = abs(playerAnswer - correctAnswer)
maxDistance = range
proximity = max(0, 1 - distance / maxDistance)
Punkte = floor(pointsForQuestion * proximity)
```

### Buzzer

```
if (playerAnswer == korrekt) {
  buzzerPosition = rankInBuzzerQueue  // 1, 2, 3, ...
  multiplier = [1.0, 0.5, 0.25][buzzerPosition - 1] || 0
  Punkte = floor(pointsForQuestion * multiplier)
} else {
  Punkte = 0
}
```

## UX-Regeln

### Auf dem Handy

- **große Buttons** – mind. 44×44px (Touch-Target)
- **kein Scrollen nötig** – alles sichtbar
- **sofort sichtbarer Status**
  - "Antwort gesendet ✓"
  - "Warte auf Auflösung..."
  - "Richtig!" / "Falsch"
  - deine Platzierung & Punkte
- **keine überladenen Menüs**
- **möglichst wenig Text**
- **klare Rückmeldung nach Absenden**

### Auf dem Hauptscreen

- **Frage groß und lesbar** – 60+ pt Font, aus 2m Entfernung lesbar
- **Timer klar sichtbar** – großer Countdown
- **Rangliste verständlich** – Platzierung, Name, Punkte
- **keine unnötige visuelle Überladung** – Fokus auf Lesbarkeit
- **keine schnellen Übergänge** – Leute sind abgelenkt

## UI-Struktur

### Host-Screens

#### 1. Startscreen

- neues Spiel
- Quiz laden
- gespeicherte Quiz anzeigen

#### 2. Lobby

- QR-Code
- Raumcode (6-stellig)
- Spielerliste (Name, verbunden/getrennt)
- "Spiel starten"-Button

#### 3. Frage-Screen

- Frage (groß)
- Optionen (bei Multiple Choice)
- Timer (großer Countdown)
- Kategorie / Rundennummer (optional)

#### 4. Auflösung

- Frage + richtige Antwort
- wer richtig lag (optional)
- Rundenergebnis
- "nächste Frage"-Button

#### 5. Rangliste

- Platzierungen (1., 2., 3., ...)
- Name
- Punktestand
- optional kleine, dezente Effekte (kein Overload)

#### 6. Endscreen

- Gewinner
- Top 3
- Optionen: "erneut spielen" oder "Spiel beenden"

### Player-Screens

#### 1. Join-Screen

- Raumcode eingeben (optional bei QR)
- Name eingeben
- "beitreten"-Button

#### 2. Lobby-Warten

- "Spiel startet..."
- Spielerzahl
- Dein Name

#### 3. Antwort-Screen (Multiple Choice)

- Frage (klein, aber lesbar)
- große Antwortbuttons (A, B, C, D)
- Timer (sichtbar)
- pro Frage nur eine Eingabe möglich

#### 4. Antwort-Screen (Schätzfrage)

- Frage
- Numerisches Inputfeld
- "absenden"-Button

#### 5. Antwort-Screen (Buzzer)

- große BUZZER-Schaltfläche
- Timer (countdown)
- wenn bereit: Text-Eingabe für Antwort

#### 6. Status-Screen

- Bestätigung: "Antwort gesendet ✓"
- oder "Warte auf Auflösung..."
- keine Eingabe mehr möglich

#### 7. Ergebnis-Screen

- "Richtig!" / "Falsch"
- Punktestand für diese Runde
- Deine aktuelle Platzierung
- "weiter"-Button

#### 8. Endscreen

- Deine Platzierung
- Dein Gesamtpunktestand
- Top 3 Spieler
- Optionen: "neues Spiel" oder "Lobby verlassen"

## Timer

### Server-seitiger Timer

- Server startet Timer für jede Frage
- Server sendet regelmäßig (z.B. jede 500ms) Timer-Updates
- Clients zeigen den Server-Timer, nicht ihren eigenen
- verhindert Timing-Attacks durch Client-Manipulation

### Client-seitige Anzeige

- Client empfängt `timer:tick` Event mit verbleibender Zeit
- Client zeigt diese Zeit an
- wenn verbleibende Zeit <= 0: UI sperren

## Duplikat-Prävention

### Problem

Spieler könnte zweimal "Antwort senden" drücken.

### Lösung

1. Client disablet Button nach erstem Click
2. Server ignoriert zweite Antwort vom gleichen Spieler für gleiche Frage
3. Server antwortet mit: "Antwort bereits gesendet"

## Reconnect-Verhalten

Spieler verliert WLAN, Handy schläft ein oder Tab wird geschlossen.

### Server-seitig

- Raum behält Spieler 30 Sekunden
- wenn spieler sich wieder verbindet: alten Status wiederherstellen
- wenn 30s vorbei: Spieler aus Raum entfernen

### Client-seitig

- erkenne Disconnect
- zeige "Verbindung verloren..." Message
- versuche automatisch alle 2s zu reconnecten
- bei erfolgreicher Rückkehr: Status aktualisieren

## Validierungsregeln

### Multiple Choice

- Antwort muss eine der Optionen sein
- Spieler muss in diesem Raum sein
- Raum muss im Status "playing" sein
- Frage muss aktiv sein
- Spieler darf nicht schon beantwortet haben

### Schätzfrage

- Wert muss numerisch sein
- Wert sollte im sinnvollen Bereich liegen
- Spieler muss in diesem Raum sein
- Frage muss aktiv sein
- Spieler darf nicht schon beantwortet haben

### Buzzer

- Buzzer muss in offener Buzzer-Phase sein
- Spieler muss in diesem Raum sein
- ein Buzzer pro Spieler
- Server entscheidet Reihenfolge

## Spielende

Spiel endet wenn:

1. alle Fragen beantwortet OR
2. Host bricht Spiel ab

Nach Spielende:
- Endrangliste anzeigen
- Gewinner ankündigen
- Optionen zum Neustarten

## Was bewusst nicht implementiert wird (MVP)

- ❌ Benutzerkonten / Profile
- ❌ Geschwindigkeitsboni
- ❌ Team-Modi
- ❌ Joker
- ❌ Lifelines
- ❌ Doppelpunkte-Runden
- ❌ Chat
- ❌ Avatare
- ❌ Achievements / Badges
- ❌ Soundeffekte
- ❌ Video-Einblendungen
- ❌ Live-KI-Fragengenerator

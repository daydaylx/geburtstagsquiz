# Konzept & Produktidee

## Ziel

Ein browserbasiertes Quizspiel für Gruppen mit zwei Bildschirmen:

- **Hauptscreen (Laptop / TV / Monitor)**
  - Lobby
  - Fragen
  - Timer
  - Auflösung
  - Rangliste
  - Kontrolle durch Host

- **Private Screens (Handys der Spieler)**
  - Beitritt
  - Namenseingabe
  - Antworten
  - Buzzer
  - Joker / Sonderaktionen

## Produktidee

1. Host öffnet die Seite auf dem Laptop
2. Host klickt auf „Spiel erstellen"
3. Server erzeugt Room-ID, Join-Code und Join-URL
4. Laptop zeigt QR-Code + Raumcode
5. Spieler scannen QR-Code mit dem Handy
6. Handy öffnet Join-Seite, Spieler geben Namen ein
7. Server aktualisiert die Lobby live
8. Host startet das Spiel
9. Antworten laufen in Echtzeit
10. Server wertet aus
11. Hauptscreen zeigt Ergebnis und Punktestand

## Zielgruppe

- Freunde / Party
- Familie
- Spieleabend
- kleine Events
- später optional: Schule / Team-Event

## Anforderungen an das Produkt

### Was das Produkt sein soll

- **schnell startbar** – in Sekunden spielbereit
- **sofort verständlich** – keine lange Einweisung nötig
- **ohne App-Installation nutzbar** – browserbasiert
- **mobil bedienbar** – auch auf kleinen Screens
- **gruppentauglich** – stabil bei 3–20 Spielern
- **klarer, sauberer Ablauf** – nachvollziehbar
- **technisch stabil** – nicht crashanfällig

### Was es am Anfang nicht sein soll

- **kein Account-System** – anonyme Sessions
- **kein Shop** – keine Monetarisierung im MVP
- **keine Profile / XP / Battlepass-Mechanik** – zu früh
- **kein Community-System** – keine Freundeslisten, Chat, Foren
- **keine überladene KI-Funktionalität** – später prüfen
- **kein 20-Modi-Monster** – lieber ein Modus perfekt als 10 halbfertig
- **keine Native-App-Pflicht** – Web reicht

## Verbindungsmodell

### Standard-Ablauf

1. Host öffnet die Host-Seite
2. Host klickt auf „Spiel erstellen"
3. Server erzeugt:
   - Room-ID
   - Join-Code
   - Join-URL
4. Laptop zeigt QR-Code + Raumcode
5. Spieler scannen QR-Code
6. Handy öffnet Join-Seite
7. Spieler geben Namen ein
8. Server aktualisiert die Lobby live
9. Host startet das Spiel
10. Antworten laufen in Echtzeit über WebSocket
11. Server wertet aus
12. Hauptscreen zeigt Ergebnis und Punktestand

### Kommunikationsprinzip

#### Host → Server

- Raum erstellen
- Spiel starten
- nächste Frage
- Runde beenden
- Ergebnis freigeben

#### Spieler → Server

- Raum beitreten
- Namen setzen
- Antwort absenden
- Buzzer drücken
- Joker nutzen

#### Server → alle

- Lobby-Update
- neue Frage
- Timerstatus
- Antwort bestätigt
- Rundenende
- Auswertung
- Rangliste

## MVP-Fokus

Das MVP muss klein bleiben.

### Host / Laptop

- Spiel erstellen
- QR-Code anzeigen
- Lobby mit Spielern
- Fragen anzeigen
- Timer anzeigen
- richtige Antwort anzeigen
- Punktestand anzeigen
- nächste Frage starten

### Handy / Spieler

- per QR-Code beitreten
- Namen eingeben
- Antwort auswählen
- Bestätigung sehen:
  - „Antwort gesendet"
  - „warte auf Auflösung"
- Platzierung / Punktestand sehen

### Fragetypen fuer den Abend

Aktiv genutzt werden die vorbereiteten Fragetypen:

1. **Multiple Choice** – Auswahl aus Optionen
2. **Schätzfrage** – numerische Antwort
3. **Mehrheitsfrage** – numerische Antwort nach Server-Auswertung
4. **Ranking** – Reihenfolge
5. **Logic** – Optionsfrage

Buzzer, Teams und Joker bleiben ausserhalb des Abendumfangs.

## Erfolgskriterien

### Funktional

- Join in wenigen Sekunden
- mehrere Spieler gleichzeitig stabil
- Antworten kommen zuverlässig an
- Hauptscreen aktualisiert sich live
- Timer und Rundenstatus bleiben sauber

### UX

- keine Erklärung nötig
- sofort verständlich
- Handy ist idiotensicher
- Hauptscreen ist klar lesbar aus Distanz

### Technisch

- serverseitige Wahrheit
- keine doppelte Logik
- saubere Event-Architektur
- nachvollziehbares State-Handling

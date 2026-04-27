````md
# Geburtstagsquiz – Umbaukonzept auf 3 UIs + Web/Domains

## 1. Ziel

Das Projekt soll von der aktuellen kombinierten Host-/Anzeige-Oberfläche auf eine saubere Web-Architektur mit drei getrennten Oberflächen umgebaut werden:

1. **TV / Display UI**
   - öffentliche Anzeige für TV, Beamer oder Laptop
   - zeigt Fragen, Antworten, Timer, Auflösung, Erklärungen und Scoreboard
   - keine Steuerung

2. **Host UI / Controller**
   - Steueroberfläche für dich
   - idealerweise mobil nutzbar
   - erstellt Raum, startet Spiel, steuert Ablauf, zeigt Spielerstatus und Einstellungen

3. **Player UI**
   - Mitspieler-Oberfläche auf dem Handy
   - Join, Antwortabgabe, Ergebnis, Bereit-Button

Zusätzlich soll das System später über eine eigene Domain erreichbar sein, z. B.:

```text
tv.deine-domain.de      → TV-/Display-Ansicht
host.deine-domain.de    → Host-/Controller-UI
play.deine-domain.de    → Player-UI
api.deine-domain.de     → WebSocket/API-Backend
````

---

## 2. Aktueller Zustand

Aktuell ist das Projekt eher ein **2-UI-System**:

```text
apps/web-host    → Host + TV-Anzeige + Steuerung + Settings
apps/web-player  → Player UI
apps/server      → Node/WebSocket-Server
```

Der Server kennt aktuell nur zwei Rollen:

```text
host
player
```

Eine eigene Rolle für `display` oder `controller` gibt es noch nicht.

Das bedeutet: Eine echte Trennung in TV-Anzeige und Host-Steuerung ist nicht nur eine optische Änderung. Es braucht saubere Anpassungen an:

* Rollenmodell
* Sessions
* WebSocket-Protokoll
* Broadcast-Logik
* Reconnect-Verhalten
* UI-Aufteilung
* Deployment-/URL-Konzept

---

## 3. Zielarchitektur

### 3.1 Rollen

Zielrollen:

```text
host      → darf steuern
display   → darf nur anzeigen
player    → darf antworten
```

### 3.2 Verantwortlichkeiten

| Rolle     | Gerät                   |      Darf anzeigen | Darf steuern | Zweck                    |
| --------- | ----------------------- | -----------------: | -----------: | ------------------------ |
| `display` | TV / Beamer / Laptop    |                 ja |         nein | öffentliche Quiz-Anzeige |
| `host`    | Handy / Tablet / Laptop |        ja, kompakt |           ja | Spielsteuerung           |
| `player`  | Handys der Mitspieler   | nur eigene Ansicht |         nein | Antworten abgeben        |

---

## 4. Oberflächen im Detail

## 4.1 TV / Display UI

### Aufgabe

Die Display-UI ist die Bühne. Sie zeigt alles, was die Gruppe sehen soll.

### Screens

```text
Waiting / Nicht verbunden
Lobby
Question
Reveal
Scoreboard
Finished
Connection Lost
```

### Lobby

Zeigt:

* Quizname
* Join-Code
* QR-Code zur Player-UI
* Anzahl verbundener Spieler
* ggf. Hinweis: „Warte auf Host“

### Frage

Zeigt:

* Frage
* Antwortmöglichkeiten
* Timer
* Antwortfortschritt
* Fragetyp
* aktuelle Frage / Gesamtfragen

### Reveal

Zeigt:

* richtige Antwort
* optional markierte falsche Antworten
* kurze Erklärung / Kontext
* Anzahl richtig/falsch/nicht geantwortet
* kurze Animation / Feedback

### Scoreboard

Zeigt:

* Rangliste
* Top 3 stärker hervorgehoben
* Punkte
* Fortschritt im Quiz
* ggf. „Warte auf nächste Frage“

### Finished

Zeigt:

* Gewinner
* finale Rangliste
* Abschlussbildschirm

### Nicht erlaubt

Die Display-UI darf nicht:

* Spiel starten
* nächste Frage auslösen
* Einstellungen ändern
* Spieler entfernen
* Raum schließen
* Antworten senden
* Host-Rechte besitzen

---

## 4.2 Host UI / Controller

### Aufgabe

Die Host-UI ist dein Cockpit. Sie muss nicht schön als TV-Anzeige wirken, sondern praktisch und mobil bedienbar sein.

### Screens

```text
Create Room
Room Ready
Lobby Control
Question Control
Reveal Control
Scoreboard Control
Settings
Finished
Emergency / Recovery
```

### Funktionen

Der Host kann:

* Raum erstellen
* Player-Link/QR anzeigen
* Display-Link anzeigen
* Spiel starten
* nächste Frage auslösen
* ggf. Frage überspringen
* Spielerstatus sehen
* Antwortfortschritt sehen
* Einstellungen ändern
* Raum schließen
* neues Spiel starten

### Host-UI sollte mobil funktionieren

Anforderungen:

* große Buttons
* klare Statusanzeigen
* keine überladene Drei-Spalten-Ansicht
* wichtige Aktionen schnell erreichbar
* keine riesige TV-Fragekarte
* kein Scrollchaos
* deutliche Warnungen bei kritischen Aktionen

### Beispiele für Host-Aktionen

```text
[Spiel starten]
[Nächste Frage]
[Frage überspringen]
[Auflösung anzeigen]
[Raum schließen]
[Antworttexte auf Handys: An/Aus]
```

---

## 4.3 Player UI

### Aufgabe

Die Player-UI bleibt schlank. Spieler sollen nicht nachdenken müssen, wie die App bedient wird.

### Screens

```text
Join
Lobby
Question
Answer Submitted
Reveal
Scoreboard
Finished
Reconnect
```

### Funktionen

Player können:

* Raumcode eingeben oder per QR beitreten
* Namen setzen
* Antwort abgeben
* Antwortstatus sehen
* eigenes Ergebnis sehen
* auf nächste Frage bereit klicken

### Verbesserungen

Sinnvolle spätere Verbesserungen:

* stärkeres „Antwort gespeichert“-Feedback
* bessere Richtig/Falsch-Anzeige
* kurze Erklärung im Reveal
* Ranking-Eingabe verständlicher
* Reconnect-Zustand klarer
* Touchflächen groß halten

---

## 5. Backend-Architektur

## 5.1 Server bleibt authoritative

Der Server entscheidet weiterhin über:

* Raumstatus
* aktive Frage
* Timer
* Antwortannahme
* Punkte
* Scoreboard
* Spielende

Clients zeigen nur an oder senden erlaubte Aktionen.

---

## 5.2 Neue Session-Struktur

Aktuell reicht eine Host-Session und mehrere Player-Sessions.

Zukünftig braucht der Raum zusätzlich Display-Informationen:

```ts
RoomRecord {
  hostSessionId: string;
  displaySessionId?: string;
  displayToken?: string;
  displayConnected: boolean;
  players: Player[];
}
```

Oder, wenn mehrere Displays erlaubt sein sollen:

```ts
RoomRecord {
  hostSessionId: string;
  displaySessions: Map<string, DisplaySession>;
  players: Player[];
}
```

### Empfehlung

Für den Anfang reicht:

```text
ein Host
ein Display
mehrere Player
```

Mehrere Displays sind unnötig. Nicht ausbauen, nur weil es technisch möglich wäre.

---

## 5.3 Display-Token

Der Host erstellt den Raum. Der Server erzeugt zusätzlich einen Display-Link:

```text
https://tv.deine-domain.de?displayToken=XYZ
```

Das Display verbindet sich mit diesem Token.

### Warum Token?

Damit nicht jeder mit dem Join-Code einfach eine Display-Session öffnen kann.

Player nutzen:

```text
joinCode
```

Display nutzt:

```text
displayToken
```

Host nutzt:

```text
hostSessionId
```

---

## 5.4 Neue Events

### Bestehende Grundidee

Aktuell gibt es Events für:

```text
room:create
room:join
game:start
answer:submit
question:show
question:controller
score:update
game:finished
```

### Neue Display-Events

Minimal notwendig:

```text
display:connect
display:connected
display:disconnected
```

Optional:

```text
display:state-sync
```

### Beispiel

Client → Server:

```json
{
  "event": "display:connect",
  "payload": {
    "displayToken": "XYZ"
  }
}
```

Server → Display:

```json
{
  "event": "display:connected",
  "payload": {
    "roomId": "...",
    "joinCode": "ABC123",
    "roomState": "waiting"
  }
}
```

---

## 5.5 Broadcast-Logik

Der Server darf nicht mehr blind dieselben Events an Host und Player senden.

Zukünftig:

```text
sendToHost()
sendToDisplay()
sendToPlayers()
broadcastPublicState()
broadcastPlayerState()
```

### Host bekommt

* Steuerstatus
* Spielerstatus
* Antwortfortschritt
* aktuelle Frage kompakt
* Spielstatus
* Fehler/Warnungen

### Display bekommt

* öffentliche Lobbydaten
* Frage
* Antwortmöglichkeiten
* Timer
* Reveal
* Erklärung
* Scoreboard

### Player bekommt

* Join-Bestätigung
* Controller-Payload
* Antwortstatus
* eigenes Ergebnis
* Scoreboard/Ready-Status

---

## 6. Fragen, Erklärungen und Shuffle

Dieser Teil sollte nach der Rollen-/UI-Trennung umgesetzt werden.

## 6.1 Erklärung pro Frage

Neue optionale Eigenschaft:

```ts
explanation?: string;
```

### Zweck

Beim Reveal wird nicht nur angezeigt:

```text
Richtig: A
```

Sondern z. B.:

```text
Richtig: A – Podophilie

Kontext:
Podophilie bezeichnet ein sexuelles oder erotisches Interesse an Füßen. Als Quizfrage reicht die Definition – mehr Details braucht am Geburtstag wirklich niemand.
```

### Anforderungen

* erst im Reveal sichtbar
* nicht während aktiver Frage
* kurz halten
* 1–3 Sätze
* unterhaltsam, aber nicht peinlich platt
* keine Wikipedia-Romane

---

## 6.2 Shuffle ohne Wiederholung

Aktuell sollte die Fragenauswahl so umgebaut werden, dass:

* Fragen pro Spiel gemischt werden
* keine Frage innerhalb eines Spiels doppelt kommt
* Fragetypen sinnvoll verteilt bleiben
* Original-Fragenkatalog nicht verändert wird
* Tests die Logik absichern

### Ziel

```text
1. Fragen pro Typ gruppieren
2. pro Typ zufällig auswählen
3. eindeutige IDs prüfen
4. Ablauf mischen
5. keine Wiederholungen
```

### Tests

Pflichttests:

* keine doppelten Frage-IDs
* Zielanzahl pro Typ wird eingehalten, wenn genug Fragen vorhanden sind
* bei zu wenigen Fragen wird sauber fallback genutzt
* Original-Array wird nicht mutiert
* Shuffle ist testbar, ohne flaky Tests

---

## 6.3 Fragenkatalog verbessern

Später sinnvoll:

* bestehende Fragen prüfen
* falsche Antworten korrigieren
* unklare Fragen verbessern
* schlechte Fragen entfernen
* gute neue Fragen ergänzen
* 18+-Begriffsfragen optional als eigene Kategorie

Wichtig:

Nicht Masse erzeugen. Lieber weniger gute Fragen als ein aufgeblasener Fragenfriedhof.

---

# 7. Domain-/Web-Konzept

## 7.1 Ziel-Domainstruktur

Empfohlen:

```text
tv.deine-domain.de
host.deine-domain.de
play.deine-domain.de
api.deine-domain.de
```

### Bedeutung

| Subdomain              | Zweck           |
| ---------------------- | --------------- |
| `tv.deine-domain.de`   | TV-/Display-UI  |
| `host.deine-domain.de` | Host-Controller |
| `play.deine-domain.de` | Player-UI       |
| `api.deine-domain.de`  | WebSocket/API   |

---

## 7.2 Env-Variablen

Die Apps sollten nicht mehr hart mit lokalen Ports raten.

### Lokal

```env
VITE_DISPLAY_URL=http://localhost:5175
VITE_HOST_URL=http://localhost:5173
VITE_PLAYER_JOIN_BASE_URL=http://localhost:5174
VITE_SERVER_SOCKET_URL=ws://localhost:3001
```

### Domain

```env
VITE_DISPLAY_URL=https://tv.deine-domain.de
VITE_HOST_URL=https://host.deine-domain.de
VITE_PLAYER_JOIN_BASE_URL=https://play.deine-domain.de
VITE_SERVER_SOCKET_URL=wss://api.deine-domain.de
```

---

## 7.3 QR-Code-Verhalten

Der QR-Code für Spieler zeigt auf:

```text
https://play.deine-domain.de?joinCode=ABC123
```

Der Display-Link zeigt auf:

```text
https://tv.deine-domain.de?displayToken=XYZ
```

Host sieht beide Links:

```text
Player-Link:
https://play.deine-domain.de?joinCode=ABC123

TV-Link:
https://tv.deine-domain.de?displayToken=XYZ
```

---

# 8. Deployment-Varianten

## 8.1 Variante A – Cloudflare Tunnel

### Aufbau

```text
tv.deine-domain.de   → localhost:5175
host.deine-domain.de → localhost:5173
play.deine-domain.de → localhost:5174
api.deine-domain.de  → localhost:3001
```

### Vorteile

* schnell
* kaum Infrastruktur
* bestehender Node-Server bleibt
* ideal für Test und privaten Abend
* keine Router-Portfreigabe nötig

### Nachteile

* lokaler Rechner/Server muss laufen
* wenn Laptop schläft, ist Quiz weg
* nicht „echter Cloudbetrieb“

### Einschätzung

Sehr guter Zwischenschritt.

---

## 8.2 Variante B – Frontends auf Cloudflare Pages, Backend separat

### Aufbau

```text
tv/host/play → Cloudflare Pages
api          → Node-Server auf VPS oder Tunnel
```

### Vorteile

* Frontends laufen sauber online
* weniger lokale Vite-Abhängigkeit
* Backend kann erstmal Node bleiben
* guter Mittelweg

### Nachteile

* Backend bleibt separater Dienst
* API/WebSocket muss sauber erreichbar sein

### Einschätzung

Wahrscheinlich die beste mittelfristige Lösung.

---

## 8.3 Variante C – Cloudflare Pages + Worker + Durable Objects

### Aufbau

```text
tv/host/play → Cloudflare Pages
api/ws       → Cloudflare Worker
Room-State   → Durable Object pro Raum
```

### Vorteile

* echter Cloudbetrieb
* kein Laptop nötig
* WebSocket-State sauber pro Raum
* langfristig elegant

### Nachteile

* aktueller Node-WebSocket-Server muss stark umgebaut werden
* Timer/Reconnect/Room-State müssen neu gedacht werden
* deutlich mehr Testaufwand

### Einschätzung

Langfristig interessant, aber nicht als erster Umbau.

---

# 9. Empfohlene Roadmap

## Phase 1 – Architektur dokumentieren

### Ziel

Sauber festlegen:

* Rollen
* Events
* Datenfluss
* Sessions
* Reconnect
* URLs
* Deployment-Ziel

### Dateien

```text
docs/architecture-v2.md
docs/protocol-v2.md
docs/deployment-domain-plan.md
```

### Abnahmekriterien

* klar definiert, was Display/Host/Player darf
* keine unklare Session-Logik
* Domainstruktur festgelegt
* keine Codeänderung nötig

---

## Phase 2 – Serverrollen erweitern

### Ziel

Server kennt:

```text
host
display
player
```

### Betroffene Bereiche

```text
packages/shared-types
packages/shared-protocol
apps/server
```

### Änderungen

* `CLIENT_ROLES` erweitern
* Display-Events ergänzen
* Display-Session im RoomRecord
* Display-Connect validieren
* Broadcasts aufteilen
* Reconnect für Display ergänzen

### Tests

* Host und Display können gleichzeitig verbunden sein
* Display darf keine Host-Events senden
* Player-Flow bleibt intakt
* Reconnect Host verdrängt Display nicht
* Reconnect Display verdrängt Host nicht

---

## Phase 3 – Display-App bauen

### Ziel

Neue App:

```text
apps/web-display
```

### Minimalfunktion

* verbindet sich mit `displayToken`
* zeigt Lobby
* zeigt Frage
* zeigt Antwortoptionen
* zeigt Timer
* zeigt Reveal
* zeigt Erklärung
* zeigt Scoreboard
* zeigt Endstand

### Nicht bauen

* keine Steuerbuttons
* keine Settings
* keine Player-Aktionen
* kein komplexes Menü

### Abnahmekriterien

* Display kann kompletten Spielablauf anzeigen
* keine Steuerfunktion sichtbar
* TV-taugliche Schriftgrößen
* keine Scroll-Orgie

---

## Phase 4 – Host-App zum Controller umbauen

### Ziel

`apps/web-host` wird zur echten Steueroberfläche.

### Änderungen

* große TV-Stage entfernen
* mobile Controller-Ansicht bauen
* Raum erstellen
* Display-Link anzeigen
* Player-Link/QR anzeigen
* Spiel starten
* nächste Frage
* Spielerstatus
* Einstellungen
* Notfallaktionen

### Abnahmekriterien

* Host kann Spiel komplett steuern
* Host funktioniert auf Handy/Tablet
* Host braucht nicht den TV als Eingabegerät
* Display bleibt unabhängig verbunden

---

## Phase 5 – Player-App verbessern

### Ziel

Player bleibt stabil, wird aber angenehmer.

### Änderungen

* Antwort gespeichert klarer anzeigen
* Reveal mit Erklärung ergänzen
* Richtig/Falsch-Feedback verbessern
* Ranking-Eingabe verbessern
* Reconnect-Zustände klarer machen

### Abnahmekriterien

* Player kann komplett durchspielen
* mobile Bedienung bleibt einfach
* keine Host-/Display-Funktionen in Player-App

---

## Phase 6 – Fragen, Shuffle, Erklärungen

### Ziel

Quiz-Inhalt verbessern.

### Änderungen

* `explanation?: string`
* Fragen prüfen
* schlechte Fragen verbessern
* neue gute Fragen ergänzen
* Shuffle ohne Wiederholung
* Tests ergänzen

### Abnahmekriterien

* keine doppelten Fragen innerhalb eines Spiels
* alle Frage-IDs eindeutig
* alle richtigen Antworten konsistent
* Reveal zeigt Erklärung
* Tests grün

---

## Phase 7 – Domain-/Cloudflare-Test

### Ziel

System über Domain erreichbar machen.

### Erste empfohlene Variante

Cloudflare Tunnel oder Frontends auf Pages + Backend per Tunnel/VPS.

### URLs

```text
tv.deine-domain.de
host.deine-domain.de
play.deine-domain.de
api.deine-domain.de
```

### Abnahmekriterien

* Host öffnet Raum über Domain
* TV verbindet sich über Display-Link
* Player scannt QR und joint
* WebSocket läuft über `wss://api...`
* kompletter Durchlauf mit echten Handys funktioniert

---

## Phase 8 – End-to-End-Test

### Testsetup

* 1 Host-Gerät
* 1 TV/Laptop als Display
* mindestens 2 Handys als Player
* Domain-URLs
* echtes WLAN/Mobilnetz testen

### Testablauf

```text
1. Host öffnet host.domain.de
2. Host erstellt Raum
3. TV öffnet tv.domain.de mit Display-Link
4. Spieler scannen QR
5. Spiel startet
6. alle Fragetypen testen
7. Antwortabgabe testen
8. Reveal + Erklärung prüfen
9. Scoreboard prüfen
10. Reconnect Player testen
11. Reconnect Display testen
12. Reconnect Host testen
13. Spiel beenden
```

### Abnahmekriterien

* keine Abstürze
* keine falschen Rollenrechte
* keine doppelten Fragen
* keine toten QR-Links
* keine WebSocket-Probleme
* verständliche UI auf allen Geräten

---

# 10. Risiken

## 10.1 Session-Verdrängung

Wenn Host und Display versehentlich dieselbe Session nutzen, kann ein Gerät das andere rauswerfen.

### Gegenmaßnahme

Display bekommt eigene Session und eigenen Token.

---

## 10.2 Zu großer Parallelumbau

Nicht gleichzeitig machen:

* 3 UIs
* Cloudflare
* Fragenkatalog
* Animationen
* Durable Objects
* neue Spielmodi

### Gegenmaßnahme

Phasen strikt einhalten.

---

## 10.3 WebSocket-URL falsch

Player scannt QR, aber verbindet sich mit `localhost`.

### Gegenmaßnahme

Explizite Env-Variable:

```env
VITE_SERVER_SOCKET_URL=wss://api.deine-domain.de
```

---

## 10.4 Display bekommt Steuerrechte

TV darf kein Host sein.

### Gegenmaßnahme

Serverseitig erzwingen:

```text
display darf keine host events senden
```

---

## 10.5 Overengineering

Das Projekt soll ein gutes Quiz bleiben, kein SaaS-Kahoot-Klon.

### Gegenmaßnahme

Keine Accounts, keine Datenbank, keine Admin-Plattform, kein unnötiger Editor im ersten Umbau.

---

# 11. Konkrete Reihenfolge

## Reihenfolge für Agentenarbeit

```text
1. Architekturplan erstellen
2. Serverrollen und Protokoll planen
3. Serverrollen implementieren
4. Display-App minimal bauen
5. Host-App zum Controller umbauen
6. Player-App anpassen
7. Fragen/Shuffle/Explanation umsetzen
8. Domain-/Cloudflare-Setup vorbereiten
9. End-to-End testen
10. Feinschliff/Animationen
```

Wichtig:

**Feinschliff erst ganz am Ende.**
Animationen auf einem kaputten Rollenmodell sind nur Glitzer auf einem Unfall.

---

# 12. Agent-Prompt für Phase 1

```text
Du arbeitest im Repo geburtstagsquiz.

Ziel:
Erstelle einen konkreten Umbauplan für die Umstellung von der aktuellen Host/Player-Struktur auf eine saubere 3-UI-Webarchitektur über eigene Domain.

Zielarchitektur:
1. TV / Display UI: nur öffentliche Anzeige
2. Host UI / Controller: Spielsteuerung
3. Player UI: Mitspieler-Handys
4. API / WebSocket Backend

Gewünschte Domainstruktur:
- tv.<domain>      → Display UI
- host.<domain>    → Host Controller
- play.<domain>    → Player UI
- api.<domain>     → WebSocket/API

Prüfe im Repo:
- apps/web-host
- apps/web-player
- apps/server
- packages/shared-types
- packages/shared-protocol
- packages/quiz-engine
- aktuelle Session-/Reconnect-Logik
- aktuelle URL-/Env-Logik
- aktuelle Game-/Question-Payloads

Bewerte:
- welche Teile der aktuellen Host-UI zur Display-UI gehören
- welche Teile zur Host-Controller-UI gehören
- welche Serverrollen ergänzt werden müssen
- welche Events/Payloads angepasst werden müssen
- wie Display read-only bleibt
- wie Host und Display gleichzeitig verbunden bleiben können
- wie Player unverändert oder minimal angepasst weiterläuft
- wie Reconnect für host/display/player funktionieren soll
- wie QR-Code und Domain-URLs aufgebaut werden sollen
- welche Deployment-Variante zuerst sinnvoll ist:
  A) Cloudflare Tunnel
  B) Cloudflare Pages + Node Backend
  C) Cloudflare Pages + Worker/Durable Objects

Ergebnis:
Erstelle einen gestuften Plan mit Phasen:
1. Architektur/Dokumentation
2. Serverrollen/Protokoll
3. Display-App
4. Host-Controller-App
5. Player-UI-Anpassungen
6. Fragen/Shuffle/Explanation
7. Domain/Cloudflare Deployment
8. End-to-End-Test

Für jede Phase angeben:
- Ziel
- betroffene Dateien
- technische Änderungen
- Risiken
- Tests
- Abnahmekriterien

Wichtig:
Noch nichts umsetzen. Keine Codeänderungen. Erst Plan erstellen und auf mein Go warten.
Bewerte kritisch und praktisch. Ziel ist ein stabiles, über Domain erreichbares Quiz, kein überdimensioniertes SaaS-Projekt.
```

---

# 13. Kurzfazit

Die 3-UI-Aufteilung ist jetzt sinnvoll, weil genug Zeit vorhanden ist.

Die richtige Zielstruktur ist:

```text
TV Display    → nur Anzeige
Host UI       → Steuerung
Player UI     → Antworten
API/WebSocket → zentrale Wahrheit
```

Die wichtigste technische Änderung ist nicht das Design, sondern:

```text
display als eigene Rolle mit eigener Session
```

Danach können UI, Fragen, Shuffle und Domain-Betrieb sauber darauf aufbauen.

Nicht direkt mit Cloudflare anfangen. Erst lokal sauber trennen, dann über Domain veröffentlichen.

```
```


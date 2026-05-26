# Konzept

## Ziel

Ein browserbasiertes Privatquiz fuer Gruppen mit getrennten Rollen:

- **Display/TV**
  - Lobby
  - Player-QR und Raumcode
  - Fragen
  - Timer
  - Aufloesung
  - Rangliste

- **Host-Controller**
  - Raum-Erstellung
  - Display-Popout
  - Player-Link und Player-QR
  - Spielstart
  - Lobby-Einstellungen
  - Fortschritt und Verbindungsstatus
  - manuelle Fallbacks

- **Player-Handys**
  - Beitritt
  - Namenseingabe
  - Antwort-Controller
  - Status und eigener Punktestand
  - Bereitschaft fuer naechste Frage

- **Server/API**
  - Raum- und Sessionverwaltung
  - WebSocket-Protokoll
  - Timer
  - Antwortannahme
  - Auswertung und Scoreboard

## Standard-Ablauf

1. Host oeffnet `apps/web-host`.
2. Host erstellt einen Raum.
3. Server erzeugt Room-ID, Join-Code, Host-Session und Display-Kopplungstoken.
4. Host zeigt Raumcode, Player-Link, Player-QR und Display-Status.
5. Host oeffnet das Display als Popout fuer den HDMI-TV.
6. Display verbindet sich automatisch mit dem Raum.
7. Spieler scannen den Player-QR oder geben den Join-Code ein.
8. Server aktualisiert die Lobby live fuer Display, Host und Player.
9. Host startet das Spiel.
10. Display zeigt die Frage, Player antworten ueber Handys.
11. Server wertet aus.
12. Display, Host und Player sehen die Aufloesung; alle 5 echten Fragen folgt zusaetzlich die Rangliste.
13. Player melden sich im Reveal und auf der Rangliste bereit fuer die naechste Frage.

## Lokales Betriebsmodell

| Service | Port | Zweck |
| --- | --- | --- |
| `apps/server` | `3001` | WebSocket/API-Backend |
| `apps/web-display` | `5175` | Display/TV |
| `apps/web-host` | `5173` | Host-Controller |
| `apps/web-player` | `5174` | Player-UI |

## Ziel-Subdomains

- `tv.quiz.disaai.de`
- `host.quiz.disaai.de`
- `play.quiz.disaai.de`
- `api.quiz.disaai.de`

Diese Subdomains sind nur fuer den spaeteren Tunnelbetrieb gedacht. `disaai.de`, `www.disaai.de` und bestehende Disa-AI-Deployments bleiben unberuehrt.

## Anforderungen

### Was das Projekt sein soll

- schnell lokal startbar
- ohne App-Installation nutzbar
- mobil bedienbar
- stabil fuer eine kleine Gruppe
- klarer Ablauf fuer einen Abend
- serverseitige Wahrheit fuer Timer, Antworten und Punkte

### Was es nicht sein soll

- kein SaaS
- kein Account-System
- keine Plattform fuer viele Events
- keine Cloud-Persistenz
- kein Adminsystem
- keine neue Datenbank
- keine Durable Objects
- keine ueberladene Modus-Sammlung

## Kommunikationsprinzip

### Display -> Server

- Display mit Host-Raum verbinden
- Raum erstellen nur als versteckter Fallback
- Verbindung wieder aufnehmen

### Host -> Server

- Raum erstellen
- Host koppeln nur als versteckter Legacy-Fallback
- Spiel starten
- Lobby-Einstellungen setzen
- manuell weiterschalten, falls noetig
- Raum schliessen

### Player -> Server

- Raum beitreten
- Antwort absenden
- bereit fuer naechste Frage melden
- Verbindung wieder aufnehmen

### Server -> Clients

- Lobby-Updates
- vollstaendige Frage an Display und Host
- reduzierte Controller-Daten an Player
- Timerstatus
- Antwort bestaetigt oder abgelehnt
- Rundenende
- Auswertung
- Rangliste

## Erfolgskriterien

### Funktional

- Join in wenigen Sekunden
- Display, Host und Player verbinden sich mit demselben Raum
- mehrere Spieler gleichzeitig stabil
- Antworten kommen zuverlaessig an
- Display aktualisiert sich live
- Timer und Rundenstatus bleiben sauber

### UX

- Display ist aus Distanz lesbar
- Host-Controller ist ruhig und eindeutig
- Handy ist im Kernfluss einfach bedienbar
- keine Erklaerung langer als der Join-Code noetig

### Technisch

- Server bleibt authoritative
- keine doppelte Spiellogik
- saubere Event-Architektur
- nachvollziehbares State-Handling
- keine Secrets oder produktiven Cloudflare-Aenderungen im Repo

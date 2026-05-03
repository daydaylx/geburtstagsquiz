# Konzept

## Ziel

Ein browserbasiertes Geburtstagsquiz fuer Gruppen mit getrennten Rollen:

- **Display/TV**
  - Lobby
  - Host- und Player-QRs
  - Fragen
  - Timer
  - Aufloesung
  - Rangliste

- **Host-Controller**
  - Host-Kopplung
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

1. Display/TV oeffnet `apps/web-display`.
2. Display erstellt einen Raum.
3. Server erzeugt Room-ID, Join-Code, Display-Session und Host-Token.
4. Display zeigt Host-QR und Player-QR.
5. Host koppelt sich ueber die Host-UI mit dem Raum.
6. Spieler scannen den Player-QR oder geben den Join-Code ein.
7. Server aktualisiert die Lobby live fuer Display, Host und Player.
8. Host startet das Spiel.
9. Display zeigt die Frage, Player antworten ueber Handys.
10. Server wertet aus.
11. Display, Host und Player sehen die Aufloesung; alle 5 echten Fragen folgt zusaetzlich die Rangliste.
12. Player melden sich im Reveal und auf der Rangliste bereit fuer die naechste Frage.

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

- Raum erstellen
- Verbindung wieder aufnehmen

### Host -> Server

- Host koppeln
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

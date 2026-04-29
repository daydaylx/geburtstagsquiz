# architecture.md

# Geburtstagsquiz - pragmatische Architektur

## Zweck

Dieses Repo ist fuer ein privates browserbasiertes Geburtstagsquiz an einem Abend gedacht.

Es ist bewusst nicht gedacht als:

- Produktarchitektur
- Plattform fuer mehrere Anwendungsfaelle
- langfristig ausbaubares Quiz-System
- Uebung in Skalierung, Persistenz oder Infrastruktur

Die Architektur soll nur eines leisten: Display/TV, Host, Player und Server lokal stabil zusammenspielen lassen.

## Aktuelles Betriebsmodell

- ein Node-Server als WebSocket/API-Backend
- ein Display/TV-Browser fuer Publikum, QR-Codes, Fragen, Reveal und Scoreboard
- ein Host-Controller im Browser fuer Spielleitung, Start, Einstellungen und Fallbacks
- mehrere Spieler auf Handys im Browser
- ein vorgeladener Fragenkatalog
- In-Memory-Zustand waehrend der Laufzeit

Praktische Folge:

- Wenn der Server neu startet, ist der Raum weg.
- Persistenz ueber den Abend hinaus ist nicht vorgesehen.
- Mehrere Raeume sind kein Designziel. Wenn die Basis das technisch zulaesst, ist das ein Nebeneffekt, kein Fokus.

## Services

| Service | Aufgabe | Lokaler Port | Ziel-Subdomain |
| --- | --- | --- | --- |
| `apps/server` | Raum, Sessions, Timer, Antwortannahme, Auswertung, Scoreboard | `3001` | `api.quiz.disaai.de` |
| `apps/web-display` | Display/TV fuer Lobby, QR-Codes, Fragen, Reveal, Scoreboard | `5175` | `tv.quiz.disaai.de` |
| `apps/web-host` | Host-Controller fuer Spielleitung und manuelle Fallbacks | `5173` | `host.quiz.disaai.de` |
| `apps/web-player` | Smartphone-UI fuer Join, Antworten und Bereitschaft | `5174` | `play.quiz.disaai.de` |

## Kernregeln

### 1. Der Server bleibt authoritative

Der Server entscheidet ueber:

- Raumstatus
- aktive Frage
- Timer
- Antwortannahme
- Punkte
- Rangliste

Display, Host und Player sind fuer Anzeige, Eingabe und bestaetigendes Feedback da.

### 2. Display, Host und Player bleiben duenne Clients

Die Display/TV-UI:

- erstellt den primaeren Raum ueber `display:create-room`
- zeigt Host-QR und Player-QR
- zeigt oeffentliche Lobby, Fragen, Aufloesung, Rangliste und Endstand
- ist keine Spielwahrheit

Die Host-UI:

- verbindet sich per Host-Token mit dem Display-Raum
- steuert Spielstart, Lobby-Einstellungen und manuelle Fallbacks
- zeigt Status, Fortschritt und Spieleruebersicht
- bekommt fuer Kontrolle und Fallbacks vollstaendige Fragedaten
- ist keine Spielwahrheit

Die Player-UI:

- joint den Raum per Code oder QR
- zeigt den Spielerstatus
- dient waehrend aktiver Fragen als Antwort-Controller
- bekommt fuer aktive Fragen nur reduzierte Controller-Daten
- bestaetigt Versand, Ergebnis und Bereitschaft fuer die naechste Frage

### 3. Shared-Pakete nur fuer reale gemeinsame Logik nutzen

Die vorhandene Aufteilung in `shared-types`, `shared-protocol`, `shared-utils` und `quiz-engine` ist okay, solange sie konkrete Doppelungen vermeidet.

Sie ist kein Auftrag, noch mehr Schichten zu erfinden.

### 4. Scope klein halten

Relevant ist genau der Flow:

1. Display-Raum erstellen
2. Host koppeln
3. Spieler joinen
4. Lobby sehen
5. Spiel starten
6. Frage anzeigen
7. Antworten einsammeln
8. Reveal und Punkte zeigen
9. Naechste Frage oder Endstand

Alles darueber hinaus ist optional und fuer dieses Repo nicht vorrangig.

## Bestehende Repo-Bausteine

### `apps/server`

- Raumverwaltung
- Display-, Host- und Player-Sessions
- Grace-Handling bei Disconnect
- serverseitiger Timer
- Antwortannahme
- Auswertung
- Score-Updates

### `apps/web-display`

- Display/TV-Screen
- Raum erstellen
- Host- und Player-QRs
- Lobby fuer Publikum
- Frageansicht
- Aufloesung
- Rangliste
- Spielende

### `apps/web-host`

- Host-Controller
- Host-Token-Kopplung
- persistente Steueransicht fuer Status, Fortschritt und Spieler
- lokale Vorbereitung fuer Kategorien/Rundenplan
- Lobby-Einstellung fuer Antworttexte auf Player-Geraeten
- Spielstart und manuelle Fallbacks

### `apps/web-player`

- Join-Flow
- Lobbyansicht
- Antwortbildschirm
- Antwortstatus
- Ergebnis, Rangliste und Bereitschaft fuer naechste Frage

### `packages/shared-types`

- gemeinsame Typen und Enums

### `packages/shared-protocol`

- Eventnamen
- Envelope-Format
- Zod-Schemas fuer Payloads

### `packages/shared-utils`

- kleine gemeinsame Helfer

### `packages/quiz-engine`

- Auswertung der vorbereiteten Fragetypen
- Scoreboard-Berechnung

## Datenfluss

### Display -> Server

- `display:create-room`
- `connection:resume`

### Host -> Server

- `host:connect`
- `connection:resume`
- `room:settings:update`
- `game:start`
- `game:next-question` als Host-Override nach der Rangliste
- `question:force-close`
- `game:show-scoreboard`
- `game:finish-now`
- `player:remove`
- `room:close`

### Player -> Server

- `room:join`
- `connection:resume`
- `answer:submit`
- `next-question:ready`

### Server -> relevante Clients

- Verbindungsbestaetigung
- Fragenkatalog fuer Host-Spielplaene
- Display-/Host-Kopplung
- Lobby-Snapshots
- Spielstart
- optionaler Frage-Countdown
- Display-/Host-Frage, Player-Controller und Timer
- Antwortbestaetigung oder Ablehnung
- Aufloesung
- Score-Update
- Bereit-Fortschritt fuer die naechste Frage
- Spielende
- Raumschluss

## Zustand und Reconnect

- Der Raumzustand lebt im Server-Speicher.
- Ein Player bleibt nach Disconnect aktuell `30s` erhalten.
- Das Display bekommt aktuell `45s` Grace-Zeit.
- Der Host bekommt aktuell `5min` Grace-Zeit.
- Wenn diese Fristen verstreichen, wird aufgeraeumt oder der Raum geschlossen.

Wichtig:

- Reconnect ist als praktische Absicherung gegen WLAN-Aussetzer gedacht.
- Reconnect ist keine Einladung, komplexe Pause-, Resume- oder Recovery-Systeme zu bauen.
- Der Server kann beim Resume einen brauchbaren Snapshot fuer Lobby, aktive Frage, Reveal, Rangliste oder Endstand schicken.
- Display- und Host-Snapshots enthalten vollstaendige Fragedaten, Player-Snapshots bleiben Controller-Payloads.
- Das bleibt bewusst pragmatisch: genug fuer kurze Aussetzer an einem Abend, nicht als grosses Recovery-System.

## Cloudflare- und Domainmodell

Cloudflare Tunnel ist optional und verbindet feste Subdomains mit lokal laufenden Diensten:

- `tv.quiz.disaai.de` -> `localhost:5175`
- `host.quiz.disaai.de` -> `localhost:5173`
- `play.quiz.disaai.de` -> `localhost:5174`
- `api.quiz.disaai.de` -> `localhost:3001`

`disaai.de`, `www.disaai.de` und bestehende Disa-AI-Deployments sind nicht Teil dieser Architekturarbeit.

## Was ausdruecklich nicht Teil der Zielarchitektur ist

- Accounts oder Profile
- Cloud-Persistenz
- Datenbankeinbau ohne akuten Anlass
- Durable Objects
- Monitoring- und Cluster-Architektur
- Multi-Tenant- oder Admin-Systeme
- komplexe Zusatzmodi als Architekturziel
- Editor- und Import-Plattformen

## Schluss

Die Architektur dieses Repos muss nicht gross wirken. Sie muss nur fuer einen Abend funktionieren.

Wenn eine technische Idee mehr Strukturkosten als Abendnutzen erzeugt, ist sie hier fehl am Platz.

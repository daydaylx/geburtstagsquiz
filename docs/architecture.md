# architecture.md

# Geburtstagsquiz - pragmatische Architektur

## Zweck

Dieses Repo ist fuer ein privates browserbasiertes Geburtstagsquiz gedacht.

Es ist bewusst nicht gedacht als:

- Produktarchitektur
- Plattform fuer mehrere Anwendungsfaelle
- langfristig ausbaubares Quiz-System
- Uebung in Skalierung, Persistenz oder Infrastruktur

Die Architektur soll nur eines leisten: einen Quiz-Abend stabil durchziehen.

## Betriebsmodell fuer den Abend

- ein Node-Server
- ein Host im Browser auf Laptop oder TV
- mehrere Spieler auf Handys im Browser
- ein vorgeladener Fragenkatalog
- In-Memory-Zustand waehrend der Laufzeit

Praktische Folge:

- Wenn der Server neu startet, ist der Raum weg.
- Persistenz ueber den Abend hinaus ist nicht vorgesehen.
- Mehrere Raeume sind kein Designziel. Wenn die Basis das technisch zulaesst, ist das ein Nebeneffekt, kein Fokus.

## Kernregeln

### 1. Der Server bleibt authoritative

Der Server entscheidet ueber:

- Raumstatus
- aktive Frage
- Timer
- Antwortannahme
- Punkte
- Rangliste

Die Clients sind fuer Anzeige, Eingabe und bestaetigendes Feedback da.

### 2. Host und Player bleiben duenne Clients

Der Hostscreen:

- erstellt den Raum
- zeigt QR und Join-Code
- zeigt persistent Status, Fortschritt und Spieleruebersicht
- startet das Spiel
- zeigt Fragen, Aufloesung und Rangliste

Die Player-UI:

- joint den Raum
- zeigt den Spielerstatus
- dient waehrend aktiver Fragen als Antwort-Controller
- bekommt fuer aktive Fragen nur reduzierte Controller-Daten
- nimmt Antworten entgegen
- bestaetigt Versand und Ergebnis

Keiner der Clients ist die Wahrheitsquelle fuer Spielentscheidungen.

Praktisch fuer die Host-UI:

- Die Host-Oberflaeche darf eine lokale Kategorievorbereitung zeigen.
- Solange Kategorien noch nicht serverseitig verdrahtet sind, bleiben sie klar als Vorbereitung markiert.
- Echte Fortschrittszahlen wie aktuelle Frage und Gesamtfragen kommen vom Server.

### 3. Bestehende Shared-Pakete nur nutzen, nicht ausbauen

Die vorhandene Aufteilung in `shared-types`, `shared-protocol`, `shared-utils` und `quiz-engine` ist okay, solange sie konkrete Doppelungen vermeidet.

Sie ist kein Auftrag, noch mehr Schichten zu erfinden.

### 4. Scope klein halten

Relevant ist genau der Flow:

1. Raum erstellen
2. joinen
3. Lobby sehen
4. Spiel starten
5. Frage anzeigen
6. Antworten einsammeln
7. Punkte zeigen
8. Rangliste zeigen

Alles darueber hinaus ist optional und fuer dieses Repo nicht vorrangig.

## Bestehende Repo-Bausteine

### `apps/web-host`

- Hostscreen
- Raum erstellen
- Lobby
- persistente Steueransicht fuer Status, Fortschritt und Spieler
- lokale Vorbereitung fuer Kategorien/Rundenplan
- Frageansicht
- Aufloesung
- Rangliste
- Spielende

### `apps/web-player`

- Join-Flow
- Lobbyansicht
- Antwortbildschirm
- Antwortstatus
- Ergebnis und Rangliste

### `apps/server`

- Raumverwaltung
- Sessions
- Grace-Handling bei Disconnect
- serverseitiger Timer
- Antwortannahme
- Auswertung
- Score-Updates

### `packages/shared-types`

- gemeinsame Typen und Enums

### `packages/shared-protocol`

- Eventnamen
- Envelope-Format
- zod-Schemas fuer Payloads

### `packages/shared-utils`

- kleine gemeinsame Helfer

### `packages/quiz-engine`

- Auswertung der vorbereiteten Fragetypen
- Scoreboard-Berechnung

## Datenfluss

### Host -> Server

- `room:create`
- `game:start`
- `game:next-question` dient als Host-Override nach der Rangliste
- `room:settings:update` fuer die Lobby-Option Antworttexte auf Handys
- `room:close`

### Player -> Server

- `room:join`
- `connection:resume`
- `answer:submit`
- `next-question:ready`

### Server -> alle relevanten Clients

- Lobby-Snapshots
- Spielstart
- Host-Frage, Player-Controller und Timer
- Antwortbestaetigung oder Ablehnung
- Aufloesung
- Score-Update
- Bereit-Fortschritt fuer die naechste Frage
- Spielende
- Raumschluss

## Zustand und Reconnect in der Praxis

- Der Raumzustand lebt im Server-Speicher.
- Ein Player bleibt nach Disconnect aktuell `30s` erhalten.
- Der Host bekommt aktuell `5min` Grace-Zeit.
- Wenn diese Fristen verstreichen, wird aufgeraeumt oder der Raum geschlossen.

Wichtig:

- Reconnect ist als praktische Absicherung gegen WLAN-Aussetzer gedacht.
- Reconnect ist hier keine Einladung, komplexe Pause-, Resume- oder Recovery-Systeme zu bauen.
- Der Server kann beim Resume inzwischen wieder einen brauchbaren Snapshot fuer Lobby, aktive Frage, Reveal, Rangliste oder Endstand schicken.
- Host-Snapshots enthalten den vollstaendigen Fragetext, Player-Snapshots bleiben Controller-Payloads.
- Das bleibt bewusst pragmatisch: genug fuer kurze Aussetzer an einem Abend, nicht als grosses Recovery-System.

## Was ausdruecklich nicht Teil der Zielarchitektur ist

- Accounts oder Profile
- Cloud-Persistenz
- Datenbankeinbau ohne akuten Anlass
- Monitoring- und Cluster-Architektur
- Multi-Tenant- oder Admin-Systeme
- komplexe Zusatzmodi als Architekturziel
- Editor- und Import-Plattformen

## Schluss

Die Architektur dieses Repos muss nicht gross wirken. Sie muss nur fuer einen Abend funktionieren.

Wenn eine technische Idee mehr Strukturkosten als Abendnutzen erzeugt, ist sie hier fehl am Platz.

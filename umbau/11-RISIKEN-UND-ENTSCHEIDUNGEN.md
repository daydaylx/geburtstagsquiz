# 11 - Risiken und Entscheidungen

## Kritische Bewertung des Konzepts

Das Konzept ist sinnvoll. Die Trennung in TV/Display, Host Controller und Player loest ein echtes Problem: Die aktuelle Host-App ist gleichzeitig Buehne und Steuerpult. Fuer einen Abend mit TV und Host-Handy ist das unpraktisch.

Die wichtigste technische Aenderung ist aber nicht die neue Display-App. Der Kern ist:

```text
display als eigene Rolle mit eigener Session und read-only Rechten
```

Ohne diese Basis waere eine neue UI nur Fassade und koennte Rollen-/Reconnect-Probleme verdecken.

## Wichtigste technische Risiken

### 1. Session-Verdraengung

Risiko:

- Display und Host teilen versehentlich eine Session.
- `attachSocketToSession` schliesst dann das falsche Geraet.

Entscheidung:

- Display bekommt eigene Session und eigenen Token.
- Display darf nie `hostSessionId` verwenden.

### 2. Broadcast-Leaks

Risiko:

- Player bekommt volle Frage.
- Display bekommt Steuer- oder private Playerdaten.
- Host bekommt nicht mehr genug Status.

Entscheidung:

- Broadcasts werden explizit nach Host, Display und Player getrennt.
- Jedes Event wird bewusst einer Zielgruppe zugeordnet.

### 3. Reconnect-Snapshot

Risiko:

- `syncSessionToRoomState` ist gross und zustandsabhaengig.
- Display-Reconnect im Reveal oder Scoreboard kann falsche Reihenfolge von Events bekommen.

Entscheidung:

- Display-Snapshot-Regeln pro GameState testen.
- Keine neue Recovery-Architektur bauen, nur aktuellen Snapshot sauber liefern.

### 4. Domain vor lokaler Stabilitaet

Risiko:

- Cloudflare/WSS-Probleme verschleiern lokale Rollenfehler.

Entscheidung:

- Erst lokal 3 UIs.
- Dann Cloudflare Tunnel.
- Danach optional Pages + Node Backend.

### 5. Fragenarbeit als Ablenkung

Risiko:

- Katalogarbeit wird zur Massenproduktion und verdrangt Architekturfixes.

Entscheidung:

- Fragen/Shuffle erst nach Rollen/UI-Trennung.
- Qualitaetsreview statt Menge.

### 6. Overengineering

Risiko:

- Aus dem Abendquiz wird eine Plattform.

Entscheidung:

- Keine Accounts.
- Keine Datenbank.
- Keine Adminplattform.
- Keine Durable Objects im ersten Umbau.
- Keine neuen Spielmodi waehrend Architekturumbau.

## Offene Entscheidungen

### Display-Token-Laenge

Empfehlung:

- Kryptografisch zufaellige UUID oder ausreichend langes URL-safe Token.
- Nicht den Join-Code wiederverwenden.

### Ein oder mehrere Displays

Empfehlung:

- Ein Display.
- Mehrere Displays erst bei echtem Bedarf.

### Display-Grace-Zeit

Empfehlung:

- 30s bis 60s.
- Display-Timeout schliesst Raum nicht.

### Zielverteilung fuer Fragen

Empfehlung:

- Erst nach UI-Trennung entscheiden.
- Vorschlag: 12 MC, 5 Estimate, 4 Logic, 3 Ranking, 3 Majority, 3 OpenText.

### Domainvariante

Empfehlung:

- Zuerst Cloudflare Tunnel.
- Spaeter Pages + Node Backend.
- Durable Objects verschieben.

## Empfohlene Reihenfolge

1. Serverrollen/Protokoll.
2. Display-App.
3. Host Controller.
4. Player-Wording/kleine Anpassungen.
5. Fragenmix.
6. Domain/Cloudflare.
7. End-to-End-Test.

## Riskanteste Phase

Phase 2 ist am riskantesten: Serverrollen, Sessions, Reconnect und Broadcasts. Wenn diese Phase falsch wird, koennen alle UIs korrekt aussehen und trotzdem falsche Rechte oder falsche Snapshots haben.

## Erste Umsetzungsphase

Als erstes sollte Phase 2 umgesetzt werden: Serverrollen/Protokoll. Danach kann die Display-App sauber gegen eine echte Rolle gebaut werden.

## Was verschoben werden sollte

- Cloudflare Pages.
- Durable Objects.
- Animationen.
- Neue Spielmodi.
- Fragen-Massenproduktion.
- Mehrere Displays.
- Admin-/Moderatorfunktionen.

## Cloudflare oder 3-UI-Trennung zuerst?

Eindeutig zuerst 3-UI-Trennung lokal.

Begruendung:

- Cloudflare loest kein Rollenproblem.
- Domainbetrieb macht Debugging schwerer.
- QR/WSS-Regeln koennen erst sauber getestet werden, wenn Host, Display und Player lokal klar getrennt sind.

## Dinge, die bewusst nicht gebaut werden sollen

- Accounts oder Profile.
- Login.
- Datenbank.
- Persistenz nach Serverneustart.
- Teams.
- Joker.
- Buzzer.
- Global Highscores.
- Adminsystem.
- Multi-Tenant-Betrieb.
- Durable Objects im ersten Umbau.
- UI-Animationen vor stabiler Architektur.

## Schlussentscheidung

Das Konzept ist fuer den Abend sinnvoll, wenn es streng phasenweise umgesetzt wird. Es wird riskant, sobald Serverrollen, UI-Umbau, Fragenarbeit und Cloudflare parallel laufen. Der praktische Weg ist klein: erst Rechte und Sessions, dann Anzeige, dann Controller, dann Domain.


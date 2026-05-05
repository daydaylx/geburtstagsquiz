# Geburtstagsquiz

Privates browserbasiertes Quiz fuer einen Geburtstag.

Dieses Repo ist kein Produkt, keine Plattform und kein langfristiges System. Ziel ist ein stabiler Ablauf fuer einen Abend:

- ein Display/TV fuer Publikum und QR-Codes
- ein Host-Controller fuer die Spielleitung
- mehrere Handys
- ein lokales WebSocket/API-Backend
- einfacher Join per Code oder QR
- Fragen auf dem Display/TV anzeigen
- Antworten einsammeln
- Punkte und Rangliste zeigen

## Wofuer dieses Repo da ist

- Host erstellt einen Raum
- Display/TV zeigt Host- und Player-QRs
- Spieler treten mit dem Handy bei
- Lobby aktualisiert sich live
- Host behaelt Status, Fortschritt, Einstellungen und Spieler in einer uebersichtlichen Steueransicht im Blick
- Host waehlt Preset oder freie Auswahl und startet das Abend-Quiz
- Handys dienen waehrend aktiver Fragen als Antwort-Controller
- Server nimmt Antworten an und wertet aus
- Display/TV zeigt Fragen, Aufloesung und Rangliste

## Wofuer dieses Repo nicht da ist

- kein SaaS
- keine Plattform fuer viele Einsaetze
- keine Accounts oder Profile
- keine Cloud-Persistenz ueber den Abend hinaus
- kein Admin- oder Moderationssystem
- keine komplexen Modi parallel
- kein Editor-Ausbau als Pflicht
- keine Infra- oder Skalierungsuebung

Wenn etwas technisch schoen klingt, aber fuer den Abend keinen direkten Nutzen hat, gehoert es nicht in den Fokus.

## Praktische Leitlinien

- Der Server bleibt die Wahrheit fuer Raumstatus, aktive Frage, Timer, gueltige Antworten und Punkte.
- Die Display-UI zeigt den oeffentlichen Spielzustand, berechnet aber nichts als Wahrheitsquelle.
- Die Host-UI steuert den Ablauf und sendet den finalen Spielplan an den Server; Kategorien, Fragetypen und Fragenanzahl wirken serverseitig.
- Die Player-UI bleibt einfach: joinen, antworten, Status sehen; waehrend aktiver Fragen ohne vollstaendigen Fragetext.
- Der Zustand lebt im Speicher. Wenn der Server neu startet, ist der Raum weg.
- Die bestehende Monorepo-Struktur darf bleiben, soll aber nicht weiter aufgeblasen werden.

## Repo-Struktur

```text
geburtstagsquiz/
|- apps/
|  |- server/       # Raum, Spielstatus, Timer, Auswertung
|  |- web-display/  # Display/TV-Screen fuer Publikum und QR-Codes
|  |- web-host/     # Host-Controller
|  `- web-player/   # Spieleroberflaeche auf dem Handy
|- packages/
|  |- quiz-engine/      # Auswertung und Score-Logik
|  |- shared-protocol/  # Eventnamen und Payload-Schemas
|  |- shared-types/     # Gemeinsame Typen
|  `- shared-utils/     # Kleine gemeinsame Helfer
`- docs/
   |- architecture.md
   |- event-protocol.md
   |- state-machine.md
   |- IMPLEMENTATION.md
   |- CONSTRAINTS.md
   `- GAME-RULES.md
```

## Schnellstart Lokal

Voraussetzungen:

- Node.js >= 20
- pnpm >= 9

```bash
corepack pnpm install
corepack pnpm dev
```

Danach laufen die vier Services standardmaessig hier:

- Server/Health: `http://localhost:3001/health`
- WebSocket direkt: `ws://localhost:3001`
- Display/TV: `http://localhost:5175`
- Host: `http://localhost:5173`
- Player: `http://localhost:5174`

Der Server-Dev-Start nutzt `node --watch --import tsx`, damit kein separater `tsx watch`-IPC-Server noetig ist. Falls du explizit die alte `tsx`-Watch-CLI testen willst:

```bash
corepack pnpm --filter @quiz/server run dev:tsx
```

Fuer den Abendbetrieb gibt es ein einheitliches Startskript (`quiz.sh`), das alte Projektprozesse sauber stoppt und dann Server, Display-UI, Host-UI und Player-UI startet:

```bash
./quiz.sh
```

Im Menue "Lokal" (localhost) oder "Tunnel" (quiz.disaai.de) waehlen. Ctrl+C stoppt alle Dienste sauber.

Fuer einen lokalen Protokoll-Smoke-Test bei laufendem Server:

```bash
corepack pnpm run smoke:local
```

Der Test erstellt einen Display-Raum, koppelt den Host, liest den Fragenkatalog, startet einen 90s-Spielplan, prueft Reveal-Bereitschaft, Scoreboard nach Frage 5, Endstand und Resume-Snapshots.

## Cloudflare Tunnel

Der Laptop bleibt der Server. Cloudflare Tunnel ist nur die oeffentliche Verbindung fuer feste Subdomains:

- `https://tv.quiz.disaai.de` -> `localhost:5175`
- `https://host.quiz.disaai.de` -> `localhost:5173`
- `https://play.quiz.disaai.de` -> `localhost:5174`
- `wss://api.quiz.disaai.de` -> `localhost:3001`

Die passenden Beispielwerte stehen in `.env.local.example` und `.env.tunnel.example`:

- lokal: `VITE_DISPLAY_URL=http://localhost:5175`, `VITE_HOST_URL=http://localhost:5173`, `VITE_PLAYER_JOIN_BASE_URL=http://localhost:5174`, `VITE_SERVER_SOCKET_URL=ws://localhost:3001`
- Tunnel: `VITE_DISPLAY_URL=https://tv.quiz.disaai.de`, `VITE_HOST_URL=https://host.quiz.disaai.de`, `VITE_PLAYER_JOIN_BASE_URL=https://play.quiz.disaai.de`, `VITE_SERVER_SOCKET_URL=wss://api.quiz.disaai.de`

Details stehen in `docs/DEPLOYMENT-CLOUDFLARE-TUNNEL.md`. Die Beispielconfig liegt in `deploy/cloudflare-tunnel.example.yml`; echte `.cloudflared/`-Configs und Credentials gehoeren nicht ins Repo.

Die Tunnel-Startskripte starten Cloudflare nur mit `CONFIRM_CLOUDFLARE_TUNNEL_START=1`. Ohne diese explizite lokale Bestaetigung brechen sie vor dem Tunnelstart ab.

## Quizfragen lokal reviewen

Das kleine Review-Tool laeuft lokal ohne Datenbank und ohne Login:

```bash
corepack pnpm run review:questions -- path/zur/fragen.json
```

Dann `http://127.0.0.1:4177` oeffnen. Alternativ kann der JSON-Pfad direkt in der UI geladen werden.

Das Original-JSON wird nicht veraendert. Der Review-Zustand wird als `review_state.json` neben der geladenen Fragen-Datei gespeichert:

```json
{
  "question_id": {
    "status": "keep",
    "note": "Kommentar"
  }
}
```

## Relevante Doku

- `docs/architecture.md` fuer die pragmatische Zielarchitektur
- `docs/DEPLOYMENT-CLOUDFLARE-TUNNEL.md` fuer lokalen Betrieb mit Cloudflare Tunnel
- `docs/event-protocol.md` fuer die aktiven WebSocket-Events
- `docs/state-machine.md` fuer die tatsaechlich genutzten Zustaende
- `docs/IMPLEMENTATION.md` fuer den realistischen Bau- und Testplan
- `docs/CONSTRAINTS.md` fuer Abendrisiken und bewusste Grenzen
- `docs/GAME-RULES.md` fuer den konkreten Spielablauf

## Aktueller Fokus

Dieses Repo soll ein brauchbares Geburtstagsquiz liefern, nicht eine ausbaubare Quiz-Plattform. Deshalb gilt:

- lieber wenige echte Spielplaene und eine praktische freie Auswahl als mehrere halbe Modi
- lieber In-Memory und einfache lokale Bedienung als Persistenz und Deploy-Theater
- lieber echte Tests auf Handy und gemeinsamem Bildschirm als Architektur-Rhetorik

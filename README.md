# Geburtstagsquiz

Privates browserbasiertes Quiz fuer einen Geburtstag.

Dieses Repo ist kein Produkt, keine Plattform und kein langfristiges System. Ziel ist ein stabiler Ablauf fuer einen Abend:

- ein Host
- ein gemeinsamer Bildschirm
- mehrere Handys
- einfacher Join per Code oder QR
- Fragen anzeigen
- Antworten einsammeln
- Punkte und Rangliste zeigen

## Wofuer dieses Repo da ist

- Host erstellt einen Raum
- Spieler treten mit dem Handy bei
- Lobby aktualisiert sich live
- Host startet ein Multiple-Choice-Quiz
- Server nimmt Antworten an und wertet aus
- Hostscreen zeigt Aufloesung und Rangliste

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
- Der Hostscreen steuert und zeigt an, berechnet aber nichts als Wahrheitsquelle.
- Die Player-UI bleibt einfach: joinen, antworten, Status sehen.
- Der Zustand lebt im Speicher. Wenn der Server neu startet, ist der Raum weg.
- Die bestehende Monorepo-Struktur darf bleiben, soll aber nicht weiter aufgeblasen werden.

## Repo-Struktur

```text
geburtstagsquiz/
|- apps/
|  |- server/       # Raum, Spielstatus, Timer, Auswertung
|  |- web-host/     # Hostscreen auf Laptop/TV
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

## Lokal starten

Voraussetzungen:

- Node.js >= 20
- pnpm >= 9

```bash
corepack pnpm install
corepack pnpm dev
```

Standard-URLs:

- Server: `ws://localhost:3001`
- Host: `http://localhost:5173`
- Player: `http://localhost:5174`

## Relevante Doku

- `docs/architecture.md` fuer die pragmatische Zielarchitektur
- `docs/event-protocol.md` fuer die aktiven WebSocket-Events
- `docs/state-machine.md` fuer die tatsaechlich genutzten Zustaende
- `docs/IMPLEMENTATION.md` fuer den realistischen Bau- und Testplan
- `docs/CONSTRAINTS.md` fuer Abendrisiken und bewusste Grenzen
- `docs/GAME-RULES.md` fuer den konkreten Spielablauf

## Aktueller Fokus

Dieses Repo soll ein brauchbares Geburtstagsquiz liefern, nicht eine ausbaubare Quiz-Plattform. Deshalb gilt:

- lieber ein sauberer Multiple-Choice-Ablauf als mehrere halbe Modi
- lieber In-Memory und einfache lokale Bedienung als Persistenz und Deploy-Theater
- lieber echte Tests auf Handy und gemeinsamem Bildschirm als Architektur-Rhetorik

# Quiz-Dual-Screen

Browserbasiertes Multiplayer-Quizspiel für Gruppen.

## Idee

- **Laptop / TV / Monitor** zeigt: Lobby, Fragen, Timer, Auflösung, Rangliste
- **Handys der Spieler** dienen für: Beitritt, Antworten, Buzzer, Joker

Ein Host startet auf dem Laptop ein Spiel. Spieler scannen per Handy einen QR-Code oder geben einen Raumcode ein. Antworten werden privat auf dem Handy abgegeben. Der gemeinsame Bildschirm zeigt den Ablauf für alle.

## Zielgruppe

Freunde, Familie, Spieleabend, kleine Events, später optional Schule / Team-Event.

## Anforderungen

- schnell startbar
- sofort verständlich
- ohne App-Installation nutzbar
- mobil bedienbar
- gruppentauglich
- klarer, sauberer Ablauf
- technisch stabil

## Stack

- **Frontend:** React, TypeScript, Vite
- **Backend:** Node.js, WebSockets
- **Monorepo:** pnpm workspaces
- **Validierung:** zod
- **Persistenz:** In-Memory (MVP), später optional Redis/Postgres

## Projektstruktur

```
quiz-dual-screen/
├─ apps/
│  ├─ web-host/          # Host-Oberfläche (Laptop/TV)
│  ├─ web-player/        # Player-Oberfläche (Handy)
│  └─ server/            # Zentrale Spiellogik
├─ packages/
│  ├─ shared-types/      # TypeScript-Typen
│  ├─ shared-protocol/   # Event-Definitionen
│  ├─ shared-utils/      # Helper & Validierung
│  └─ quiz-engine/       # Spielregeln & Punkteberechnung
└─ docs/
   ├─ CONCEPT.md         # Produktidee & Zielgruppe
   ├─ architecture.md    # Technisches Design (kanonisch)
   ├─ state-machine.md   # Zustandsmaschine
   ├─ event-protocol.md  # WebSocket-Protokoll
   ├─ GAME-RULES.md      # Spielmechaniken
   ├─ IMPLEMENTATION.md  # Phasenplan
   └─ CONSTRAINTS.md     # Probleme & Grenzen
```

## Wichtige Regel

**Der Server ist die einzige Wahrheit** für:

- Spielstatus
- aktuelle Runde
- Timer
- Antworten
- Punkte
- Buzzer-Reihenfolge

Keine clientseitige Hauptlogik für Spielentscheidungen.

## Lokales Setup

TODO: wird in Phase 0 ausgefüllt.

Voraussetzungen: Node.js ≥ 20, pnpm ≥ 9

```bash
pnpm install        # Dependencies installieren
pnpm dev            # Server + Host + Player starten
```

## Start-Leitfaden

1. Lies `docs/CONCEPT.md` – Produktidee & Zielgruppe
2. Lies `docs/architecture.md` – technisches Design (kanonisch)
3. Lies `docs/state-machine.md` – Zustände und Übergänge
4. Lies `docs/event-protocol.md` – WebSocket-Protokoll
5. Lies `docs/IMPLEMENTATION.md` – Phasenplan mit Abnahmekriterien
6. Lies `docs/CONSTRAINTS.md` – kritische Punkte und bewusstes Weglassen

## Was das Produkt sein soll

- schnell startbar
- sofort verständlich
- ohne App-Installation
- mobil bedienbar
- gruppentauglich
- klarer Ablauf

## Was es am Anfang nicht sein soll

- kein Account-System
- kein Shop
- keine Profile / XP / Battlepass
- kein Community-System
- keine überladene KI-Funktionalität
- kein 20-Modi-Monster
- keine Native-App-Pflicht

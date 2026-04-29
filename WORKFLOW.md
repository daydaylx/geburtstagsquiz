# WORKFLOW.md

## Zweck

Dieser Workflow beschreibt die praktische Arbeitsreihenfolge fuer Entwicklung, Review und Dokumentationspflege im Multi-Service-Geburtstagsquiz.

Das Ziel bleibt klein: Display/TV, Host, Player und Server muessen lokal stabil fuer einen Abend zusammenspielen. Tunnel und Domainbetrieb kommen erst danach.

## Empfohlene Reihenfolge

1. Repo pruefen.
2. Abhaengigkeiten installieren.
3. Services lokal starten.
4. Lokalen E2E-/Smoke-Test durchfuehren.
5. Typecheck, Tests und Build laufen lassen.
6. Erst danach Tunnel-/Domain-Themen pruefen.

Nicht mit Cloudflare, DNS oder Deployment beginnen, solange der lokale Ablauf nicht sauber ist.

## 1. Repo Pruefen

Vor Aenderungen:

```bash
git status --short
rg --files
```

Dann die konkret betroffenen Dateien lesen. Bei Projektsteuerung immer mindestens pruefen:

- `AGENTS.md`
- `WORKFLOW.md`
- `README.md`
- relevante Dateien in `docs/`
- `package.json`
- `.github/workflows/`, falls vorhanden
- `.env*.example`, falls Env-Verhalten betroffen ist
- `deploy/`, falls Tunnel-/Domainbetrieb betroffen ist

Fremde oder Nutzer-Aenderungen nicht zuruecksetzen. Wenn der Arbeitsbaum dirty ist, nur die fuer die Aufgabe noetigen Dateien anfassen.

## 2. Abhaengigkeiten Installieren

Voraussetzungen:

- Node.js `>=20`
- Corepack mit pnpm

Installation:

```bash
corepack pnpm install --frozen-lockfile
```

Wenn `node_modules` bereits vorhanden ist und keine Dependency-Dateien geaendert wurden, reicht normalerweise die bestehende Installation.

## 3. Services Lokal Starten

Standard fuer Entwicklung:

```bash
corepack pnpm dev
```

Lokale Services:

- Server/API: `http://localhost:3001`
- Display/TV: `http://localhost:5175`
- Host: `http://localhost:5173`
- Player: `http://localhost:5174`

Startreihenfolge, falls manuell gestartet wird:

1. `corepack pnpm --filter @quiz/server run dev`
2. `corepack pnpm --filter @quiz/web-display run dev`
3. `corepack pnpm --filter @quiz/web-host run dev`
4. `corepack pnpm --filter @quiz/web-player run dev`

Fuer den Abend-/Hotspotbetrieb:

```bash
./start_quiz.sh
```

Stoppen:

```bash
./stop_quiz.sh
```

## 4. Lokaler Smoke-Test

Bei laufendem Server:

```bash
corepack pnpm run smoke:local
```

Der Smoke-Test verbindet Display, Host und zwei Player, erstellt einen Raum, koppelt den Host, startet eine Runde, sendet Antworten, wartet auf Reveal und Scoreboard und prueft Resume-Snapshots.

Wenn der Smoke-Test nicht passt:

- erst lokale Ports und laufende Prozesse pruefen
- dann Serverlogs pruefen
- erst danach Code oder Doku anpassen
- nicht auf Tunnel/DNS ausweichen, um ein lokales Problem zu umgehen

## 5. Typecheck, Test, Build

Vor Abschluss:

```bash
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

CI soll dieselbe Reihenfolge nutzen:

1. install
2. typecheck
3. test
4. build

Wenn ein Befehl nicht ausgefuehrt werden kann, muss der Grund im Abschluss klar genannt werden.

## 6. Tunnel- und Domain-Themen

Erst bearbeiten, wenn der lokale Ablauf stabil ist.

Ziel-Mapping:

- `tv.quiz.disaai.de` -> `localhost:5175`
- `host.quiz.disaai.de` -> `localhost:5173`
- `play.quiz.disaai.de` -> `localhost:5174`
- `api.quiz.disaai.de` -> `localhost:3001`

Details:

- `docs/DEPLOYMENT-CLOUDFLARE-TUNNEL.md`
- `deploy/cloudflare-tunnel.example.yml`
- `.env.local.example`
- `.env.tunnel.example`

Ohne explizites `[CONFIRM]` sind verboten:

- Cloudflare-Tunnel erstellen
- DNS-Eintraege aendern
- Tunnel-Routen setzen
- Secrets setzen
- produktive Deployments veraendern

`disaai.de`, `www.disaai.de` und bestehende Disa-AI-Deployments sind tabu.

## Validierungscheckliste

- Display/TV laedt auf Port `5175`.
- Host-Controller laedt auf Port `5173`.
- Player-UI laedt auf Port `5174`.
- Server-Health antwortet auf Port `3001`.
- Display kann einen Raum erstellen.
- Host kann sich per Host-Token/QR mit dem Display-Raum koppeln.
- Player koennen per Join-Code oder QR beitreten.
- Eine Frage laeuft von Start ueber Antwort bis Reveal und Scoreboard durch.
- Server entscheidet Timer, Antwortannahme und Punkte.
- Doku nennt keine alte Zwei-Screen-Architektur als aktuellen Stand.
- Keine Secrets oder echten Cloudflare-Credentials wurden geschrieben.

## Umgang mit Fehlern

- Fehler zuerst lokal reproduzieren.
- Ursache von Symptom trennen.
- Kleine, gezielte Fixes bevorzugen.
- Keine neuen Features als Fehlerbehebung einschmuggeln.
- Wenn ein Test flakig oder blockiert ist, den genauen Befehl und die beobachtete Ausgabe dokumentieren.
- Bei Portkonflikten erst Projektprozesse sauber stoppen, nicht blind systemweite Prozesse killen.

## Umgang mit Git-Status

- `git status --short` vor und nach der Arbeit pruefen.
- Nur eigene Aenderungen beschreiben.
- Nutzer-Aenderungen nicht formatieren, verschieben oder zuruecksetzen.
- Keine grossen Refactors in Dokumentations- oder Workflow-Auftraegen.
- Commits und Pushes nur machen, wenn der Nutzer das ausdruecklich verlangt.

## Definition of Done

- Die geaenderten Dateien spiegeln die aktuelle Vier-Service-Architektur wider.
- Lokale Ports und Ziel-Subdomains sind konsistent dokumentiert.
- Der lokale Entwicklungs- und Validierungsweg ist klar.
- Typecheck, Tests und Build laufen oder bekannte Blocker sind benannt.
- Keine produktiven Cloudflare-, DNS- oder Deployment-Aenderungen wurden ohne Freigabe vorgenommen.
- Keine Feature-Expansion, kein UI-Redesign, keine Fragen- oder Spielmechanik-Aenderung wurde eingefuehrt.

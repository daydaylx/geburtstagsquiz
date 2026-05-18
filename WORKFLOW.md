# WORKFLOW.md

## Zweck

Dieser Workflow beschreibt die praktische Arbeitsreihenfolge fuer Entwicklung, Review und Dokumentationspflege im Multi-Service-Geburtstagsquiz.

Das Ziel bleibt klein: Display/TV, Host, Player und Server muessen fuer einen Abend stabil zusammenspielen. Der Abendbetrieb laeuft ueber den bestehenden Cloudflare Tunnel; die lokalen Ports sind nur Zielports hinter dem Tunnel.

## Empfohlene Reihenfolge

1. Repo pruefen.
2. Abhaengigkeiten installieren.
3. Abendbetrieb ueber `./quiz.sh` starten.
4. Smoke-Test durchfuehren.
5. Typecheck, Tests und Build laufen lassen.
6. Bei Domainproblemen lokale Zielports, Tunnel und Origins pruefen.

Keine Cloudflare-DNS-, Routing-, Secret- oder Deployment-Aenderungen ohne ausdrueckliche Freigabe durchfuehren.

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

## 3. Abendbetrieb Starten

Standard fuer den Abend:

```bash
./quiz.sh
```

Das Skript stoppt alte Projektprozesse, startet Server, Display, Host, Player und den bestehenden Cloudflare Tunnel. Der Host ist der Startpunkt unter `https://host.quiz.disaai.de`; dort Raum erstellen und "Display oeffnen" fuer den HDMI-TV nutzen. Ctrl+C stoppt alle gestarteten Prozesse sauber.

Manueller Dev-Start bleibt moeglich:

```bash
corepack pnpm dev
```

Interne Zielports:

- Server/API: `http://localhost:3001`
- Host: `http://localhost:5173`
- Display/TV: `http://localhost:5175`
- Player: `http://localhost:5174`

Startreihenfolge fuer manuelle Diagnose:

1. `corepack pnpm --filter @quiz/server run dev`
2. `corepack pnpm --filter @quiz/web-host run dev`
3. `corepack pnpm --filter @quiz/web-display run dev`
4. `corepack pnpm --filter @quiz/web-player run dev`

## 4. Smoke-Test

Bei laufendem Server:

```bash
corepack pnpm run smoke:local
SMOKE_WS_URL=wss://api.quiz.disaai.de corepack pnpm run smoke:local
```

Der Smoke-Test erstellt den Raum ueber den Host, verbindet das Display per Popout-Token, verbindet zwei Player, startet einen 90s-Spielplan, prueft Reveal-Bereitschaft, Scoreboard nach Frage 5, Endstand und Resume-Snapshots. Der versteckte Display-first Fallback wird kurz separat geprueft.

Wenn der Smoke-Test nicht passt:

- erst lokale Ports und laufende Prozesse pruefen
- dann Server- und Tunnel-Logs pruefen
- erst danach Code oder Doku anpassen

## 5. Lint, Typecheck, Test, Build

Vor Abschluss:

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

Alternativ als Sammelcheck:

```bash
corepack pnpm run validate
```

`validate` fuehrt dieselben vier Checks in derselben Reihenfolge aus. Die Einzelbefehle bleiben wichtig, wenn ein Fehler eingegrenzt werden muss.

CI soll dieselbe Reihenfolge nutzen:

1. install
2. lint
3. typecheck
4. test
5. build

Wenn ein Befehl nicht ausgefuehrt werden kann, muss der Grund im Abschluss klar genannt werden.

## 6. Tunnel- und Domain-Themen

Ziel-Mapping:

- `tv.quiz.disaai.de` -> `localhost:5175`
- `host.quiz.disaai.de` -> `localhost:5173`
- `play.quiz.disaai.de` -> `localhost:5174`
- `api.quiz.disaai.de` -> `localhost:3001`

Details:

- `docs/DEPLOYMENT-CLOUDFLARE-TUNNEL.md`
- `deploy/cloudflare-tunnel.example.yml`
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
- `https://api.quiz.disaai.de/health` antwortet ueber den Tunnel.
- `https://host.quiz.disaai.de`, `https://tv.quiz.disaai.de` und `https://play.quiz.disaai.de` laden.
- Host kann einen Raum erstellen.
- Host kann das Display per Button als Popout verbinden.
- Player koennen per Join-Code oder QR beitreten.
- Eine Frage laeuft von Start ueber Antwort bis Reveal durch; das Scoreboard erscheint nur nach faelligen 5er-Intervallen.
- Server entscheidet Timer, Antwortannahme und Punkte.
- Doku nennt keine alte Zwei-Screen-Architektur als aktuellen Stand.
- Keine Secrets oder echten Cloudflare-Credentials wurden geschrieben.

## Umgang mit Fehlern

- Fehler zuerst auf konkrete Verbindung eingrenzen: lokaler Zielport, Tunnel, Origin oder Browser.
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
- Lokale Zielports und Ziel-Subdomains sind konsistent dokumentiert.
- Der Tunnel-only Abendbetrieb ist klar.
- Typecheck, Tests und Build laufen oder bekannte Blocker sind benannt.
- Keine produktiven Cloudflare-, DNS- oder Deployment-Aenderungen wurden ohne Freigabe vorgenommen.
- Keine Feature-Expansion, kein UI-Redesign, keine Fragen- oder Spielmechanik-Aenderung wurde eingefuehrt.

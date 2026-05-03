# Praktischer Umsetzungs- und Pruefplan

## Ziel

Gebaut wird kein grosses Quiz-System, sondern ein funktionierendes Geburtstagsquiz fuer einen Abend.

Erfolg bedeutet:

- Display/TV kann einen Raum erstellen und QR-Codes anzeigen.
- Host kann sich mit dem Display-Raum koppeln.
- Spieler koennen einfach joinen.
- Fragen erscheinen vollstaendig auf dem Display/TV.
- Host sieht Status, Fortschritt und Fallback-Aktionen.
- Handys dienen als Antwort-Controller.
- Antworten werden serverseitig angenommen und ausgewertet.
- Punkte und Rangliste stimmen.
- der Ablauf bleibt auf echten Geraeten stabil genug.

## Lokale Basis

Sicherstellen:

- `corepack pnpm dev` startet Server, Display, Host und Player.
- Lokale Ports sind konsistent:
  - Server/API: `3001`
  - Display/TV: `5175`
  - Host: `5173`
  - Player: `5174`
- ein vorgeladenes Quiz ist verfuegbar.
- alle Frontends verbinden sich mit demselben Server.

Abnahme:

- `http://localhost:3001/health` antwortet.
- `http://localhost:5175` laedt.
- `http://localhost:5173` laedt.
- `http://localhost:5174` laedt.
- keine manuelle Nacharbeit an Ports oder Env ist fuer den Standardstart noetig.

## Primaerer Spielablauf

### 1. Display-Raum erstellen

Sicherstellen:

- Display sendet `display:create-room`.
- Server erstellt Raum, Join-Code, Display-Session und Host-Token.
- Display zeigt Host-QR und Player-QR.

Abnahme:

- Display zeigt einen Join-Code.
- Host-QR zeigt auf Host-UI.
- Player-QR zeigt auf Player-UI.

### 2. Host koppeln

Sicherstellen:

- Host verbindet sich per `host:connect`.
- Display erhaelt `display:host-paired`.
- Host sieht Raumstatus, Join-Code, Spieler und Einstellungen.

Abnahme:

- Host kann den vom Display erstellten Raum steuern.
- Kein zweiter Raum entsteht versehentlich.

### 3. Spieler joinen

Sicherstellen:

- Player joinen per QR oder Code.
- Lobby aktualisiert Display, Host und Player live.
- Disconnects werden sichtbar statt still ignoriert.

Abnahme:

- mehrere Handys koennen nacheinander joinen.
- alle Namen erscheinen sauber.
- Host und Display sehen, wer verbunden oder getrennt ist.

### 4. Eine Frage komplett durchziehen

Sicherstellen:

- Host startet das Spiel.
- Display und Host bekommen vollstaendige Fragedaten.
- Player bekommen nur Controller-Daten.
- Timer kommt vom Server.
- pro Spieler zaehlt nur eine Antwort.
- Player sehen Antwort angenommen oder abgelehnt.
- nach Schliessen der Frage folgt Reveal; Scoreboard folgt nur nach faelligen 5er-Intervallen.

Abnahme:

- eine komplette Frage laeuft ohne manuelle Eingriffe durch.
- spaete Antworten zaehlen nicht.
- doppelte Antworten veraendern den Spielstand nicht.
- unpassende Antworttypen werden nicht gespeichert.

### 5. Mehrere Fragen und Spielende pruefen

Sicherstellen:

- Server wechselt automatisch weiter, wenn alle verbundenen Spieler bereit sind.
- Host kann im Reveal oder nach der Rangliste manuell weiterschalten, falls ein Handy haengen bleibt.
- Scoreboard bleibt konsistent.
- letzte Frage fuehrt in einen Endstand.
- Raum kann am Ende sauber geschlossen werden.

Abnahme:

- kompletter Quizlauf geht durch.
- Rangliste wirkt plausibel.
- es gibt keinen haengenden Zwischenzustand nach der letzten Frage.

## Validierung

Bei laufendem Server:

```bash
corepack pnpm run smoke:local
```

Vor Abschluss:

```bash
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

Vor dem Geburtstag zusaetzlich:

- mindestens ein Test mit echten Handys.
- ein Test auf dem vorgesehenen Display/TV.
- ein Test mit Host-Controller auf dem vorgesehenen Geraet.
- bewusst pruefen: WLAN-Aussetzer, Doppelklicks, versehentliches Reload.
- vor dem Abend keinen unnoetigen Ausbau mehr anfangen.

## Tunnel- und Domainbetrieb

Erst nach lokal stabiler Validierung pruefen.

Ziel:

- `tv.quiz.disaai.de` -> Display/TV
- `host.quiz.disaai.de` -> Host-Controller
- `play.quiz.disaai.de` -> Player-UI
- `api.quiz.disaai.de` -> Server/API/WebSocket

Details stehen in `docs/DEPLOYMENT-CLOUDFLARE-TUNNEL.md`.

Keine echten Cloudflare-/DNS-Aktionen ohne `[CONFIRM]`. `disaai.de`, `www.disaai.de` und bestehende Disa-AI-Deployments bleiben unberuehrt.

## Was in diesem Plan bewusst nicht vorkommt

- keine Roadmap fuer weitere Modi
- keine Datenbankphase
- keine Durable Objects
- keine Cloud-Hosting-Architektur
- keine Editor-Plattform
- keine Teams, Joker oder Buzzer als Ausbaustufen

Wenn etwas vor dem Abend noch fehlt, gilt:

Erst den bestehenden Quizablauf verlaesslich machen. Nicht das naechste System anfangen.

## Entscheidungsregel fuer weitere Arbeit

Wenn eine geplante Aenderung nicht direkt einem dieser Punkte hilft,

- Display/TV
- Host-Kopplung
- Join
- Lobby
- Frage
- Antwort
- Score
- Stabilitaet auf echten Geraeten

dann ist sie fuer dieses Repo wahrscheinlich nicht dringlich.
